/**
 * Token lifecycle, with exactly one refresh in flight at a time.
 *
 * The server rotates the refresh token on every use and treats a *second*
 * presentation of an already-rotated token as theft — it revokes the whole
 * token family (server PRD §4.2). So two concurrent refreshes do not merely
 * waste a round-trip: they sign the driver out mid-route. A queue screen that
 * fires a poll, a pull-to-refresh, and an outbox drain in the same tick is the
 * ordinary case, not a corner case, which is why the mutex lives here rather
 * than in a hook (PRD §4.4).
 *
 * A mutex in the client is the whole mechanism — there is no Redis on a phone.
 */
import { ApiError, ApiUnreachableError } from './errors';
import { httpFetch } from './http';
import type { RefreshResponse } from './types';
import {
  clearSession,
  isExpiring,
  loadSession,
  saveSession,
  sessionFromTokenPair,
  type StoredSession,
} from '@/auth/token-store';

/** No credentials on the device at all — the caller must route to sign-in. */
export class NoSessionError extends Error {
  constructor() {
    super('No stored session');
    this.name = 'NoSessionError';
  }
}

/**
 * The single-flight slot. Non-null exactly while a refresh is in the air.
 *
 * Module scope is deliberate: one process, one refresh. Every caller in the
 * app awaits this same promise.
 */
let inFlight: Promise<StoredSession> | null = null;

type TerminationHandler = (error: ApiError) => void;

let onTerminated: TerminationHandler | null = null;

/**
 * Registered by the session provider (Feature 3) to purge the query cache and
 * return to sign-in. Kept as a callback so this module never imports React or
 * the router — it runs from background drains too.
 */
export function setSessionTerminationHandler(
  handler: TerminationHandler | null,
): void {
  onTerminated = handler;
}

/**
 * The session is unrecoverable: wipe the credential, then tell the app.
 *
 * Order matters. The store is cleared before the handler runs so that anything
 * the handler triggers cannot pick up the dead token and retry with it.
 */
async function terminate(error: ApiError): Promise<void> {
  await clearSession();
  onTerminated?.(error);
}

/**
 * Performs the rotation. Never call directly — go through `startRefresh`,
 * which is what enforces the single-flight rule.
 */
async function rotate(): Promise<StoredSession> {
  // Read *inside* the critical section, never from a value captured before the
  // await. A caller that read the session, yielded, and then refreshed with
  // the token it saw earlier would present an already-rotated token and
  // revoke the family — the exact failure this module exists to prevent.
  const current = await loadSession();
  if (!current) throw new NoSessionError();

  let response;
  try {
    response = await httpFetch<RefreshResponse>('/v1/auth/refresh', {
      method: 'POST',
      body: { refresh_token: current.refreshToken },
    });
  } catch (error) {
    if (error instanceof ApiError && error.isTerminalAuthFailure) {
      // Rotated, revoked, or the driver was deactivated. There is no retry
      // that fixes any of these (PRD §4.4, §4.5).
      await terminate(error);
    }
    // An unreachable server leaves the session intact on purpose: being
    // offline must never sign a driver out mid-shift (§6.4).
    throw error;
  }

  const session = sessionFromTokenPair(response.data);
  await saveSession(session);
  return session;
}

function startRefresh(): Promise<StoredSession> {
  if (inFlight) return inFlight;

  // `rotate()` runs synchronously up to its first `await`, so no other caller
  // can observe a null `inFlight` between the call and this assignment.
  const pending = rotate();
  inFlight = pending;

  // Cleared on both settle paths: a failed refresh must not wedge the slot,
  // or every later request would await a promise that already rejected.
  const release = (): void => {
    if (inFlight === pending) inFlight = null;
  };
  pending.then(release, release);

  return pending;
}

/**
 * The access token to put on the next request, refreshing first if it is
 * within 60 seconds of expiry.
 *
 * Proactive refresh is what keeps a token from expiring *in flight* on a slow
 * cellular link, where the round-trip can outlast the remaining validity.
 */
export async function getValidAccessToken(): Promise<string> {
  // Someone is already rotating; joining them is both correct and cheaper
  // than checking the store first.
  if (inFlight) return (await inFlight).accessToken;

  const session = await loadSession();
  if (!session) throw new NoSessionError();
  if (!isExpiring(session)) return session.accessToken;

  return (await startRefresh()).accessToken;
}

/**
 * Recovery path for a request that got `401 TOKEN_EXPIRED` anyway — a device
 * clock running fast, or a token revoked between our check and the request.
 *
 * `staleToken` is the token that actually failed. If the stored token has
 * moved on since, another caller already rotated and this request simply
 * missed it — replay with the new one rather than rotating again. Twenty
 * requests failing together therefore produce one refresh, not twenty.
 */
export async function refreshAfterUnauthorized(
  staleToken: string,
): Promise<string> {
  if (inFlight) return (await inFlight).accessToken;

  const current = await loadSession();
  if (!current) throw new NoSessionError();
  if (current.accessToken !== staleToken) return current.accessToken;

  return (await startRefresh()).accessToken;
}

/**
 * Sign-out and deactivation both land here. Exported so the session provider
 * can wipe without inventing a second path to the token store.
 */
export async function endSession(error?: ApiError): Promise<void> {
  inFlight = null;
  if (error) {
    await terminate(error);
    return;
  }
  await clearSession();
}

/** Test seam: drops the in-flight slot without touching stored credentials. */
export function resetRefreshState(): void {
  inFlight = null;
  onTerminated = null;
}

export { ApiError, ApiUnreachableError };
