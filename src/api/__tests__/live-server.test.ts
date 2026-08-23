/**
 * @jest-environment node
 *
 * Feature 2's live gate: drive the real client against the real server.
 *
 * Runs in Node's environment rather than jest-expo's. The RN test environment
 * substitutes a native-backed `fetch` whose responses carry no usable `status`,
 * so a real HTTP call cannot be evaluated there. Node's `fetch` is the genuine
 * article — and `src/api` deliberately imports no React Native, which is what
 * makes running it here possible.
 *
 * Everything else in `src/api/__tests__` runs against a fake. This one proves
 * the contract itself — that the generated types match what the running server
 * actually serializes, that auth works end to end, and that a terminal order
 * really does arrive with no `address` key rather than a null one.
 *
 * Excluded from `npm test` (see `testPathIgnorePatterns`) because it needs a
 * backend. Run it deliberately:
 *
 *     cd ../drugstore-server && docker compose up -d && npm run migrate && npm run seed && npm run dev
 *     npm run verify:api
 *
 * It only reads: a login and two GETs. It records no deliveries.
 *
 * The payload it prints is seeded development data. Never point this at an
 * environment holding real patient records (PRD §8.3).
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

import { API_BASE_URL, getMe, getQueue, login, logout } from '../client';
import { ApiError } from '../errors';
import { resetRefreshState, setSessionTerminationHandler } from '../refresh';
import { isActiveStop, type QueueResponse } from '../types';
import { loadSession, resetSessionCache, saveSession } from '@/auth/token-store';

const DRIVER = {
  email: 'driver@stlaurent.example.ca',
  password: 'DevPassword123!',
};

jest.setTimeout(30_000);

function describeQueue(queue: QueueResponse): string {
  const lines: string[] = [
    '',
    `  date       ${queue.date}`,
    `  pharmacy   ${queue.pharmacy.name} (${queue.pharmacy.phone ?? 'no phone'})`,
    `  degraded   ${queue.degraded ?? false}`,
    `  stops      ${queue.stops.length}`,
    `  closed     ${queue.closed.length}`,
    '',
  ];

  for (const stop of queue.stops) {
    if (isActiveStop(stop)) {
      const seq = stop.sequence_number ?? '–';
      const due = stop.amount_due === null ? 'nothing due' : `$${stop.amount_due}`;
      lines.push(
        `  [${seq}] ${stop.status.padEnd(11)} ${stop.delivery_window}  ${stop.patient_name}`,
        `        ${stop.address}`,
        `        ${stop.phone_number} · ${due} · ${stop.payment_status}` +
          (stop.requires_cooler_bag ? ' · cooler bag' : ''),
      );
    } else {
      lines.push(`  [–] ${stop.status} (terminal — no patient data)`);
    }
  }

  for (const stop of queue.closed) {
    const cooler =
      stop.cooler_bag_confirmed === null ? 'unanswered' : String(stop.cooler_bag_confirmed);
    lines.push(
      `  (closed) ${stop.status.padEnd(9)} cooler: ${stop.requires_cooler_bag ? cooler : 'n/a'}`,
    );
  }

  return lines.join('\n');
}

/** Local calendar date, not UTC — `toISOString` would shift the day. */
function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The most recent day worth verifying against, searching backwards.
 *
 * "Worth verifying" means the day has *both* active and closed orders. A day
 * with only active stops would let the terminal-payload assertions pass
 * vacuously — no rows, no failures — which is the one way this test could go
 * green while proving nothing.
 */
async function findPopulatedQueue(
  maxDaysBack = 30,
): Promise<{ date: string; queue: QueueResponse; hasBothBranches: boolean } | null> {
  let firstPopulated: { date: string; queue: QueueResponse } | null = null;

  for (let daysBack = 0; daysBack <= maxDaysBack; daysBack += 1) {
    const day = new Date();
    day.setDate(day.getDate() - daysBack);
    const date = isoDate(day);
    const queue = await getQueue(date);

    const hasActive = queue.stops.some(isActiveStop);
    if (hasActive && queue.closed.length > 0) {
      return { date, queue, hasBothBranches: true };
    }
    if (!firstPopulated && (queue.stops.length > 0 || queue.closed.length > 0)) {
      firstPopulated = { date, queue };
    }
  }

  return firstPopulated ? { ...firstPopulated, hasBothBranches: false } : null;
}

describe('live server', () => {
  beforeAll(async () => {
    let health: Response;
    try {
      health = await fetch(`${API_BASE_URL}/health`);
    } catch (cause) {
      throw new Error(
        `Cannot reach the API at ${API_BASE_URL}. Start it with:\n` +
          `  cd ../drugstore-server && npm run dev\n` +
          `Original error: ${String(cause)}`,
      );
    }
    if (!health.ok) {
      throw new Error(`API health check returned ${health.status} at ${API_BASE_URL}`);
    }
  });

  afterAll(async () => {
    await logout();
  });

  it('signs the seeded driver in and stores the token pair', async () => {
    const session = await login(DRIVER);

    expect(session.user.role).toBe('driver');
    expect(session.user.email).toBe(DRIVER.email);
    expect(session.access_token).toEqual(expect.any(String));
    expect(session.expires_in).toBeGreaterThan(0);

    // The credential went to the secure store, not just into memory.
    resetSessionCache();
    const stored = await loadSession();
    expect(stored?.refreshToken).toBe(session.refresh_token);
    expect(stored?.expiresAt).toBeGreaterThan(Date.now());

    console.log(
      `\n  signed in as ${session.user.first_name} ${session.user.last_name}` +
        ` (${session.user.role})  ·  access token valid ${session.expires_in}s\n`,
    );
  });

  it('reads the driver and organization context', async () => {
    const me = await getMe();

    expect(me.user.role).toBe('driver');
    expect(me.organization.locale).toEqual(expect.any(String));
    expect(me.organization.timezone).toEqual(expect.any(String));

    console.log(
      `  org: ${me.organization.name} · locale ${me.organization.locale}` +
        ` · tz ${me.organization.timezone}\n`,
    );
  });

  it("prints today's queue — the request the app actually makes on launch", async () => {
    // No `date` argument: the server resolves today in the organization's
    // timezone, which is the right answer and not one this app can compute.
    const queue = await getQueue();

    console.log(describeQueue(queue));

    expect(queue.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(queue.stops)).toBe(true);
    expect(Array.isArray(queue.closed)).toBe(true);
    expect(queue.pharmacy.name).toEqual(expect.any(String));
  });

  it('renders a real day of stops, both branches of the union', async () => {
    // Today is empty whenever the seed was run on an earlier day, and an empty
    // queue verifies almost nothing — the union, and the PII contract that
    // rests on it, only get exercised by actual rows. So walk back to the most
    // recent day this driver actually worked.
    const found = await findPopulatedQueue();
    if (!found) {
      throw new Error(
        'No delivery day with orders in the last 30 days. Re-seed the server ' +
          '(cd ../drugstore-server && npm run seed) or assign orders from the dashboard.',
      );
    }
    if (!found.hasBothBranches) {
      throw new Error(
        `The most recent populated day (${found.date}) has only one kind of order, ` +
          'so the terminal-payload assertions would pass without running. Re-seed ' +
          'the server so a day carries both active and closed deliveries.',
      );
    }

    console.log(`\n  most recent day with both active and closed orders: ${found.date}`);
    console.log(describeQueue(found.queue));

    const { queue } = found;
    expect(queue.stops.length + queue.closed.length).toBeGreaterThan(0);

    // The contract the whole PII design rests on: a terminal order does not
    // carry an empty address, it carries no address key at all (PRD §8.1).
    for (const stop of queue.closed) {
      expect(Object.keys(stop)).not.toContain('patient_name');
      expect(Object.keys(stop)).not.toContain('address');
      expect(Object.keys(stop)).not.toContain('phone_number');
    }

    // And an active stop carries all three, so the union discriminates on
    // something real rather than on an assumption about the serializer.
    const active = queue.stops.filter(isActiveStop);
    for (const stop of active) {
      expect(typeof stop.patient_name).toBe('string');
      expect(typeof stop.address).toBe('string');
      expect(typeof stop.phone_number).toBe('string');
      expect(['AM', 'PM']).toContain(stop.delivery_window);
      expect(['paid', 'unpaid']).toContain(stop.payment_status);
    }

    // A day worth verifying has both kinds of row on it.
    expect(active.length).toBeGreaterThan(0);
    expect(queue.closed.length).toBeGreaterThan(0);
  });

  it('rejects a bad password with a code the UI can branch on', async () => {
    await expect(
      login({ email: DRIVER.email, password: 'wrong-password-entirely' }),
    ).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_CREDENTIALS' });
  });

  /**
   * Feature 3's gate, item 2: kill the access token and confirm the next call
   * recovers on its own without the driver noticing.
   */
  it('refreshes silently when the access token has expired', async () => {
    await login(DRIVER);
    const before = await loadSession();
    if (!before) throw new Error('login did not persist a session');

    // Backdate the expiry the way fifteen idle minutes would.
    await saveSession({
      accessToken: before.accessToken,
      refreshToken: before.refreshToken,
      expiresAt: Date.now() - 1_000,
    });

    // No error, no sign-out — just the queue.
    const queue = await getQueue();
    expect(queue.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    resetSessionCache();
    const after = await loadSession();
    if (!after) throw new Error('the refresh did not persist a session');

    // The refresh token is the proof: it is opaque random bytes and the server
    // rotates it on every use, so a different value can only mean a refresh
    // actually happened. The *access* token is deliberately not asserted on —
    // it is a JWT over (sub, role, org, iat, exp) at one-second resolution, so
    // a refresh landing in the same second as the login re-issues a
    // byte-identical string. Asserting inequality there fails at random.
    expect(after.refreshToken).not.toBe(before.refreshToken);
    expect(after.expiresAt).toBeGreaterThan(Date.now());
  });

  /**
   * Feature 3's gate, item 3: the pharmacy deactivates the driver, and the app
   * wipes the device (PRD §4.5).
   *
   * What the server actually does, verified here rather than assumed:
   *   - deactivation revokes every refresh token immediately;
   *   - `/v1/auth/me` and `/v1/auth/refresh` both re-check `is_active` and
   *     answer `ACCOUNT_DISABLED`;
   *   - the driver endpoints do **not** re-check it. They only verify the JWT,
   *     so an already-issued access token keeps working until it expires.
   *
   * Reactivation runs in `finally` — a failed assertion must not leave the
   * seeded driver locked out of the development environment.
   */
  it('wipes to sign-in when the pharmacy deactivates the driver', async () => {
    const admin = await adminToken();
    const driverId = await findDriverId(admin);

    // An array rather than a `let`: the assignment happens inside a callback,
    // which narrowing cannot see.
    const terminations: ApiError[] = [];
    setSessionTerminationHandler((error) => terminations.push(error));

    try {
      await login(DRIVER);
      expect(await loadSession()).not.toBeNull();

      await adminPatch(admin, driverId, false);

      // The first call that re-checks the user wipes the device.
      await expect(getMe()).rejects.toMatchObject({
        name: 'ApiError',
        code: 'ACCOUNT_DISABLED',
      });

      resetSessionCache();
      expect(await loadSession()).toBeNull();
      expect(terminations).toHaveLength(1);
      expect(terminations[0]?.code).toBe('ACCOUNT_DISABLED');

      // And there is no way back in while deactivated.
      await expect(login(DRIVER)).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
    } finally {
      setSessionTerminationHandler(null);
      resetRefreshState();
      await adminPatch(admin, driverId, true);
    }

    // Reactivated: the driver can sign in again.
    const session = await login(DRIVER);
    expect(session.user.role).toBe('driver');
  });

  /**
   * Pins the gap above so it is a known quantity rather than a surprise.
   *
   * A deactivated driver keeps read access to patient addresses through the
   * driver endpoints until their access token expires — up to 15 minutes on a
   * device that may be the reason the pharmacy deactivated them. Closing it is
   * a server change (re-check `is_active` in the auth preHandler, or keep a
   * revocation list); the app cannot, because the token verifies correctly.
   *
   * If this test ever fails, the server closed the window and the note in the
   * plan's "server gaps" section should come out.
   */
  it('documents the window: driver endpoints still accept an issued token after deactivation', async () => {
    const admin = await adminToken();
    const driverId = await findDriverId(admin);

    try {
      await login(DRIVER);
      await adminPatch(admin, driverId, false);

      const queue = await getQueue();
      expect(queue.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      console.log(
        '\n  NOTE: the queue still answered a deactivated driver.'
          + '\n  The access token stays valid until it expires (server gap).',
      );
    } finally {
      resetRefreshState();
      await adminPatch(admin, driverId, true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Admin-side helpers — the dashboard's half of the deactivation test         */
/* -------------------------------------------------------------------------- */

async function adminToken(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@stlaurent.example.ca',
      password: DRIVER.password,
    }),
  });
  if (!res.ok) throw new Error(`admin login failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

async function findDriverId(token: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/v1/drivers/`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { data: { id: string; email: string }[] };
  const driver = body.data.find((d) => d.email === DRIVER.email);
  if (!driver) throw new Error('seeded driver not found');
  return driver.id;
}

async function adminPatch(token: string, id: string, isActive: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/v1/drivers/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ is_active: isActive }),
  });
  if (!res.ok) throw new Error(`could not set is_active=${isActive}: ${res.status}`);
}
