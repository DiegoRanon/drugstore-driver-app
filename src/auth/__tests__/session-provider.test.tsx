/**
 * The session lifecycle (PRD §4.5).
 *
 * The behaviour worth pinning is not "sign-in works" — it is what happens when
 * the session is taken away. A pharmacy deactivates a driver mid-route and the
 * next API call must wipe the credential *and* the cached patient data, from
 * wherever it happened, with no screen involved in the decision.
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

import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { getQueue } from '@/api/client';
import { resetRefreshState } from '@/api/refresh';
import { SessionProvider, useSession } from '@/auth/session-provider';
import { loadSession, resetSessionCache, saveSession } from '@/auth/token-store';
import { createQueryClient } from '@/queue/query-client';
import { queueQueryKey } from '@/queue/use-queue';
import { errorPayload, FakeServer, tokenPayload } from '@/test-support/fake-server';

const ME = {
  user: {
    id: '1',
    email: 'driver@stlaurent.example.ca',
    role: 'driver',
    first_name: 'Camille',
    last_name: 'Roy',
    phone: null,
  },
  organization: {
    id: '2',
    name: 'Pharmacie Saint-Laurent',
    phone: null,
    timezone: 'America/Toronto',
    locale: 'fr',
  },
};

let server: FakeServer;
let queryClient: ReturnType<typeof createQueryClient>;

/** Renders the session state as text so assertions read like the UI does. */
function Probe() {
  const { state, signIn, signOut } = useSession();
  return (
    <>
      <Text testID="status">{state.status}</Text>
      <Text testID="reason">
        {state.status === 'signed-out' ? (state.endedReason ?? 'none') : 'n/a'}
      </Text>
      <Text testID="org">
        {state.status === 'signed-in' ? (state.profile?.organization.name ?? 'pending') : '—'}
      </Text>
      <Text
        testID="sign-in"
        onPress={() => {
          void signIn({ email: 'driver@stlaurent.example.ca', password: 'DevPassword123!' });
        }}>
        sign in
      </Text>
      <Text testID="sign-out" onPress={() => void signOut()}>
        sign out
      </Text>
    </>
  );
}

function renderSession() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockSecureStoreData.clear();
  resetSessionCache();
  resetRefreshState();
  queryClient = createQueryClient();
  server = new FakeServer();
  server.install();
});

afterEach(() => {
  server.restore();
  queryClient.clear();
});

describe('restoring on launch', () => {
  it('lands signed-out when the Keychain is empty', async () => {
    renderSession();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    // Nothing was taken away — this is a first launch, not an eviction.
    expect(screen.getByTestId('reason')).toHaveTextContent('none');
  });

  it('signs in from a stored credential and fills in the pharmacy', async () => {
    await saveSession({
      accessToken: 'access-live',
      refreshToken: 'refresh-live',
      expiresAt: Date.now() + 15 * 60_000,
    });
    server.on('GET', '/v1/auth/me', () => ({ body: ME }));

    renderSession();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));
    await waitFor(() =>
      expect(screen.getByTestId('org')).toHaveTextContent('Pharmacie Saint-Laurent'),
    );
  });

  it('stays signed in when the app launches offline', async () => {
    await saveSession({
      accessToken: 'access-live',
      refreshToken: 'refresh-live',
      expiresAt: Date.now() + 15 * 60_000,
    });
    // No route registered for /v1/auth/me — the FakeServer throws, which is
    // what an unreachable API looks like from `fetch`.
    renderSession();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));
    // Signed in, just without a pharmacy name yet. Kicking a driver to a login
    // screen because the van is in a parking garage is the wrong call.
    expect(screen.getByTestId('org')).toHaveTextContent('pending');
    expect(await loadSession()).not.toBeNull();
  });
});

describe('signing in and out', () => {
  it('persists the credential and reports the organization', async () => {
    server.on('POST', '/v1/auth/login', () => ({ body: tokenPayload({}) }));
    server.on('GET', '/v1/auth/me', () => ({ body: ME }));

    renderSession();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));

    await act(async () => {
      screen.getByTestId('sign-in').props.onPress();
    });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));
    resetSessionCache();
    expect((await loadSession())?.refreshToken).toBe('refresh-1');
  });

  it('drops cached patient data on sign-out, and says nothing was taken away', async () => {
    await saveSession({
      accessToken: 'access-live',
      refreshToken: 'refresh-live',
      expiresAt: Date.now() + 15 * 60_000,
    });
    server.on('GET', '/v1/auth/me', () => ({ body: ME }));
    server.on('POST', '/v1/auth/logout', () => ({ status: 204 }));

    renderSession();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));

    queryClient.setQueryData(queueQueryKey(), { stops: [{ address: '400 Dogwood St' }] });

    await act(async () => {
      screen.getByTestId('sign-out').props.onPress();
    });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    expect(queryClient.getQueryData(queueQueryKey())).toBeUndefined();
    // A deliberate sign-out is not an eviction, so there is no notice to show.
    expect(screen.getByTestId('reason')).toHaveTextContent('none');
  });
});

describe('deactivation mid-route (PRD §4.5)', () => {
  it('wipes the credential and the cache, and explains why', async () => {
    await saveSession({
      accessToken: 'access-live',
      refreshToken: 'refresh-live',
      expiresAt: Date.now() + 15 * 60_000,
    });
    server.on('GET', '/v1/auth/me', () => ({ body: ME }));
    server.on('GET', '/v1/driver/queue', () => ({
      status: 403,
      body: errorPayload('ACCOUNT_DISABLED', 'This account has been disabled'),
    }));

    renderSession();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));

    // Patient data sitting in the cache, exactly as a live queue screen leaves it.
    queryClient.setQueryData(queueQueryKey(), { stops: [{ address: '400 Dogwood St' }] });

    // The next call the app makes — from a poll, a drain, anywhere.
    await act(async () => {
      await expect(getQueue()).rejects.toBeTruthy();
    });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    expect(screen.getByTestId('reason')).toHaveTextContent('ACCOUNT_DISABLED');

    // Both halves of the wipe: the credential and the PII.
    resetSessionCache();
    expect(await loadSession()).toBeNull();
    expect(queryClient.getQueryData(queueQueryKey())).toBeUndefined();
  });

  it('reports a revoked token family as a plain expiry, not a deactivation', async () => {
    await saveSession({
      accessToken: 'access-stale',
      refreshToken: 'refresh-stale',
      // Expired, so the next call refreshes first — and the refresh is what fails.
      expiresAt: Date.now() - 1_000,
    });
    server.on('POST', '/v1/auth/refresh', () => ({
      status: 401,
      body: errorPayload('INVALID_REFRESH_TOKEN', 'That session has ended'),
    }));

    renderSession();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    expect(screen.getByTestId('reason')).toHaveTextContent('DEFAULT');
    expect(await loadSession()).toBeNull();
  });
});
