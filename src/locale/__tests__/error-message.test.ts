/**
 * Turning server error codes into something a driver can act on.
 *
 * Two rules are load-bearing here and both come from the PRD:
 *   - throttling renders a real number of minutes, because "try again later"
 *     generates support calls (§5.1);
 *   - the three invite-code failures say three different things, because
 *     "invalid code" sends a driver back to the pharmacist to reissue a code
 *     that was never the problem (§4.2).
 */
import { ApiError, ApiUnreachableError } from '@/api/errors';
import { errorNotice } from '../error-message';
import { STRINGS } from '../strings';

function apiError(init: {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  requestId?: string | null;
  rateLimitReset?: number | null;
}): ApiError {
  return new ApiError({
    message: 'server prose that must never be shown',
    ...init,
  });
}

describe('throttling renders real minutes', () => {
  it('reads details.retry_after_seconds for the per-email limiter', () => {
    const notice = errorNotice(
      apiError({
        status: 429,
        code: 'LOGIN_THROTTLED',
        details: { retry_after_seconds: 300 },
      }),
      STRINGS.fr,
    );

    expect(notice.message).toBe('Trop de tentatives. Réessayez dans 5 minutes.');
  });

  it('falls back to the x-ratelimit-reset header for the per-IP limiter', () => {
    // The per-IP limiter sends empty details and only the header, and it is the
    // one that trips first on a shared pharmacy connection.
    const notice = errorNotice(
      apiError({ status: 429, code: 'RATE_LIMITED', rateLimitReset: 120 }),
      STRINGS.en,
    );

    expect(notice.message).toBe('Too many requests. Try again in 2 minutes.');
  });

  it('rounds a part-minute up and keeps the singular', () => {
    const notice = errorNotice(
      apiError({
        status: 429,
        code: 'LOGIN_THROTTLED',
        details: { retry_after_seconds: 20 },
      }),
      STRINGS.en,
    );

    // "0 minutes" would be worse than wrong — it invites an immediate retry
    // that fails again.
    expect(notice.message).toBe('Too many attempts. Try again in 1 minute.');
  });

  it('still says something useful when the server reports no wait at all', () => {
    const notice = errorNotice(apiError({ status: 429, code: 'RATE_LIMITED' }), STRINGS.fr);

    expect(notice.message).toBe('Trop de requêtes. Réessayez dans quelques minutes.');
  });
});

describe('invite codes fail in three distinguishable ways', () => {
  it.each([
    ['INVITE_CODE_INVALID', 422],
    ['INVITE_CODE_EXPIRED', 422],
    ['INVITE_CODE_REDEEMED', 409],
  ])('%s gets its own message', (code, status) => {
    const fr = errorNotice(apiError({ status, code }), STRINGS.fr).message;
    const en = errorNotice(apiError({ status, code }), STRINGS.en).message;

    expect(fr).not.toBe(STRINGS.fr.errors.UNKNOWN);
    expect(en).not.toBe(STRINGS.en.errors.UNKNOWN);
  });

  it('never gives two code failures the same wording', () => {
    const messages = (['INVITE_CODE_INVALID', 'INVITE_CODE_EXPIRED', 'INVITE_CODE_REDEEMED'] as const).map(
      (code) => errorNotice(apiError({ status: 422, code }), STRINGS.fr).message,
    );

    expect(new Set(messages).size).toBe(3);
  });
});

describe('the rest of the mapping', () => {
  it('reports being offline as a network problem, not a failure', () => {
    const notice = errorNotice(new ApiUnreachableError(new Error('offline')), STRINGS.fr);

    expect(notice.message).toBe(STRINGS.fr.errors.OFFLINE);
    expect(notice.reference).toBeNull();
  });

  it('surfaces the request id so support can find the call in the logs', () => {
    const notice = errorNotice(
      apiError({ status: 500, code: 'INTERNAL_ERROR', requestId: 'req_01HZY' }),
      STRINGS.en,
    );

    expect(notice.reference).toBe('Reference: req_01HZY');
  });

  it('falls back to a generic message for a code it has never seen', () => {
    const notice = errorNotice(
      apiError({ status: 418, code: 'SOMETHING_ENTIRELY_NEW' }),
      STRINGS.fr,
    );

    expect(notice.message).toBe(STRINGS.fr.errors.UNKNOWN);
  });

  it('never leaks the server prose, which is English-only', () => {
    const notice = errorNotice(
      apiError({ status: 401, code: 'INVALID_CREDENTIALS' }),
      STRINGS.fr,
    );

    expect(notice.message).toBe('Identifiant ou mot de passe incorrect.');
    expect(notice.message).not.toContain('server prose');
  });
});

describe('both languages are complete', () => {
  it('has the same keys in French and English', () => {
    const walk = (value: unknown, prefix = ''): string[] => {
      if (typeof value !== 'object' || value === null) return [prefix];
      return Object.entries(value).flatMap(([key, child]) =>
        walk(child, prefix ? `${prefix}.${key}` : key),
      );
    };

    expect(walk(STRINGS.en).sort()).toEqual(walk(STRINGS.fr).sort());
  });
});
