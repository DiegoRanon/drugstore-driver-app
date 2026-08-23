/**
 * Turns a thrown error into something a driver can act on.
 *
 * Branching lives here, once, rather than in each screen's catch block —
 * and it branches on `code`, never on the server's prose, which is English-only
 * and changes without notice.
 */
import { ApiError, ApiUnreachableError, isThrottled, retryAfterSeconds } from '@/api/errors';
import type { Strings } from './strings';

export type ErrorNotice = {
  message: string;
  /** Shown small underneath. The handle support uses against server logs. */
  reference: string | null;
};

export function errorNotice(error: unknown, t: Strings): ErrorNotice {
  const e = t.errors;

  // Offline is the app's normal condition, not a fault to apologise for.
  if (error instanceof ApiUnreachableError) {
    return { message: e.OFFLINE, reference: null };
  }

  if (!(error instanceof ApiError)) {
    return { message: e.UNKNOWN, reference: null };
  }

  const reference = error.requestId ? e.requestId(error.requestId) : null;

  // Two different limiters answer 429 and they report the wait in two
  // different places; `retryAfterSeconds` already reconciles them.
  if (isThrottled(error)) {
    const seconds = retryAfterSeconds(error);
    const message =
      error.code === 'LOGIN_THROTTLED'
        ? e.LOGIN_THROTTLED(seconds)
        : e.RATE_LIMITED(seconds);
    return { message, reference };
  }

  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return { message: e.INVALID_CREDENTIALS, reference };
    case 'ACCOUNT_DISABLED':
      return { message: e.ACCOUNT_DISABLED, reference };
    case 'INVITE_CODE_INVALID':
      return { message: e.INVITE_CODE_INVALID, reference };
    case 'INVITE_CODE_EXPIRED':
      return { message: e.INVITE_CODE_EXPIRED, reference };
    case 'INVITE_CODE_REDEEMED':
      return { message: e.INVITE_CODE_REDEEMED, reference };
    case 'EMAIL_ALREADY_REGISTERED':
      return { message: e.EMAIL_ALREADY_REGISTERED, reference };
    case 'VALIDATION_FAILED':
      return { message: e.VALIDATION_FAILED, reference };
    default:
      return { message: e.UNKNOWN, reference };
  }
}
