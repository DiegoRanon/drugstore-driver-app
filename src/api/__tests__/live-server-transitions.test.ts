/**
 * @jest-environment node
 *
 * Does `src/api/transitions.ts` still describe the server's state machine?
 *
 * The app has to hold that table itself: `available_transitions` exists on the
 * admin `orderResponse` and on no driver payload, so there is nothing to
 * render buttons from. A mirror is only as good as the thing that catches it
 * drifting, and a fixture cannot — it would just be the same guess written
 * twice.
 *
 * So this walks two real orders through every state a driver can reach, and at
 * each step asserts both directions: every transition the table offers
 * succeeds, and every one it withholds is refused. A rule the server adds or
 * removes fails here rather than as a dead button in a stairwell.
 *
 *     cd ../drugstore-server && docker compose up -d && npm run dev
 *     npm run verify:api
 *
 * It writes. Both orders are walked to a terminal state or cancelled in a
 * `finally`, so a failed assertion cannot leave a phantom delivery behind.
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

import {
  API_BASE_URL,
  completeOrder,
  getQueue,
  handoverOrder,
  login,
  pickupOrder,
  returnOrder,
} from '../client';
import { ApiError } from '../errors';
import { driverTransitions, type DriverTransition } from '../transitions';
import type { StopStatus } from '../types';
import { fetchWithLoginBudget, withLoginBudget } from '@/test-support/live-login';

const DRIVER = { email: 'driver@stlaurent.example.ca', password: 'DevPassword123!' };
const ADMIN = { email: 'admin@stlaurent.example.ca', password: 'DevPassword123!' };

jest.setTimeout(180_000);

/** Every driver verb, so each step can try the ones it should not be allowed. */
const ATTEMPT: Record<DriverTransition, (id: string) => Promise<unknown>> = {
  pickup: (id) => pickupOrder(id),
  complete: (id) => completeOrder(id),
  return: (id) => returnOrder(id, { reason: 'customer_absent' }),
  handover: (id) => handoverOrder(id),
};

const ALL: DriverTransition[] = ['pickup', 'complete', 'return', 'handover'];

/**
 * Assert the negative half at one state.
 *
 * The server has several ways to say no — 409 for the wrong step, 422 for a
 * missing precondition, 404 once a row leaves the driver's scope — and which
 * one is not this test's business. That it refuses at all is.
 */
async function refusesEverythingExcept(id: string, allowed: readonly DriverTransition[]) {
  for (const transition of ALL) {
    if (allowed.includes(transition)) continue;

    await expect(ATTEMPT[transition](id)).rejects.toBeInstanceOf(ApiError);
  }
}

describe('the transitions table, against the running server', () => {
  it('walks a delivered order and refuses everything the table withholds', async () => {
    const admin = await adminToken();
    await withLoginBudget(() => login(DRIVER));

    const today = (await getQueue()).date;
    const orderId = await createOrder(admin, today);
    let terminal = false;

    try {
      // `scheduled` — invisible to the driver entirely, so the id 404s rather
      // than answering ORDER_NOT_READY. Nothing in the app may special-case a
      // "not packed yet" message, because it can never be shown one.
      await expect(pickupOrder(orderId)).rejects.toMatchObject({ status: 404 });

      await markReady(admin, orderId);
      await expectStatus(orderId, 'in_pharmacy');
      expect(driverTransitions('in_pharmacy')).toEqual(['pickup']);
      await refusesEverythingExcept(orderId, ['pickup']);

      await pickupOrder(orderId);
      await expectStatus(orderId, 'picked_up');
      // Try `return` here and the order would be gone; the complete below is
      // the positive half for both verbs this state allows, and the negative
      // half is covered on the second order.
      await refusesEverythingExcept(orderId, ['complete', 'return']);

      await completeOrder(orderId);
      terminal = true;
      await expectStatus(orderId, 'completed');
      expect(driverTransitions('completed')).toEqual([]);
      await refusesEverythingExcept(orderId, []);
    } finally {
      if (!terminal) await cancelOrder(admin, orderId);
    }
  });

  /**
   * The leg the PRD used to say did not exist.
   *
   * `returned` is not terminal — one thing can still happen to it — and if the
   * table ever answered `[]` here the parcel would be unreachable from the app
   * and would live in the van forever.
   */
  it('walks a failed delivery through the return leg', async () => {
    const admin = await adminToken();
    await withLoginBudget(() => login(DRIVER));

    const today = (await getQueue()).date;
    const orderId = await createOrder(admin, today);
    let terminal = false;

    try {
      await markReady(admin, orderId);
      await pickupOrder(orderId);

      await returnOrder(orderId, { reason: 'customer_absent', note: 'no answer' });
      await expectStatus(orderId, 'returned');
      expect(driverTransitions('returned')).toEqual(['handover']);
      await refusesEverythingExcept(orderId, ['handover']);

      // Still open, and already PII-free: the attempt is over, so the patient's
      // details go — while the label codes stay, because the driver has to
      // hand the right parcels back (`privacy-rules.md` §1, §4).
      const owed = (await getQueue()).to_return.find((stop) => stop.id === orderId);
      expect(owed).toBeDefined();
      expect(Object.hasOwn(owed!, 'patient_name')).toBe(false);
      expect(Object.hasOwn(owed!, 'address')).toBe(false);
      // The driver's own words are admin-only and never come back.
      expect(Object.hasOwn(owed!, 'failure_note')).toBe(false);
      expect(owed!.packages.length).toBeGreaterThan(0);

      await handoverOrder(orderId);
      terminal = true;
      await expectStatus(orderId, 'returned_to_pharmacy');
      expect(driverTransitions('returned_to_pharmacy')).toEqual([]);
      await refusesEverythingExcept(orderId, []);

      // And it is finished, not still owed.
      const settled = await getQueue();
      expect(settled.to_return.some((stop) => stop.id === orderId)).toBe(false);
      expect(settled.closed.some((stop) => stop.id === orderId)).toBe(true);
    } finally {
      if (!terminal) await cancelOrder(admin, orderId);
    }
  });
});

/* -------------------------------------------------------------------------- */

/** Reads one order's status out of whichever bucket it is in. */
async function expectStatus(orderId: string, status: StopStatus): Promise<void> {
  const queue = await getQueue();
  const found = [...queue.stops, ...queue.to_return, ...queue.closed].find(
    (stop) => stop.id === orderId,
  );

  expect(found?.status).toBe(status);
}

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

/** One order for `date`, assigned to the seeded driver, with two parcels. */
async function createOrder(token: string, date: string): Promise<string> {
  // `is_active=true` is load-bearing: the seed leaves deactivated clients in
  // the list, and the server refuses an order for one with CLIENT_INACTIVE.
  const clients = await adminGet<{ data: { id: string }[] }>(
    token,
    '/v1/clients/?is_active=true&limit=1',
  );
  const clientId = clients.data[0]?.id;
  if (!clientId) throw new Error('no active seeded client to order for');

  const drivers = await adminGet<{ data: { id: string; email: string }[] }>(
    token,
    '/v1/drivers/',
  );
  const driverId = drivers.data.find((d) => d.email === DRIVER.email)?.id;
  if (!driverId) throw new Error('seeded driver not found');

  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  const res = await fetch(`${API_BASE_URL}/v1/orders/`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      driver_id: driverId,
      delivery_date: date,
      delivery_window: 'PM',
      packages: [{ label_code: `${suffix}-A` }, { label_code: `${suffix}-B` }],
    }),
  });
  if (!res.ok) throw new Error(`create order failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function markReady(token: string, orderId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/v1/orders/${orderId}/ready`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`mark ready failed: ${res.status} ${await res.text()}`);
}

async function cancelOrder(token: string, orderId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/v1/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`cancel failed: ${res.status} ${await res.text()}`);
}
