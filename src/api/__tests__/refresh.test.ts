/**
 * The refresh mutex (PRD §4.4).
 *
 * The failure this guards against is not a wasted round-trip: the server
 * revokes the entire token family when an already-rotated refresh token is
 * presented, so a second concurrent refresh signs the driver out mid-route.
 * These tests exist because that bug is invisible in manual testing — it needs
 * two requests racing, which is the ordinary state of a queue screen.
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

import { ApiError, ApiUnreachableError } from '../errors';
import {
  endSession,
  getValidAccessToken,
  NoSessionError,
  refreshAfterUnauthorized,
  resetRefreshState,
  setSessionTerminationHandler,
} from '../refresh';
import {
  loadSession,
  resetSessionCache,
  saveSession,
  type StoredSession,
} from '@/auth/token-store';
import {
  errorPayload,
  FakeServer,
  installOfflineFetch,
  tokenPayload,
} from '@/test-support/fake-server';

const REFRESH_PATH = '/v1/auth/refresh';

/** A session whose access token expired a minute ago. */
function expiredSession(): StoredSession {
  return {
    accessToken: 'access-stale',
    refreshToken: 'refresh-stale',
    expiresAt: Date.now() - 60_000,
  };
}

/** A session with the full 15 minutes still on it. */
function freshSession(): StoredSession {
  return {
    accessToken: 'access-fresh',
    refreshToken: 'refresh-fresh',
    expiresAt: Date.now() + 15 * 60_000,
  };
}

let server: FakeServer;

beforeEach(async () => {
  mockSecureStoreData.clear();
  resetSessionCache();
  resetRefreshState();
  server = new FakeServer();
  server.install();
});

afterEach(() => {
  server.restore();
  setSessionTerminationHandler(null);
});

describe('single-flight refresh', () => {
  it('collapses 20 parallel calls on an expired token into one POST /v1/auth/refresh', async () => {
    await saveSession(expiredSession());
    server.on('POST', REFRESH_PATH, () => ({
      body: tokenPayload({ access: 'access-rotated', refresh: 'refresh-rotated' }),
    }));

    const tokens = await Promise.all(
      Array.from({ length: 20 }, () => getValidAccessToken()),
    );

    expect(server.callsTo('POST', REFRESH_PATH)).toHaveLength(1);
    // Every caller gets the rotated token — none is left holding the stale one.
    expect(new Set(tokens)).toEqual(new Set(['access-rotated']));
  });

  it('presents the stored refresh token exactly once, never a rotated one', async () => {
    await saveSession(expiredSession());
    server.on('POST', REFRESH_PATH, () => ({
      body: tokenPayload({ access: 'access-rotated', refresh: 'refresh-rotated' }),
    }));

    await Promise.all(Array.from({ length: 20 }, () => getValidAccessToken()));

    const bodies = server
      .callsTo('POST', REFRESH_PATH)
      .map((r) => (r.body as { refresh_token: string }).refresh_token);
    expect(bodies).toEqual(['refresh-stale']);
  });

  it('persists the rotated pair so the next launch does not re-refresh', async () => {
    await saveSession(expiredSession());
    server.on('POST', REFRESH_PATH, () => ({
      body: tokenPayload({
        access: 'access-rotated',
        refresh: 'refresh-rotated',
        expiresIn: 900,
      }),
    }));

    await getValidAccessToken();

    resetSessionCache(); // force a real read back out of the store
    const stored = await loadSession();
    expect(stored?.accessToken).toBe('access-rotated');
    expect(stored?.refreshToken).toBe('refresh-rotated');
    expect(stored?.expiresAt).toBeGreaterThan(Date.now() + 14 * 60_000);
  });

  it('does not refresh a token that is still valid', async () => {
    await saveSession(freshSession());
    server.on('POST', REFRESH_PATH, () => ({ body: tokenPayload({}) }));

    const token = await getValidAccessToken();

    expect(token).toBe('access-fresh');
    expect(server.callsTo('POST', REFRESH_PATH)).toHaveLength(0);
  });

  it('refreshes early, inside the 60-second skew, rather than letting it expire in flight', async () => {
    await saveSession({
      accessToken: 'access-nearly-done',
      refreshToken: 'refresh-nearly-done',
      // Still valid, but not for long enough to survive a slow round-trip.
      expiresAt: Date.now() + 30_000,
    });
    server.on('POST', REFRESH_PATH, () => ({
      body: tokenPayload({ access: 'access-rotated' }),
    }));

    expect(await getValidAccessToken()).toBe('access-rotated');
    expect(server.callsTo('POST', REFRESH_PATH)).toHaveLength(1);
  });

  it('starts a fresh refresh after an earlier one finished, rather than wedging the slot', async () => {
    await saveSession(expiredSession());
    let issued = 0;
    server.on('POST', REFRESH_PATH, () => {
      issued += 1;
      return {
        body: tokenPayload({
          access: `access-${issued}`,
          refresh: `refresh-${issued}`,
          // Immediately stale again, so the second call must rotate.
          expiresIn: 0,
        }),
      };
    });

    expect(await getValidAccessToken()).toBe('access-1');
    expect(await getValidAccessToken()).toBe('access-2');
    expect(server.callsTo('POST', REFRESH_PATH)).toHaveLength(2);
  });
});

describe('refresh after a 401 the proactive check did not predict', () => {
  it('collapses 20 simultaneous 401s into one refresh', async () => {
    await saveSession(freshSession());
    server.on('POST', REFRESH_PATH, () => ({
      body: tokenPayload({ access: 'access-rotated' }),
    }));

    const tokens = await Promise.all(
      Array.from({ length: 20 }, () => refreshAfterUnauthorized('access-fresh')),
    );

    expect(server.callsTo('POST', REFRESH_PATH)).toHaveLength(1);
    expect(new Set(tokens)).toEqual(new Set(['access-rotated']));
  });

  it('hands back the current token without refreshing when another caller already rotated', async () => {
    await saveSession(freshSession());
    server.on('POST', REFRESH_PATH, () => ({ body: tokenPayload({}) }));

    // The caller failed with a token that is already two rotations old.
    const token = await refreshAfterUnauthorized('access-from-an-old-rotation');

    expect(token).toBe('access-fresh');
    expect(server.callsTo('POST', REFRESH_PATH)).toHaveLength(0);
  });
});

describe('terminal failures', () => {
  it('wipes the session and notifies once when the refresh token is revoked', async () => {
    await saveSession(expiredSession());
    const onTerminated = jest.fn();
    setSessionTerminationHandler(onTerminated);
    server.on('POST', REFRESH_PATH, () => ({
      status: 401,
      body: errorPayload('INVALID_REFRESH_TOKEN', 'That session has ended'),
    }));

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => getValidAccessToken()),
    );

    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    const [first] = results;
    const reason = first?.status === 'rejected' ? first.reason : null;
    expect(reason).toBeInstanceOf(ApiError);
    expect((reason as ApiError).code).toBe('INVALID_REFRESH_TOKEN');

    // One refresh, one wipe, one notification — not twenty.
    expect(server.callsTo('POST', REFRESH_PATH)).toHaveLength(1);
    expect(onTerminated).toHaveBeenCalledTimes(1);
    resetSessionCache();
    expect(await loadSession()).toBeNull();
  });

  it('wipes on deactivation — there is no offline grace period for a revoked driver', async () => {
    await saveSession(expiredSession());
    const onTerminated = jest.fn();
    setSessionTerminationHandler(onTerminated);
    server.on('POST', REFRESH_PATH, () => ({
      status: 403,
      body: errorPayload('ACCOUNT_DISABLED', 'This account has been disabled'),
    }));

    await expect(getValidAccessToken()).rejects.toBeInstanceOf(ApiError);

    expect(onTerminated).toHaveBeenCalledTimes(1);
    resetSessionCache();
    expect(await loadSession()).toBeNull();
  });

  it('keeps the session when the refresh fails because the network is gone', async () => {
    await saveSession(expiredSession());
    const onTerminated = jest.fn();
    setSessionTerminationHandler(onTerminated);
    server.restore();
    const restoreOffline = installOfflineFetch();

    await expect(getValidAccessToken()).rejects.toBeInstanceOf(ApiUnreachableError);

    // Being offline must never sign a driver out mid-shift (PRD §6.4).
    expect(onTerminated).not.toHaveBeenCalled();
    resetSessionCache();
    expect((await loadSession())?.refreshToken).toBe('refresh-stale');

    restoreOffline();
  });

  it('reports no session rather than guessing when the store is empty', async () => {
    await expect(getValidAccessToken()).rejects.toBeInstanceOf(NoSessionError);
  });

  it('clears the stored credential on sign-out', async () => {
    await saveSession(freshSession());
    await endSession();
    resetSessionCache();
    expect(await loadSession()).toBeNull();
  });
});
