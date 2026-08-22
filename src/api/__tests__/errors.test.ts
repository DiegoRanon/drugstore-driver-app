/**
 * Envelope parsing and the classifications the whole app branches on.
 *
 * `code` is the contract; `message` is prose. Anything that switches on prose
 * breaks the first time the server rewords a message, so these tests pin the
 * codes — including the three retry cases that a blanket "4xx is dead" rule
 * would get wrong.
 */
import {
  ApiError,
  ApiUnreachableError,
  isRetriable,
  isThrottled,
  retryAfterSeconds,
} from '../errors';
import { errorPayload, fakeResponse } from '@/test-support/fake-server';

function apiError(init: {
  status: number;
  code: string;
  details?: Record<string, unknown>;
}): ApiError {
  return new ApiError({
    code: init.code,
    message: 'irrelevant prose',
    status: init.status,
    details: init.details,
  });
}

describe('parsing the failure envelope', () => {
  it('lifts code, message, and details out of { error: … }', async () => {
    const error = await ApiError.fromResponse(
      fakeResponse({
        status: 409,
        body: errorPayload(
          'ORDER_ALREADY_TERMINAL',
          'This delivery is already closed',
          { status: 'completed' },
        ),
      }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('ORDER_ALREADY_TERMINAL');
    expect(error.message).toBe('This delivery is already closed');
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ status: 'completed' });
  });

  it('takes request_id from the x-request-id header, not the body', async () => {
    const error = await ApiError.fromResponse(
      fakeResponse({
        status: 500,
        body: errorPayload('INTERNAL_ERROR'),
        headers: { 'x-request-id': 'req_01HZY' },
      }),
    );

    expect(error.requestId).toBe('req_01HZY');
  });

  it('reports no request id rather than inventing one', async () => {
    const error = await ApiError.fromResponse(
      fakeResponse({ status: 500, body: errorPayload('INTERNAL_ERROR') }),
    );

    expect(error.requestId).toBeNull();
  });

  it('reads the rate-limit reset header, which is the only place per-IP throttling reports it', async () => {
    const error = await ApiError.fromResponse(
      fakeResponse({
        status: 429,
        body: errorPayload('RATE_LIMITED', 'Too many requests'),
        headers: { 'x-ratelimit-reset': '90' },
      }),
    );

    expect(error.rateLimitReset).toBe(90);
    expect(retryAfterSeconds(error)).toBe(90);
    expect(isThrottled(error)).toBe(true);
  });

  it('prefers details.retry_after_seconds, which per-email throttling sends instead', async () => {
    const error = await ApiError.fromResponse(
      fakeResponse({
        status: 429,
        body: errorPayload('LOGIN_THROTTLED', 'Too many attempts', {
          retry_after_seconds: 300,
        }),
        headers: { 'x-ratelimit-reset': '90' },
      }),
    );

    expect(retryAfterSeconds(error)).toBe(300);
  });

  it('falls back to the status when the body is not the envelope at all', async () => {
    // A gateway error page or a truncated response still has to produce a
    // usable error rather than masking the status behind a parse failure.
    const error = await ApiError.fromResponse(fakeResponse({ status: 502 }));

    expect(error.code).toBe('HTTP_502');
    expect(error.status).toBe(502);
    expect(error.details).toEqual({});
  });

  it('falls back when the JSON body has no error key', async () => {
    const error = await ApiError.fromResponse(
      fakeResponse({ status: 400, body: { message: 'nope' } }),
    );

    expect(error.code).toBe('HTTP_400');
  });

  it('notes when the server replayed a stored response for our key', async () => {
    const error = await ApiError.fromResponse(
      fakeResponse({
        status: 409,
        body: errorPayload('ORDER_ALREADY_TERMINAL'),
        headers: { 'idempotent-replay': 'true' },
      }),
    );

    expect(error.idempotentReplay).toBe(true);
  });
});

describe('auth classification', () => {
  it('treats an expired access token as routine, not terminal', () => {
    const error = apiError({ status: 401, code: 'TOKEN_EXPIRED' });

    expect(error.isTokenExpired).toBe(true);
    // Signing the driver out every 15 minutes is exactly the bug to avoid.
    expect(error.isTerminalAuthFailure).toBe(false);
  });

  it.each([
    ['INVALID_REFRESH_TOKEN', 401],
    ['UNAUTHENTICATED', 401],
    ['ACCOUNT_DISABLED', 403],
  ])('treats %s as terminal', (code, status) => {
    expect(apiError({ status, code }).isTerminalAuthFailure).toBe(true);
  });

  it('does not treat an order-level 403 as a session failure', () => {
    // ORDER_FORBIDDEN means this stop belongs to another driver — the session
    // is fine, and wiping it would sign the driver out over one bad tap.
    const error = apiError({ status: 403, code: 'ORDER_FORBIDDEN' });

    expect(error.isTerminalAuthFailure).toBe(false);
  });
});

describe('what is worth retrying', () => {
  it('retries a request that never reached the server', () => {
    expect(isRetriable(new ApiUnreachableError(new Error('offline')))).toBe(true);
  });

  it('retries IDEMPOTENCY_REQUEST_IN_FLIGHT, which a blanket 4xx rule would strand', () => {
    // The original request is still running server-side and the server
    // explicitly asks the client to come back. Treating this 409 as dead would
    // abandon a write that is about to succeed.
    expect(
      isRetriable(apiError({ status: 409, code: 'IDEMPOTENCY_REQUEST_IN_FLIGHT' })),
    ).toBe(true);
  });

  it.each([408, 429])('retries %i — the server is asking us to come back', (status) => {
    expect(isRetriable(apiError({ status, code: `HTTP_${status}` }))).toBe(true);
  });

  it('retries a 5xx and a stale token', () => {
    expect(isRetriable(apiError({ status: 500, code: 'INTERNAL_ERROR' }))).toBe(true);
    expect(isRetriable(apiError({ status: 401, code: 'TOKEN_EXPIRED' }))).toBe(true);
  });

  it.each([
    ['ORDER_ALREADY_TERMINAL', 409],
    ['ORDER_INVALID_TRANSITION', 409],
    ['IDEMPOTENCY_KEY_CONFLICT', 409],
    ['ORDER_FORBIDDEN', 403],
    ['ORDER_NOT_ASSIGNED', 422],
    ['PAYMENT_ALREADY_COLLECTED', 422],
    ['COOLER_BAG_NOT_REQUIRED', 422],
    ['VALIDATION_FAILED', 400],
  ])('treats %s as a decided answer, not worth replaying', (code, status) => {
    expect(isRetriable(apiError({ status, code }))).toBe(false);
  });

  it('does not retry something that is not an API failure at all', () => {
    expect(isRetriable(new TypeError('undefined is not a function'))).toBe(false);
  });
});
