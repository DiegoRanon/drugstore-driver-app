/**
 * @jest-environment node
 *
 * The live gate for "the driver does not have to reload the app".
 *
 * The provider is tested against a socket double, which proves the policy and
 * assumes the transport. This drives the real one: the app's own
 * `createRealtimeSocket`, its own token path, a real server, a real handshake.
 *
 * The thing worth distrusting is everything the double stands in for — that the
 * server's Socket.IO path and the client's agree, that the handshake accepts a
 * token from `getValidAccessToken` rather than an ad-hoc header, that the event
 * names match on both sides, and that a frame actually arrives before the poll
 * would have. None of that is knowable from a fixture.
 *
 * Like the shift-alerts gate, this one *writes*. It creates one order and
 * cancels it in a `finally`, so a failed assertion cannot leave a phantom
 * delivery behind.
 *
 *     cd ../medibus-server && docker compose up -d && npm run dev
 *     npm run verify:api
 *
 * Never point this at an environment holding real patient records (PRD §8.3).
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

import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL, getQueue, login } from '../client';
import { REALTIME_PATH, createRealtimeSocket } from '../realtime';
import { fetchWithLoginBudget, withLoginBudget } from '@/test-support/live-login';

const DRIVER = { email: 'driver@stlaurent.example.ca', password: 'DevPassword123!' };
const ADMIN = { email: 'admin@stlaurent.example.ca', password: 'DevPassword123!' };

/** Long, because a login here may have to sit out the server's rate-limit window. */
jest.setTimeout(120_000);

/**
 * Well under the 30-second poll. The whole claim being tested is that the
 * driver hears about this without waiting for one, so a generous timeout here
 * would let a passing poll masquerade as a passing socket.
 */
const FRAME_TIMEOUT_MS = 8_000;

let socket: Socket | null = null;

afterEach(() => {
  socket?.removeAllListeners();
  socket?.close();
  socket = null;
});

function nextFrame(live: Socket, event: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no ${event} within ${FRAME_TIMEOUT_MS}ms`)),
      FRAME_TIMEOUT_MS,
    );
    live.once(event, (payload: Record<string, unknown>) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connected(live: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('socket never connected')),
      FRAME_TIMEOUT_MS,
    );
    live.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    live.once('connect_error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

describe('an order assigned while the app is open', () => {
  it('reaches the driver over the socket, carrying no patient data', async () => {
    await withLoginBudget(() => login(DRIVER));

    // The app's socket, built the way the provider builds it — including the
    // `auth` callback that pulls a token through the refresh mutex.
    socket = createRealtimeSocket();
    socket.connect();
    await connected(socket);

    const admin = await adminToken();
    const today = (await getQueue()).date;

    // Unassigned and scheduled: the two states this has to move out of before
    // the driver is told anything.
    const orderId = await createOrder(admin, today);

    try {
      const ready = nextFrame(socket, 'order.ready');
      await assign(admin, orderId, await driverId(admin));
      await markReady(admin, orderId);

      const payload = await ready;

      expect(payload.order_id).toBe(orderId);
      expect(payload.status).toBe('in_pharmacy');

      // The frame is a signal, not data (medibus-server/docs/realtime.md).
      // Asserted against the live server rather than a fixture, because this
      // is the one place a serializer change on the other side would show up.
      expect(Object.keys(payload).sort()).toEqual([
        'delivery_date',
        'order_id',
        'status',
      ]);

      // And the queue really does have it, so the refetch the provider fires
      // on this frame finds something.
      const queue = await getQueue();
      expect(queue.stops.some((stop) => stop.id === orderId)).toBe(true);
    } finally {
      await cancelOrder(admin, orderId);
    }
  });

  it('refuses a socket with no credential', async () => {
    // The negative half of the handshake, against the real middleware: an
    // unauthenticated socket must not be allowed to sit in a room.
    const anonymous = io(API_BASE_URL, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      auth: {},
      reconnection: false,
    });
    socket = anonymous;

    await expect(connected(anonymous)).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* The pharmacist's half — the admin dashboard's API                          */
/* -------------------------------------------------------------------------- */

async function adminToken(): Promise<string> {
  const res = await fetchWithLoginBudget(`${API_BASE_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  if (!res.ok) throw new Error(`admin login failed: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function adminGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function adminPost(token: string, path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
}

async function driverId(token: string): Promise<string> {
  const drivers = await adminGet<{ data: { id: string; email: string }[] }>(
    token,
    '/v1/drivers/',
  );
  const found = drivers.data.find((d) => d.email === DRIVER.email)?.id;
  if (!found) throw new Error('seeded driver not found');
  return found;
}

/** One unassigned order in the calendar — nothing the driver can see yet. */
async function createOrder(token: string, date: string): Promise<string> {
  // `is_active=true` is load-bearing: the seed leaves deactivated clients in
  // the list, and the server refuses an order for one with CLIENT_INACTIVE.
  const clients = await adminGet<{ data: { id: string }[] }>(
    token,
    '/v1/clients/?is_active=true&limit=1',
  );
  const clientId = clients.data[0]?.id;
  if (!clientId) throw new Error('no active seeded client to order for');

  const res = await fetch(`${API_BASE_URL}/v1/orders/`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      delivery_date: date,
      delivery_window: 'PM',
    }),
  });
  if (!res.ok) throw new Error(`create order failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

function assign(token: string, orderId: string, driver: string): Promise<void> {
  return adminPost(token, `/v1/orders/${orderId}/assign`, { driver_id: driver });
}

function markReady(token: string, orderId: string): Promise<void> {
  return adminPost(token, `/v1/orders/${orderId}/ready`, {});
}

function cancelOrder(token: string, orderId: string): Promise<void> {
  return adminPost(token, `/v1/orders/${orderId}/cancel`, {});
}
