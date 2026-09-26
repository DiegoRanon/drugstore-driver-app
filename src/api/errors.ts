/**
 * The server's failure envelope, normalized.
 *
 * Verified against `medibus-server/src/core/errors.ts`: the body is
 * `{ error: { code, message, details } }` and the correlation id arrives as
 * the `x-request-id` *header*, not a body field. `request_id` is what ties a
 * driver's report to the server logs, so it is lifted onto the error here and
 * surfaced in error states (PRD §8.3).
 *
 * Always branch on `code`. It is a stable contract; `message` is prose and
 * will change without notice.
 */

/** Codes the app branches on, with the status the server pairs them with. */
export const ERROR_CODES = {
  // --- auth ---------------------------------------------------------------
  /** 401 — the access token aged out. Refresh, then replay. Not terminal. */
  tokenExpired: 'TOKEN_EXPIRED',
  /** 401 — no token, or one we cannot use. Our stored copy is junk. */
  unauthenticated: 'UNAUTHENTICATED',
  /** 401 — rotated or revoked. Terminal: the whole family is gone. */
  invalidRefreshToken: 'INVALID_REFRESH_TOKEN',
  /** 403 — the pharmacy deactivated this driver (PRD §4.5). Terminal. */
  accountDisabled: 'ACCOUNT_DISABLED',
  invalidCredentials: 'INVALID_CREDENTIALS',
  /** Per-email: 5 failures in 15 minutes, then exponential backoff. */
  loginThrottled: 'LOGIN_THROTTLED',
  /** Per-IP, and it trips *first* on a shared pharmacy connection. */
  rateLimited: 'RATE_LIMITED',

  // --- invite registration (PRD §4.2) -------------------------------------
  /** 422 — no such code. Sends the driver back to the pharmacist. */
  inviteCodeInvalid: 'INVITE_CODE_INVALID',
  /** 422 — real code, past its expiry. */
  inviteCodeExpired: 'INVITE_CODE_EXPIRED',
  /** 409 — real code, already used by someone. */
  inviteCodeRedeemed: 'INVITE_CODE_REDEEMED',
  emailAlreadyRegistered: 'EMAIL_ALREADY_REGISTERED',

  // --- the delivery verbs -------------------------------------------------
  /** 409 — e.g. completing something that was never picked up. */
  orderInvalidTransition: 'ORDER_INVALID_TRANSITION',
  /** 409 — already completed/returned/cancelled by someone else. */
  orderAlreadyTerminal: 'ORDER_ALREADY_TERMINAL',
  /** 403 — assigned to a different driver. */
  orderForbidden: 'ORDER_FORBIDDEN',
  /** 422 — the order has no driver at all. */
  orderNotAssigned: 'ORDER_NOT_ASSIGNED',
  /** 422 — a second collection on the same order. */
  paymentAlreadyCollected: 'PAYMENT_ALREADY_COLLECTED',
  paymentDetailsRequired: 'PAYMENT_DETAILS_REQUIRED',
  /** 422 — cooler check on an order that never needed one. */
  coolerBagNotRequired: 'COOLER_BAG_NOT_REQUIRED',

  // --- idempotency --------------------------------------------------------
  /** 409 — same key, different body. A client bug; never retry as-is. */
  idempotencyKeyConflict: 'IDEMPOTENCY_KEY_CONFLICT',
  /** 409 — the original is still running server-side. Retry shortly. */
  idempotencyRequestInFlight: 'IDEMPOTENCY_REQUEST_IN_FLIGHT',

  validationFailed: 'VALIDATION_FAILED',
  notFound: 'NOT_FOUND',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;
  readonly requestId: string | null;
  /** Seconds to wait, from `x-ratelimit-reset` when the body carries none. */
  readonly rateLimitReset: number | null;
  /** True when the server replayed a stored response for our key. */
  readonly idempotentReplay: boolean;

  constructor(init: {
    code: string;
    message: string;
    status: number;
    details?: Record<string, unknown>;
    requestId?: string | null;
    rateLimitReset?: number | null;
    idempotentReplay?: boolean;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.details = init.details ?? {};
    this.requestId = init.requestId ?? null;
    this.rateLimitReset = init.rateLimitReset ?? null;
    this.idempotentReplay = init.idempotentReplay ?? false;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const requestId = response.headers.get('x-request-id');
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    const rateLimitReset = Number.isFinite(reset) && reset > 0 ? reset : null;
    let code = `HTTP_${response.status}`;
    let message = response.statusText || 'Request failed';
    let details: Record<string, unknown> = {};

    try {
      const payload: unknown = await response.json();
      const envelope =
        typeof payload === 'object' && payload !== null && 'error' in payload
          ? (payload as { error: unknown }).error
          : null;

      if (typeof envelope === 'object' && envelope !== null) {
        const record = envelope as Record<string, unknown>;
        if (typeof record.code === 'string') code = record.code;
        if (typeof record.message === 'string') message = record.message;
        if (typeof record.details === 'object' && record.details !== null) {
          details = record.details as Record<string, unknown>;
        }
      }
    } catch {
      // A non-JSON body (gateway error page, truncated response) still has to
      // produce a usable error rather than masking the status.
    }

    return new ApiError({
      code,
      message,
      status: response.status,
      details,
      requestId,
      rateLimitReset,
      idempotentReplay: response.headers.get('idempotent-replay') === 'true',
    });
  }

  /**
   * The access token aged out — refresh and replay, do not sign the driver out.
   *
   * Distinct from every other 401: this is the expected steady state every 15
   * minutes, not a failure.
   */
  get isTokenExpired(): boolean {
    return this.status === 401 && this.code === ERROR_CODES.tokenExpired;
  }

  /**
   * The session is gone for good — wipe the secure store, purge the PII cache,
   * return to sign-in, never retry (PRD §4.4, §4.5).
   *
   * `UNAUTHENTICATED` is included deliberately: it means the server could not
   * use the token we presented at all, and no amount of refreshing fixes a
   * credential that is malformed rather than merely stale.
   */
  get isTerminalAuthFailure(): boolean {
    return (
      (this.status === 401 &&
        (this.code === ERROR_CODES.invalidRefreshToken ||
          this.code === ERROR_CODES.unauthenticated)) ||
      (this.status === 403 && this.code === ERROR_CODES.accountDisabled)
    );
  }
}

/** The API could not be reached at all. Distinct from an error it returned. */
export class ApiUnreachableError extends Error {
  constructor(readonly cause: unknown) {
    super('The delivery API could not be reached');
    this.name = 'ApiUnreachableError';
  }
}

/**
 * How long the user must wait, in seconds.
 *
 * Two different limiters answer 429 and they report the wait differently:
 * `LOGIN_THROTTLED` (per email) puts it in `details.retry_after_seconds`,
 * while the per-IP `RATE_LIMITED` sends empty details and only an
 * `x-ratelimit-reset` header. Both must produce a real number of minutes on
 * the sign-in screen — "try again later" generates support calls (PRD §5.1).
 */
export function retryAfterSeconds(error: ApiError): number | null {
  const value = error.details.retry_after_seconds;
  if (typeof value === 'number') return value;
  return error.rateLimitReset;
}

export function isThrottled(error: ApiError): boolean {
  return (
    error.status === 429 ||
    error.code === ERROR_CODES.loginThrottled ||
    error.code === ERROR_CODES.rateLimited
  );
}

/**
 * Is this failure worth retrying with the *same* request?
 *
 * The outbox (Feature 5) drains on this predicate, so the rule is stated once
 * here rather than re-derived from status codes at each call site.
 *
 * A blanket "4xx is dead" — the obvious reading — is wrong against this
 * server, and these are the cases that make it wrong:
 *
 *   408 / 429  the server is asking us to come back, not refusing the work.
 *   409 IDEMPOTENCY_REQUEST_IN_FLIGHT
 *              the original request is *still running* server-side. The
 *              server explicitly says "retry shortly"; treating it as dead
 *              would strand a write that is about to succeed.
 *
 * Everything else in 4xx is a decided answer — a conflict, a forbidden order,
 * a validation failure — and replaying it only burns battery.
 */
export function isRetriable(error: unknown): boolean {
  // Being offline is this app's normal condition, not a failed request.
  if (error instanceof ApiUnreachableError) return true;
  if (!(error instanceof ApiError)) return false;

  if (error.code === ERROR_CODES.idempotencyRequestInFlight) return true;
  if (error.status === 408 || error.status === 429) return true;
  if (error.status >= 500) return true;
  // A stale access token is resolved by refreshing, then replaying.
  if (error.isTokenExpired) return true;

  return false;
}
