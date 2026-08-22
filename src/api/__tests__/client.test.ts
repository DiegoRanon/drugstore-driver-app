/**
 * The auth-owning wrapper: what actually goes on the wire, and what happens
 * when the server rejects it.
 *
 * The replay-after-refresh path is the one worth pinning. It has to resend the
 * *same* body and the *same* Idempotency-Key, or a retried "complete delivery"
 * becomes a second status event on the server (PRD §3).
 */

/** In-memory Keychain. Declared before `jest.mock`, which is hoisted. */
const mockSecureStoreData = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStoreData.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStoreData.get(key) ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStoreData.delete(key);
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

import { getQueue, login, logout, request, requestWithMeta } from '../client';
import { ApiError } from '../errors';
import { buildUrl } from '../http';
import { resetRefreshState, setSessionTerminationHandler } from '../refresh';
import { loadSession, resetSessionCache, saveSession } from '@/auth/token-store';
import { errorPayload, FakeServer, tokenPayload } from '@/test-support/fake-server';

const QUEUE_PATH = '/v1/driver/queue';
const REFRESH_PATH = '/v1/auth/refresh';

let server: FakeServer;

beforeEach(async () => {
  mockSecureStoreData.clear();
  resetSessionCache();
  resetRefreshState();
  server = new FakeServer();
  server.install();
  await saveSession({
    accessToken: 'access-live',
    refreshToken: 'refresh-live',
    expiresAt: Date.now() + 15 * 60_000,
  });
});

afterEach(() => {
  server.restore();
  setSessionTerminationHandler(null);
});

describe('building the request', () => {
  it('omits empty query values instead of sending date=', () => {
    expect(buildUrl('http://localhost:3000', QUEUE_PATH, { date: undefined })).toBe(
      'http://localhost:3000/v1/driver/queue',
    );
    expect(buildUrl('http://localhost:3000/', QUEUE_PATH, { date: '2026-08-22' })).toBe(
      'http://localhost:3000/v1/driver/queue?date=2026-08-22',
    );
  });

  it('attaches the bearer token to an authenticated call', async () => {
    server.on('GET', QUEUE_PATH, () => ({ body: { stops: [] } }));

    await request(QUEUE_PATH);

    expect(server.callsTo('GET', QUEUE_PATH)[0]?.headers.authorization).toBe(
      'Bearer access-live',
    );
  });

  it('passes the date through to the server rather than computing today locally', async () => {
    server.on('GET', QUEUE_PATH, () => ({ body: { stops: [] } }));

    await getQueue('2026-08-22');

    expect(server.callsTo('GET', QUEUE_PATH)[0]?.url).toContain('date=2026-08-22');
  });

  it('sends the Idempotency-Key when given one', async () => {
    server.on('POST', '/v1/driver/orders/abc/complete', () => ({ body: { id: 'abc' } }));

    await request('/v1/driver/orders/abc/complete', {
      method: 'POST',
      idempotencyKey: 'key-123',
    });

    expect(
      server.callsTo('POST', '/v1/driver/orders/abc/complete')[0]?.headers[
        'idempotency-key'
      ],
    ).toBe('key-123');
  });

  it('refuses a key over the server 255-character ceiling before spending a round-trip', async () => {
    server.on('POST', '/v1/driver/orders/abc/complete', () => ({ body: {} }));

    await expect(
      request('/v1/driver/orders/abc/complete', {
        method: 'POST',
        idempotencyKey: 'x'.repeat(256),
      }),
    ).rejects.toThrow(/255 characters or fewer/);

    expect(server.requests).toHaveLength(0);
  });

  it('surfaces the request id, which is the handle support uses', async () => {
    server.on('GET', QUEUE_PATH, () => ({
      body: { stops: [] },
      headers: { 'x-request-id': 'req_42', 'idempotent-replay': 'true' },
    }));

    const response = await requestWithMeta(QUEUE_PATH);

    expect(response.requestId).toBe('req_42');
    expect(response.idempotentReplay).toBe(true);
  });
});

describe('a 401 the proactive refresh did not predict', () => {
  it('refreshes once and replays the request', async () => {
    let queueCalls = 0;
    server.on('GET', QUEUE_PATH, () => {
      queueCalls += 1;
      // The stored token looked fresh to us, but the server rejects it — a
      // fast device clock, or a revocation landing between check and send.
      if (queueCalls === 1) {
        return { status: 401, body: errorPayload('TOKEN_EXPIRED', 'Session expired') };
      }
      return { body: { stops: [], date: '2026-08-22' } };
    });
    server.on('POST', REFRESH_PATH, () => ({
      body: tokenPayload({ access: 'access-rotated', refresh: 'refresh-rotated' }),
    }));

    const queue = await request<{ date: string }>(QUEUE_PATH);

    expect(queue.date).toBe('2026-08-22');
    expect(server.callsTo('POST', REFRESH_PATH)).toHaveLength(1);

    const attempts = server.callsTo('GET', QUEUE_PATH);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.headers.authorization).toBe('Bearer access-live');
    expect(attempts[1]?.headers.authorization).toBe('Bearer access-rotated');
  });

  it('replays a mutation byte-for-byte, with the same key, so the server can dedupe it', async () => {
    let attempts = 0;
    server.on('POST', '/v1/driver/orders/abc/payment', () => {
      attempts += 1;
      if (attempts === 1) {
        return { status: 401, body: errorPayload('TOKEN_EXPIRED', 'Session expired') };
      }
      return { body: { amount_collected: 42.5 } };
    });
    server.on('POST', REFRESH_PATH, () => ({
      body: tokenPayload({ access: 'access-rotated' }),
    }));

    await request('/v1/driver/orders/abc/payment', {
      method: 'POST',
      body: { payment_method: 'cash', amount_collected: 42.5 },
      idempotencyKey: 'pay-abc-1',
    });

    const calls = server.callsTo('POST', '/v1/driver/orders/abc/payment');
    expect(calls).toHaveLength(2);
    // The server fingerprints method + URL + body against the stored key, so
    // a replay that differs in either would be refused as a key conflict.
    expect(calls[1]?.rawBody).toBe(calls[0]?.rawBody);
    expect(calls[1]?.headers['idempotency-key']).toBe('pay-abc-1');
  });

  it('gives up after one retry instead of looping on a token the server keeps rejecting', async () => {
    server.on('GET', QUEUE_PATH, () => ({
      status: 401,
      body: errorPayload('TOKEN_EXPIRED', 'Session expired'),
    }));
    server.on('POST', REFRESH_PATH, () => ({
      body: tokenPayload({ access: 'access-rotated' }),
    }));

    await expect(request(QUEUE_PATH)).rejects.toBeInstanceOf(ApiError);

    expect(server.callsTo('GET', QUEUE_PATH)).toHaveLength(2);
    expect(server.callsTo('POST', REFRESH_PATH)).toHaveLength(1);
  });
});

describe('terminal failures on an ordinary call', () => {
  it('wipes the session when the driver has been deactivated', async () => {
    const onTerminated = jest.fn();
    setSessionTerminationHandler(onTerminated);
    server.on('GET', QUEUE_PATH, () => ({
      status: 403,
      body: errorPayload('ACCOUNT_DISABLED', 'This account has been disabled'),
    }));

    await expect(request(QUEUE_PATH)).rejects.toBeInstanceOf(ApiError);

    expect(onTerminated).toHaveBeenCalledTimes(1);
    resetSessionCache();
    expect(await loadSession()).toBeNull();
  });

  it('leaves the session alone when one order is forbidden', async () => {
    const onTerminated = jest.fn();
    setSessionTerminationHandler(onTerminated);
    server.on('POST', '/v1/driver/orders/abc/pickup', () => ({
      status: 403,
      body: errorPayload('ORDER_FORBIDDEN', 'Assigned to another driver'),
    }));

    await expect(
      request('/v1/driver/orders/abc/pickup', { method: 'POST' }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(onTerminated).not.toHaveBeenCalled();
    expect(await loadSession()).not.toBeNull();
  });
});

describe('session endpoints', () => {
  it('persists the token pair on sign-in so no screen has to remember to', async () => {
    mockSecureStoreData.clear();
    resetSessionCache();
    server.on('POST', '/v1/auth/login', () => ({
      body: tokenPayload({ access: 'access-new', refresh: 'refresh-new' }),
    }));

    const result = await login({
      email: 'driver@stlaurent.example.ca',
      password: 'DevPassword123!',
    });

    expect(result.user.role).toBe('driver');
    resetSessionCache();
    expect((await loadSession())?.accessToken).toBe('access-new');
  });

  it('signs out locally even when the network call fails', async () => {
    // A driver ending a shift in a dead zone must still end up signed out.
    server.on('POST', '/v1/auth/logout', () => ({
      status: 500,
      body: errorPayload('INTERNAL_ERROR'),
    }));

    await logout();

    resetSessionCache();
    expect(await loadSession()).toBeNull();
  });
});
