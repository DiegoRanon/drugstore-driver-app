/**
 * The one path from this app to `/v1`.
 *
 * Everything authenticated goes through `request`, which is what makes the
 * single-flight refresh in `refresh.ts` an actual guarantee rather than a
 * convention — a screen that called `fetch` directly would bypass the mutex
 * and could revoke the driver's token family (PRD §4.4).
 */
import { ApiError } from './errors';
import { API_BASE_URL, httpFetch, type ApiResponse, type HttpRequest } from './http';
import { newIdempotencyKey } from './idempotency';
import {
  endSession,
  getValidAccessToken,
  refreshAfterUnauthorized,
} from './refresh';
import type {
  BatchHandoverBody,
  BatchHandoverResponse,
  CoolerCheckBody,
  EtaBody,
  LoginBody,
  LoginResponse,
  MarkReadBody,
  MeResponse,
  MutatedStop,
  NotificationsResponse,
  OptimizeBody,
  OptimizeResponse,
  PaymentBody,
  PaymentException,
  PaymentResponse,
  PaymentTaken,
  QueueResponse,
  RegisterDriverBody,
  RegisterDriverResponse,
  ReturnBody,
  RouteEta,
  SequenceBody,
} from './types';
import {
  clearSession,
  loadSession,
  saveSession,
  sessionFromTokenPair,
} from '@/auth/token-store';

export { API_BASE_URL };
export type { ApiResponse } from './http';

/** An authenticated request: the token is this module's business, not yours. */
export type ApiRequest = Omit<HttpRequest, 'token'>;

/**
 * Authenticated call with the full response envelope.
 *
 * Use when the caller needs `requestId` for an error message or
 * `idempotentReplay` to tell a replayed write from a fresh one (Feature 5).
 */
export async function requestWithMeta<T>(
  path: string,
  request: ApiRequest = {},
): Promise<ApiResponse<T>> {
  const token = await getValidAccessToken();

  try {
    return await httpFetch<T>(path, { ...request, token });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    if (error.isTokenExpired) {
      // Our expiry check said the token was fine and the server disagreed — a
      // fast device clock, or a revocation landing between the two. Rotate
      // once and replay. Exactly once: a second 401 after a fresh token is a
      // real rejection, and looping on it would hammer the server.
      const refreshed = await refreshAfterUnauthorized(token);
      try {
        // Same body, same Idempotency-Key. The server fingerprints method +
        // URL + body, so this either replays the stored response or runs for
        // the first time — never double-writes.
        return await httpFetch<T>(path, { ...request, token: refreshed });
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.isTerminalAuthFailure) {
          await endSession(retryError);
        }
        throw retryError;
      }
    }

    if (error.isTerminalAuthFailure) {
      // Deactivated driver, or a revoked family. Wipe and go to sign-in; there
      // is no offline grace period for a revoked driver (PRD §4.5).
      await endSession(error);
    }

    throw error;
  }
}

/** Authenticated call, unwrapped to the payload. The common case. */
export async function request<T>(
  path: string,
  init: ApiRequest = {},
): Promise<T> {
  return (await requestWithMeta<T>(path, init)).data;
}

/* -------------------------------------------------------------------------- */
/* Unauthenticated endpoints                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Signs in and persists the token pair.
 *
 * Persisting here rather than at the call site is deliberate: the secure store
 * is the only sanctioned home for a token (§4.3), and a screen that forgot to
 * write it would appear to work until the app was backgrounded.
 */
export async function login(credentials: LoginBody): Promise<LoginResponse> {
  const { data } = await httpFetch<LoginResponse>('/v1/auth/login', {
    method: 'POST',
    body: credentials,
  });
  await saveSession(sessionFromTokenPair(data));
  return data;
}

/**
 * Redeems an invite code. Returns no tokens — the server creates the account
 * and the driver then signs in normally.
 */
export async function registerDriver(
  body: RegisterDriverBody,
): Promise<RegisterDriverResponse> {
  const { data } = await httpFetch<RegisterDriverResponse>(
    '/v1/auth/register/driver',
    { method: 'POST', body },
  );
  return data;
}

/**
 * Ends the session server-side, then locally.
 *
 * The local wipe is unconditional. A driver tapping sign-out on a dead network
 * must still end up signed out on this device; the refresh token they leave
 * behind on the server expires on its own.
 */
export async function logout(): Promise<void> {
  const session = await loadSession();
  try {
    if (session) {
      await httpFetch<void>('/v1/auth/logout', {
        method: 'POST',
        token: session.accessToken,
        body: { refresh_token: session.refreshToken },
      });
    }
  } catch {
    // Deliberately swallowed — see above.
  } finally {
    await clearSession();
  }
}

/* -------------------------------------------------------------------------- */
/* Authenticated endpoints                                                    */
/* -------------------------------------------------------------------------- */

/** Current driver and organization. `organization.locale` seeds i18n. */
export function getMe(): Promise<MeResponse> {
  return request<MeResponse>('/v1/auth/me');
}

/**
 * The day's run, already in route order.
 *
 * `date` is optional; the server defaults to today in the organization's
 * timezone, which is the right answer and not one this app can compute.
 *
 * `updatedSince` makes the server answer `has_new`. The app does not use it:
 * `src/queue/shift-alerts.ts` diffs stop ids across polls and produces a
 * *count* of what arrived, which is strictly more than a boolean and is
 * already what the banners render. The parameter exists for the live-API
 * suite, which does assert the server's side of the contract.
 */
export function getQueue(date?: string, updatedSince?: string): Promise<QueueResponse> {
  return request<QueueResponse>('/v1/driver/queue', {
    query: { date, updated_since: updatedSince },
  });
}

/* -------------------------------------------------------------------------- */
/* The delivery verbs                                                         */
/* -------------------------------------------------------------------------- */

/*
  Every function below sends an `Idempotency-Key`. The server registers the
  idempotency plugin only inside the driver scope, so these are the only calls
  in the whole API that get replay protection — and they are exactly the ones
  a driver fires from a parking garage with one bar of signal.

  All of them answer with the same untagged `MutatedStop` union. None of them
  returns "the order with a new status" as a single struct: `complete` and
  `return` hand back a row whose patient fields are already gone.
*/

/**
 * Take custody at the counter.
 *
 * `confirmedPackageCount` is the digital trace of the label check the driver
 * does with the employee. A count that disagrees with the order is **accepted
 * and logged**, never refused — the bags on the counter are the truth, and a
 * driver standing there with an employee must not be blocked.
 *
 * The body is `{}` rather than absent when there is no count. The spec marks
 * it required and the server's Zod schema preprocesses a null body into `{}`,
 * but omitting the body also omits `content-type`, which is a different
 * request and a different idempotency fingerprint.
 */
export function pickupOrder(
  id: string,
  confirmedPackageCount?: number,
): Promise<MutatedStop> {
  return request<MutatedStop>(`/v1/driver/orders/${id}/pickup`, {
    method: 'POST',
    body:
      confirmedPackageCount === undefined
        ? {}
        : { confirmed_package_count: confirmedPackageCount },
    idempotencyKey: newIdempotencyKey('pickup'),
  });
}

/**
 * How the money was settled at the door — as a closed set, not a bag of
 * optional fields.
 *
 * Sending `payment` and `payment_exception` together is a 400. Making that
 * unrepresentable is cheaper than validating it, and it forces the call site
 * to have decided which of the workflow's two branches it is on before it gets
 * here.
 */
export type CompleteOutcome =
  /** Cash or card changed hands. */
  | { kind: 'paid'; payment: PaymentTaken }
  /** The driver phoned the pharmacy and this is what they were told. */
  | { kind: 'exception'; exception: PaymentException; note?: string }
  /** Nothing was owed, or it was already collected. */
  | { kind: 'none' };

/**
 * Proof of delivery.
 *
 * The transition and the collection are written in **one transaction**, so a
 * retry with the same key replays both or neither. Never call `/payment` and
 * then `/complete` to achieve the same thing — that is two writes and a window
 * where one landed and the other did not.
 */
export function completeOrder(
  id: string,
  outcome: CompleteOutcome = { kind: 'none' },
): Promise<MutatedStop> {
  let body: Record<string, unknown> = {};
  if (outcome.kind === 'paid') body = { payment: outcome.payment };
  if (outcome.kind === 'exception') {
    body = {
      payment_exception: outcome.exception,
      // A note without an exception is a 400, so it can only be sent here.
      ...(outcome.note ? { payment_exception_note: outcome.note } : {}),
    };
  }

  return request<MutatedStop>(`/v1/driver/orders/${id}/complete`, {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey('complete'),
  });
}

/**
 * The delivery failed.
 *
 * `reason` is required — a bodyless call is `400 VALIDATION_FAILED`. The order
 * does **not** become terminal: it moves to `returned`, which means the
 * package is in the driver's van and the pharmacy is owed a handover.
 *
 * `note` lands in `orders.failure_note`, which is admin-only and never comes
 * back in a driver response. Do not expect to read it again.
 */
export function returnOrder(id: string, body: ReturnBody): Promise<MutatedStop> {
  return request<MutatedStop>(`/v1/driver/orders/${id}/return`, {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey('return'),
  });
}

/**
 * The pharmacy took one undelivered package back.
 *
 * No `body` key at all, deliberately: the route declares no body schema, so
 * `httpFetch` must not send `content-type` either.
 */
export function handoverOrder(id: string): Promise<MutatedStop> {
  return request<MutatedStop>(`/v1/driver/orders/${id}/handover`, {
    method: 'POST',
    idempotencyKey: newIdempotencyKey('handover'),
  });
}

/**
 * The whole stack at once, in one transaction — all or nothing.
 *
 * Which is what the counter actually looks like: the driver puts the bags
 * down, the employee takes them, and a partial success would leave the app
 * disagreeing with a shelf.
 */
export function handoverReturns(
  body: BatchHandoverBody,
): Promise<BatchHandoverResponse> {
  return request<BatchHandoverResponse>('/v1/driver/returns/handover', {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey('handover-batch'),
  });
}

/**
 * The employee flagged this stop verbally at pickup
 * (`domain_workflow.md`, §Pendant prise en charge).
 *
 * The server sorts priority stops to the front of `stops` regardless of route
 * position, so this reorders the list as well as marking the card.
 */
export function setOrderPriority(
  id: string,
  isPriority: boolean,
): Promise<MutatedStop> {
  return request<MutatedStop>(`/v1/driver/orders/${id}/priority`, {
    method: 'POST',
    body: { is_priority: isPriority },
    idempotencyKey: newIdempotencyKey('priority'),
  });
}

/**
 * Record a collection *after* the delivery was already marked complete —
 * the terminal that only went through on the second try.
 *
 * For the normal case the payment rides on `completeOrder` instead, in one
 * transaction. This endpoint accepts `picked_up` and `completed` only.
 */
export function collectPayment(
  id: string,
  body: PaymentBody,
): Promise<PaymentResponse> {
  return request<PaymentResponse>(`/v1/driver/orders/${id}/payment`, {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey('payment'),
  });
}

/**
 * The cooler-bag QC record. Three states matter to the pharmacy's exceptions
 * report — yes, no, and **never asked** — so the dismissed case is "do not
 * call this", not "call it with null".
 *
 * Only valid once the order is terminal, which is why it can never ride on an
 * optimistic transition: the server has to have written the status first.
 */
export function coolerCheck(
  id: string,
  body: CoolerCheckBody,
): Promise<MutatedStop> {
  return request<MutatedStop>(`/v1/driver/orders/${id}/cooler-check`, {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey('cooler'),
  });
}

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The driver's own order for the day (`domain_workflow.md`, §En route).
 *
 * **Send every active stop, not a slice.** The server clears
 * `sequence_number` on any active order missing from `ordered_order_ids`, so
 * reordering only the packages in the van would silently strip the sequence
 * from everything still at the counter.
 *
 * Answers with the whole queue, so the caller writes it straight into the
 * cache rather than invalidating.
 */
export function sequenceQueue(body: SequenceBody): Promise<QueueResponse> {
  return request<QueueResponse>('/v1/driver/queue/sequence', {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey('sequence'),
  });
}

/**
 * Ask the optimizer for an order. Never fails over a provider outage: it
 * returns the *previous* sequence with `degraded: true`, which is a success
 * response the UI annotates, not an error path.
 */
export function optimizeQueue(body: OptimizeBody = {}): Promise<OptimizeResponse> {
  return request<OptimizeResponse>('/v1/driver/queue/optimize', {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey('optimize'),
  });
}

/**
 * When the driver reaches each remaining stop, and when the run is done.
 *
 * A read, despite the POST — it writes nothing, and the verb is here because
 * the body carries the driver's position when there is one. It costs a Routes
 * API call, so it is asked for deliberately: on opening the screen and after
 * each delivery or return, never on the queue poll.
 *
 * Never fails over a provider outage. A degraded response is a success with
 * `degraded: true` and no stops, which the UI renders as nothing at all —
 * a driver plans an afternoon around this number, so a wrong one is worse
 * than none.
 */
export function getRouteEta(body: EtaBody = {}): Promise<RouteEta> {
  return request<RouteEta>('/v1/driver/queue/eta', { method: 'POST', body });
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The in-app feed. There is no push channel, so this and the queue poll are
 * the whole of how a driver learns anything.
 */
export function getNotifications(options: {
  unread?: boolean;
  limit?: number;
} = {}): Promise<NotificationsResponse> {
  return request<NotificationsResponse>('/v1/driver/notifications', {
    query: {
      // The server takes the *string* "true"/"false", not a boolean.
      unread: options.unread === undefined ? undefined : String(options.unread),
      limit: options.limit,
    },
  });
}

/** Omit `ids` to mark the entire feed read. */
export function markNotificationsRead(
  body: MarkReadBody = {},
): Promise<{ updated: number }> {
  return request<{ updated: number }>('/v1/driver/notifications/read', {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey('notif-read'),
  });
}
