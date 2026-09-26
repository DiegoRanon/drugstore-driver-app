/**
 * @jest-environment node
 *
 * W1's live gate: does the app actually notice an order added mid-shift?
 *
 * The hermetic tests prove the diff logic against payloads this file's author
 * wrote. That is exactly the thing worth distrusting here — the whole feature
 * rests on ids being stable across polls, on `date` meaning what the reducer
 * assumes, and on an order created through the admin dashboard landing in the
 * driver's `stops` as `in_pharmacy`. None of that is knowable from a fixture.
 *
 * So this drives the real thing: sign in as the seeded driver, take a baseline
 * from today's real queue, create an order through the admin API the way a
 * pharmacist would at 2pm, have staff declare it packed, poll again, and
 * assert the driver is told about exactly that one order and no others.
 *
 * The two-step creation is the point of the extra assertion in the middle.
 * `POST /v1/orders` now produces a `scheduled` order that no driver can see;
 * it takes `POST /v1/orders/{id}/ready` to put it on the counter. Shipping a
 * client against that change without noticing is the single most likely way to
 * break this app, so the invisible window is asserted rather than skipped.
 *
 * Unlike the rest of the live gate, this one *writes*. It creates a single
 * order and cancels it in a `finally`, so a failed assertion cannot leave a
 * phantom delivery in the development environment.
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

import { API_BASE_URL, getQueue, login } from '../client';
import { fetchWithLoginBudget, withLoginBudget } from '@/test-support/live-login';
import {
  INITIAL_SHIFT_ALERTS,
  acknowledgeShiftAlerts,
  reduceShiftAlerts,
} from '@/queue/shift-alerts';

const DRIVER = { email: 'driver@stlaurent.example.ca', password: 'DevPassword123!' };
const ADMIN = { email: 'admin@stlaurent.example.ca', password: 'DevPassword123!' };

/** Long, because a login here may have to sit out the server's rate-limit window. */
jest.setTimeout(120_000);

describe('an order added mid-shift', () => {
  it('reaches the driver as an alert, and only that order', async () => {
    await withLoginBudget(() => login(DRIVER));

    // The launch payload. Whatever is already on the run today is the
    // baseline — a driver opening the app is not told their own day is new.
    const before = await getQueue();
    let alerts = reduceShiftAlerts(INITIAL_SHIFT_ALERTS, before);

    expect(alerts.pending.size).toBe(0);
    expect(alerts.date).toBe(before.date);

    const admin = await adminToken();
    const orderId = await createOrder(admin, before.date);

    try {
      /*
        An order is born in the admin's calendar, not on the counter. Until
        staff declare it packed, the repository excludes it from every driver
        query — so this poll must find nothing, and a driver hitting the id
        directly would get 404 rather than a "not ready" message.
      */
      const beforeReady = await getQueue();
      expect(beforeReady.stops.some((stop) => stop.id === orderId)).toBe(false);
      alerts = reduceShiftAlerts(alerts, beforeReady);
      expect(alerts.pending.size).toBe(0);

      await markReady(admin, orderId);

      // The next 30-second poll.
      const after = await getQueue();
      alerts = reduceShiftAlerts(alerts, after);

      expect([...alerts.pending]).toEqual([orderId]);

      // The new order really is a package waiting at the counter, not
      // something the reducer happened to guess right about.
      const created = after.stops.find((stop) => stop.id === orderId);
      expect(created?.status).toBe('in_pharmacy');

      // A quiet poll afterwards keeps saying it, and says nothing more.
      const unchanged = await getQueue();
      alerts = reduceShiftAlerts(alerts, unchanged);
      expect([...alerts.pending]).toEqual([orderId]);

      // The driver reads the banner and dismisses it.
      alerts = acknowledgeShiftAlerts(alerts);
      const afterDismissal = await getQueue();
      alerts = reduceShiftAlerts(alerts, afterDismissal);
      expect(alerts.pending.size).toBe(0);
    } finally {
      await cancelOrder(admin, orderId);
    }

    // Cancelled orders leave `stops` for `closed`, and a package that is no
    // longer at the counter cannot still be waiting at it.
    const settled = await getQueue();
    alerts = reduceShiftAlerts(alerts, settled);
    expect(alerts.pending.size).toBe(0);
    expect(settled.stops.some((stop) => stop.id === orderId)).toBe(false);
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

/** Creates one order for `date`, assigned to the seeded driver. */
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

  const res = await fetch(`${API_BASE_URL}/v1/orders/`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      driver_id: driverId,
      delivery_date: date,
      delivery_window: 'PM',
    }),
  });
  if (!res.ok) throw new Error(`create order failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

/**
 * "Le jour de la commande, les employés préparent physiquement la commande et
 * la déclare comme prête à être prise en charge."
 *
 * Deliberately not folded into `createOrder`: the gap between the two is a
 * real state the driver must not be able to see, and the test asserts it.
 */
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
