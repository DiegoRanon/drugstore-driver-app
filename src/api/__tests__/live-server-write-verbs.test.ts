/**
 * @jest-environment node
 *
 * The two write behaviours the app bets on and cannot test against a fixture.
 *
 * **Idempotent replay.** With no outbox (PRD §6 is deferred), the only thing
 * between a dropped connection and a double-write is the server replaying a
 * stored response for a key it has seen. The app sends one on every driver
 * verb; whether the server honours it is not something a fake can answer.
 *
 * **`POST /v1/driver/queue/sequence` clears what it is not sent.** Any active
 * order missing from `ordered_order_ids` has its `sequence_number` nulled. The
 * reorder sheet is built around that — it lists Ready *and* On the way
 * together, even though it opens from On the way — and this is the assertion
 * that says the reason is real rather than folklore.
 *
 *     cd ../drugstore-server && docker compose up -d && npm run dev
 *     npm run verify:api
 *
 * It writes, and cleans up in a `finally`. Never point it at an environment
 * holding real patient records (PRD §8.3).
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
  getQueue,
  login,
  requestWithMeta,
  sequenceQueue,
} from '../client';
import { newIdempotencyKey } from '../idempotency';
import { isActiveStop, type MutatedStop } from '../types';
import { fetchWithLoginBudget, withLoginBudget } from '@/test-support/live-login';

const DRIVER = { email: 'driver@stlaurent.example.ca', password: 'DevPassword123!' };
const ADMIN = { email: 'admin@stlaurent.example.ca', password: 'DevPassword123!' };

jest.setTimeout(180_000);

describe('idempotency', () => {
  /**
   * The same key, the same body, twice.
   *
   * The second call must not run the handler again — the server answers with
   * the stored response and `idempotent-replay: true`. That is exactly what a
   * driver's phone does when the first attempt's response never made it back
   * through a concrete stairwell.
   */
  it('replays a pickup rather than performing it twice', async () => {
    const admin = await adminToken();
    await withLoginBudget(() => login(DRIVER));

    const today = (await getQueue()).date;
    const orderId = await createOrder(admin, today);
    let terminal = false;

    try {
      await markReady(admin, orderId);

      const key = newIdempotencyKey('pickup');
      const path = `/v1/driver/orders/${orderId}/pickup`;

      const first = await requestWithMeta<MutatedStop>(path, {
        method: 'POST',
        body: {},
        idempotencyKey: key,
      });
      expect(first.idempotentReplay).toBe(false);
      expect(first.data.status).toBe('picked_up');

      // Byte-identical retry. The server fingerprints method + URL + body
      // against the key, so this either replays or is rejected — never runs.
      const replay = await requestWithMeta<MutatedStop>(path, {
        method: 'POST',
        body: {},
        idempotencyKey: key,
      });
      expect(replay.idempotentReplay).toBe(true);
      expect(replay.data).toEqual(first.data);

      // And without the key it is a second attempt at a transition that has
      // already happened, which is a conflict.
      await expect(
        requestWithMeta<MutatedStop>(path, { method: 'POST', body: {} }),
      ).rejects.toMatchObject({ status: 409 });

      await requestWithMeta<MutatedStop>(`/v1/driver/orders/${orderId}/complete`, {
        method: 'POST',
        body: {},
        idempotencyKey: newIdempotencyKey('complete'),
      });
      terminal = true;
    } finally {
      if (!terminal) await cancelOrder(admin, orderId);
    }
  });

  /*
    A different body under a key the server has already seen is a client bug,
    not a retry — the app must never "fix" it by resending. The transport
    guards the length ceiling for the same reason: catching it locally saves a
    round trip a driver in a dead zone cannot spare.
  */
  it('refuses the same key with a different body', async () => {
    const admin = await adminToken();
    await withLoginBudget(() => login(DRIVER));

    const today = (await getQueue()).date;
    const orderId = await createOrder(admin, today);
    let terminal = false;

    try {
      await markReady(admin, orderId);

      const key = newIdempotencyKey('pickup');
      const path = `/v1/driver/orders/${orderId}/pickup`;

      await requestWithMeta<MutatedStop>(path, {
        method: 'POST',
        body: { confirmed_package_count: 2 },
        idempotencyKey: key,
      });

      await expect(
        requestWithMeta<MutatedStop>(path, {
          method: 'POST',
          body: { confirmed_package_count: 1 },
          idempotencyKey: key,
        }),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });

      await requestWithMeta<MutatedStop>(`/v1/driver/orders/${orderId}/complete`, {
        method: 'POST',
        body: {},
        idempotencyKey: newIdempotencyKey('complete'),
      });
      terminal = true;
    } finally {
      if (!terminal) await cancelOrder(admin, orderId);
    }
  });
});

describe('the label check at the counter', () => {
  /**
   * "Les colis sur le comptoir font foi."
   *
   * A count that disagrees with the order is accepted and logged, never
   * refused. The pickup sheet is built on that — the confirm button stays
   * enabled at any count — so if the server ever started refusing, the app
   * would strand a driver mid-conversation with an employee.
   */
  it('accepts a package count that disagrees with the order', async () => {
    const admin = await adminToken();
    await withLoginBudget(() => login(DRIVER));

    const today = (await getQueue()).date;
    const orderId = await createOrder(admin, today);
    let terminal = false;

    try {
      await markReady(admin, orderId);

      // The order was created with two parcels; the driver ticks one.
      const result = await requestWithMeta<MutatedStop>(
        `/v1/driver/orders/${orderId}/pickup`,
        {
          method: 'POST',
          body: { confirmed_package_count: 1 },
          idempotencyKey: newIdempotencyKey('pickup'),
        },
      );

      expect(result.status).toBe(200);
      expect(result.data.status).toBe('picked_up');

      await requestWithMeta<MutatedStop>(`/v1/driver/orders/${orderId}/complete`, {
        method: 'POST',
        body: {},
        idempotencyKey: newIdempotencyKey('complete'),
      });
      terminal = true;
    } finally {
      if (!terminal) await cancelOrder(admin, orderId);
    }
  });
});

describe('manual sequencing', () => {
  /**
   * The trap the reorder sheet is shaped around.
   *
   * Send a partial list and every active order left out comes back with
   * `sequence_number: null`. A sheet that edited only the van's contents would
   * silently unsequence everything still at the counter — which is why it
   * lists Ready and On the way together.
   */
  it('clears the sequence of every active stop left out of the list', async () => {
    const admin = await adminToken();
    await withLoginBudget(() => login(DRIVER));

    const today = (await getQueue()).date;
    const kept = await createOrder(admin, today);
    const omitted = await createOrder(admin, today);

    try {
      await markReady(admin, kept);
      await markReady(admin, omitted);

      // Both sequenced first, so "null" below is a change and not the default.
      const seeded = await sequenceQueue({
        date: today,
        ordered_order_ids: [kept, omitted],
      });
      expect(sequenceOf(seeded, kept)).toBe(1);
      expect(sequenceOf(seeded, omitted)).toBe(2);

      const partial = await sequenceQueue({ date: today, ordered_order_ids: [kept] });

      expect(sequenceOf(partial, kept)).toBe(1);
      expect(sequenceOf(partial, omitted)).toBeNull();
    } finally {
      await cancelOrder(admin, kept);
      await cancelOrder(admin, omitted);
    }
  });
});

/* -------------------------------------------------------------------------- */

function sequenceOf(
  queue: Awaited<ReturnType<typeof getQueue>>,
  orderId: string,
): number | null | undefined {
  const stop = queue.stops.find((candidate) => candidate.id === orderId);
  if (!stop || !isActiveStop(stop)) return undefined;
  return stop.sequence_number;
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

  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
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
  // A terminal order cannot be cancelled, and cleanup must not mask the real
  // failure that got us here.
  if (!res.ok && res.status !== 409 && res.status !== 422) {
    throw new Error(`cancel failed: ${res.status} ${await res.text()}`);
  }
}
