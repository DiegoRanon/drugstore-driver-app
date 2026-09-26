# Live API Test Plan — everything built through Feature 3

Companion to [MVP_V1.md](../Plans/MVP_V1.md). That document says what was built and why;
this one is the procedure for proving it still works **against the real server with real
data**, not against fixtures.

Everything below was executed end to end on **2026-08-23** against `medibus-server` on
`localhost:3000`. Expected values are what the server actually returned, not what the spec
promises.

---

## 1. Scope

### In scope — built and testable today

| Area       | What exists                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Transport  | `src/api/http.ts`, `client.ts`, `refresh.ts`, `errors.ts`, generated `schema.d.ts`                                             |
| Auth       | login, driver registration by invite, logout, `/v1/auth/me`, silent refresh, terminal-code wipe                                |
| Session    | secure token store, `Stack.Protected` guards, `/` redirect, restore-on-launch                                                  |
| Queue read | `GET /v1/driver/queue` split across Ready / On the way / Done, tab badges, pull-to-refresh, error banner + retry, empty states |
| Privacy    | closed orders carry no PII; inactive tabs draw nothing; `gcTime: 0`                                                            |
| i18n       | FR default, FR/EN toggle **on the auth screens only**                                                                          |
| Design     | glass system, gallery at `/design`                                                                                             |

### Out of scope — not built yet, do not raise as defects

- **All write verbs** — pickup, complete, return, payment, cooler-check (Feature 5, outbox).
- **Route optimization and Navigate** (Feature 6). The app never calls `/v1/driver/queue/optimize`.
- **30-second foreground poll** (Feature 4). Refresh is pull-to-refresh only.
- **Stop sheet and next-stop hero card.** `stop-sheet.tsx` and `next-stop-card.tsx` are built
  and rendered **only in the** `/design` **gallery** — they are not wired into the three tabs.
- **i18next /** `expo-localization` and seeding locale from `organization.locale` (Feature 4).
  Locale is a plain React provider defaulting to `fr`.
- **Offline behaviour.** With no outbox, offline is an error banner, nothing more.

---

## 2. Prerequisites

```bash
# in ../medibus-server
docker compose up -d          # postgres :5433, redis :6379
npm run migrate && npm run seed
npm run dev                   # :3000
```

Confirm it answers before going further:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health   # expect 200
```

Base URL resolution ([http.ts:24](../../src/api/http.ts#L24)) is `EXPO_PUBLIC_API_URL` ?? the
per-platform default:

| Target                    | URL                     | How to start                                              |
| ------------------------- | ----------------------- | --------------------------------------------------------- |
| Web / iOS simulator       | `http://localhost:3000` | `npx expo start`                                          |
| Android emulator          | `http://10.0.2.2:3000`  | `npx expo start`                                          |
| Physical device (Expo Go) | your LAN IP             | `EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000 npx expo start` |

> Loopback will not resolve from a phone. If the queue shows the offline banner on a real
> device, this is the first thing to check.

### Accounts

| Role           | Email                         | Password          |
| -------------- | ----------------------------- | ----------------- |
| Driver, FR org | `driver@stlaurent.example.ca` | `DevPassword123!` |
| Admin, FR org  | `admin@stlaurent.example.ca`  | `DevPassword123!` |
| Driver, EN org | `driver@riverside.example.ca` | `DevPassword123!` |

### Fixed IDs (FR org)

|                                       |                                        |
| ------------------------------------- | -------------------------------------- |
| Driver user id (= `orders.driver_id`) | `1337a8e9-f2c5-4621-a462-02a384781e00` |
| Organization id                       | `b18ffdd4-eca3-4927-9495-f75ed6b00ede` |
| EN-org driver id                      | `df60ab28-a6eb-4fa0-a706-f61e8078ea13` |

---

## 3. Step 0 — automated gates

Run these before touching the UI. All three must be green.

```bash
npx tsc --noEmit          # expect: no output
npm test                  # expect: 8 suites, 97 tests passing
npm run verify:api        # expect: 8/8 — needs the server running
```

`npm run verify:api` is the live contract gate: it signs the seeded driver in, reads
`/v1/auth/me`, prints the queue, forces a refresh with a backdated access token, and
deactivates then reactivates the driver through the admin API.

`act(...)` warnings from `@expo/vector-icons` during `npm test` are font-loading noise, not
failures.

### Contract drift check

The generated `src/api/schema.d.ts` comes from the checked-in `openapi.json`. Confirm the
running server still agrees with it:

```bash
curl -s http://localhost:3000/docs/json -o live-openapi.json
node -e "
const live=require('./live-openapi.json'), local=require('./openapi.json');
const lp=Object.keys(live.paths).sort(), op=Object.keys(local.paths).sort();
console.log('only on server:', lp.filter(p=>!op.includes(p)));
console.log('only in openapi.json:', op.filter(p=>!lp.includes(p)));
console.log('differing shape:', lp.filter(p=>op.includes(p) && JSON.stringify(live.paths[p])!==JSON.stringify(local.paths[p])));
"
```

**Expected: three empty arrays** (23 paths on each side). Anything else means
`npm run api:types` needs re-running against a fresh `openapi.json`, and the UI may be typed
against a contract the server no longer serves.

---

## 4. Step 1 — build the day

The server's seed dates orders to whenever it last ran, so **today's queue is normally
empty**. Build a real day with the script in [Appendix A](#appendix-a--seed-test-daymjs).

```bash
node seed-test-day.mjs              # today
node seed-test-day.mjs 2026-08-24   # or a specific date
```

It logs in as admin, clears whatever is left over for that date, creates five orders assigned
to the FR driver, and then walks four of them through the **driver's own endpoints** — so
every row has a genuine status-event trail rather than a hand-edited status column.

Expected final line:

```
queue <DATE>: Ready 2 · On the way 1 · Done N
```

`Done` accumulates across runs — completed and returned orders cannot be un-done, and the
reset turns leftovers into cancelled and returned rows. Ready and On the way are exact. For a
pristine Done tab, use a date you have not seeded before, or re-run the server's `npm run seed`.

### The day it builds

| Patient        | Window | Status                       | Amount due              | Payment   | Cooler bag          |
| -------------- | ------ | ---------------------------- | ----------------------- | --------- | ------------------- |
| Marie Tremblay | AM     | `in_pharmacy` → **Ready**    | $42.50                  | unpaid    | no                  |
| Jean Bouchard  | AM     | `in_pharmacy` → **Ready**    | —                       | paid      | **yes**             |
| Sofia Nasser   | PM     | `picked_up` → **On the way** | $25.75                  | unpaid    | no                  |
| Louis Gagnon   | PM     | `completed` → **Done**       | $18.00 collected (cash) | collected | **yes, unanswered** |
| Priya Raman    | PM     | `returned` → **Done**        | —                       | paid      | no                  |

That covers, on purpose: both delivery windows, an amount due and a nothing-due card, a
cooler-bag card in each of Ready and Done, a payment actually recorded, and both terminal
shapes (completed and returned) plus cancelled rows from the reset.

---

## 5. Test matrix

Each row is a step and the exact expected result. **FR is the default language**, so expected
strings are French unless the test says otherwise.

### A — Transport and contract

| #   | Test                                   | Steps                                                                                              | Expected                                                                                                                                                                                                 |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Server reachable                       | `curl -s -o /dev/null -w "%{http_code}" localhost:3000/health`                                     | `200`                                                                                                                                                                                                    |
| A2  | Contract matches generated types       | §3 drift check                                                                                     | three empty arrays                                                                                                                                                                                       |
| A3  | Live gate                              | `npm run verify:api`                                                                               | 8/8 pass                                                                                                                                                                                                 |
| A4  | Body-less POST sends no `content-type` | inspect [http.ts:88](../../src/api/http.ts#L88) — the header is set only when `body !== undefined` | Confirmed. The server rejects `content-type: application/json` on an empty body with `VALIDATION_FAILED`, so Feature 5's body-less `pickup`/`complete`/`return` will work through this client unchanged. |
| A5  | Idempotency-Key ceiling                | pass a >255-char key to `request()`                                                                | throws before spending a round-trip                                                                                                                                                                      |

### B — Auth

| #   | Test                      | Steps                               | Expected                                                                                                |
| --- | ------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| B1  | Sign in                   | `/sign-in`, FR driver credentials   | lands on Ready; header shows **Pharmacie Saint-Laurent** and today's date                               |
| B2  | Wrong password            | same email, password `nope`         | red banner with the mapped `INVALID_CREDENTIALS` wording in French — **not** the server's English prose |
| B3  | Unknown email             | `nobody@example.ca`                 | same mapped credentials message (no account enumeration)                                                |
| B4  | Server down               | stop the server, submit             | offline/unreachable banner; the session is **not** wiped                                                |
| B5  | Empty fields              | leave either blank                  | primary button disabled                                                                                 |
| B6  | Register is its own route | open `/register` directly           | registration form renders standalone                                                                    |
| B7  | Invite registration       | mint a code (below), fill the form  | account created, signed straight in, lands on Ready with an empty queue                                 |
| B8  | Invite code paste         | copy `ABCD-1234` and tap **Coller** | dashes, spaces and newlines stripped; renders uppercase monospace grouped 4+4                           |
| B9  | Short password            | 11 characters                       | rule surfaced client-side before any request                                                            |
| B10 | Sign out                  | header settings → confirm           | returns to `/sign-in`; queue cache dropped                                                              |

Mint an invite code:

```bash
TOK=$(curl -s -X POST http://localhost:3000/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@stlaurent.example.ca","password":"DevPassword123!"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")

curl -s -X POST http://localhost:3000/v1/invites/ -H "authorization: Bearer $TOK" \
  -H 'Content-Type: application/json' -d '{}'
```

> `POST /v1/invites/` rejects a body-less request even though every field is optional — send
> `{}`. Known server papercut, already logged in MVP_V1.

### C — Session lifecycle

| #   | Test                           | Steps                                                                | Expected                                                                                                                       |
| --- | ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| C1  | Restore on relaunch            | sign in, force-quit, reopen                                          | splash holds, then Ready — **no flash of the sign-in screen**                                                                  |
| C2  | `/` redirects                  | open `/` signed in, then signed out                                  | `/ready` and `/sign-in` respectively; never a 404, never a bounce                                                              |
| C3  | Guard blocks direct entry      | signed out, open `/ready`                                            | redirected to `/sign-in`; no patient data renders for even one frame                                                           |
| C4  | Silent refresh                 | covered by `verify:api` test 6                                       | access token rotates with no visible interruption                                                                              |
| C5  | Deactivation wipes the session | `PATCH /v1/drivers/{id}` `{"is_active":false}`, then pull-to-refresh | signed out, with the reason shown on the sign-in screen. **May take up to 15 minutes** — see §6. Always reactivate afterwards. |
| C6  | Web store is memory-only       | on web: sign in, reload the page                                     | signed out. Correct — `token-store.web.ts` deliberately has no persistence.                                                    |

### D — Queue read path

| #   | Test                    | Steps                                                          | Expected                                                                                                                                                   |
| --- | ----------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Tab split               | sign in after seeding                                          | Ready **2**, On the way **1**, Done **N**                                                                                                                  |
| D2  | Badges match lists      | count cards on each tab                                        | badge count equals card count on every tab — one request feeds both                                                                                        |
| D3  | Ready card content      | look at Marie Tremblay                                         | name, address, `+1 514…`, **42,50 $** in FR, AM window                                                                                                     |
| D4  | Nothing-due card        | Jean Bouchard                                                  | no amount shown; cooler-bag badge present                                                                                                                  |
| D5  | On the way card         | Sofia Nasser                                                   | PM window, $25.75, appears only on this tab                                                                                                                |
| D6  | Done cards carry no PII | Done tab                                                       | **no name, address, or phone anywhere.** The server omits the keys entirely — verified: 0 closed rows contain `patient_name`, `address`, or `phone_number` |
| D7  | Cooler pending badge    | Louis Gagnon on Done                                           | "vérification du sac réfrigérant en attente" — `requires_cooler_bag: true`, `cooler_bag_confirmed: null`                                                   |
| D8  | Pull-to-refresh         | pull down on Ready                                             | spinner, then fresh data. Move an order server-side first and confirm it jumps tabs.                                                                       |
| D9  | Silent refetch          | refetch over existing data                                     | list stays readable; no full-screen spinner                                                                                                                |
| D10 | Empty state             | seed a future date with no orders, or sign in as the EN driver | illustrated empty state per tab, correct wording                                                                                                           |
| D11 | Error banner + retry    | stop the server, pull-to-refresh                               | red banner with **Réessayer**; tapping it after restarting the server recovers without a re-login                                                          |
| D12 | Server order preserved  | see the optimize note below                                    | cards render in the server's `sequence_number` order, never re-sorted client-side                                                                          |

**On** `sequence_number`**:** freshly created orders come back with `sequence_number: null` — the
stub optimizer only assigns them when `/v1/driver/queue/optimize` is called, and the app does
not call it (Feature 6). To exercise D12, set the order server-side first:

```bash
DT=$(curl -s -X POST http://localhost:3000/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"driver@stlaurent.example.ca","password":"DevPassword123!"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")

curl -s -X POST http://localhost:3000/v1/driver/queue/optimize \
  -H "authorization: Bearer $DT" -H 'Content-Type: application/json' \
  -d '{"date":"2026-08-23"}'
```

Verified result on the seeded day: `1: Sofia Nasser · 2: Marie Tremblay · 3: Jean Bouchard`
(the stub sorts by `address.localeCompare`). Pull-to-refresh in the app and confirm Ready now
shows Marie above Jean.

### E — Privacy

| #   | Test                              | Steps                                        | Expected                                                                                                               |
| --- | --------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| E1  | No cross-tab ghosting             | Ready → Done, look closely at the background | no patient names bleeding through the glass. This was a real defect; `QueueScreen` now refuses to draw unless focused. |
| E2  | Cache holds nothing after unmount | sign out, sign back in                       | full refetch, no stale render — `gcTime: 0`                                                                            |
| E3  | Cross-org isolation               | sign in as `driver@riverside.example.ca`     | none of the FR org's stops appear                                                                                      |
| E4  | Closed payload is PII-free        | inspect `closed[]` in `GET /v1/driver/queue` | keys are absent, not null                                                                                              |

### F — Internationalization

| #   | Test                     | Steps                                                 | Expected                                                                    |
| --- | ------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| F1  | FR is the default        | fresh launch                                          | French throughout, no negotiation with the device locale                    |
| F2  | EN toggle                | **on the sign-in screen**, switch to EN, then sign in | the whole app renders English; the choice survives sign-in                  |
| F3  | Currency follows locale  | compare Marie Tremblay's amount in each language      | `42,50 $` in FR, `$42.50` in EN                                             |
| F4  | Errors localized by code | force B2 in each language                             | wording changes with the language; the server's English prose never appears |

> **There is no language toggle inside the app tabs** — it lives in `auth-shell.tsx`, which
> only the auth screens use. To test the app in English you must switch **before** signing in.
> Feature 4 moves this to i18next seeded from `organization.locale`.

### G — Design system

| #   | Test                          | Steps                    | Expected                                                                     |
| --- | ----------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| G1  | Gallery renders               | open `/design`           | every component, both languages, both themes                                 |
| G2  | Mesh is never washed out      | any screen, any platform | dark field with colour blobs; glass panels legible with or without real blur |
| G3  | No grey navigation background | any screen               | the mesh reaches every screen edge to edge                                   |
| G4  | Tap targets                   | all controls             | ≥48pt; primary actions 60pt                                                  |
| G5  | Stop sheet and hero card      | `/design` only           | present in the gallery, absent from the tabs — expected, Feature 4           |

---

## 6. Known gaps — expected, not defects

Re-confirmed live on 2026-08-23. Full context in [MVP_V1.md](../Plans/MVP_V1.md).

| Observation                                                       | Why                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A deactivated driver keeps loading the queue for up to 15 minutes | Driver endpoints verify only the JWT. `/v1/auth/me` and `/v1/auth/refresh` return `ACCOUNT_DISABLED` immediately; `/v1/driver/queue` does not. The app cannot close this.                                              |
| The "route not optimized" banner never appears                    | `GET /v1/driver/queue` **never sends** `degraded` — confirmed, the response is `{date, pharmacy, stops, closed}`. Only `optimize` sets it. The banner code in `queue-screen.tsx` is correct and currently unreachable. |
| No distance, bearing, or map                                      | `orders` carries no `latitude`/`longitude`. Deliberately not geocoded on-device.                                                                                                                                       |
| The pharmacy has no address                                       | `pharmacy` is `{name, phone}` only — nothing to hand a navigation intent for the trip back.                                                                                                                            |
| Delivery windows are hardcoded                                    | AM 09:00–12:00 / PM 13:00–17:00 live in `src/lib/delivery-windows.ts`; the server has the real columns and exposes them on no endpoint.                                                                                |
| `sequence_number` is `null` until optimize runs                   | The stub only assigns on demand.                                                                                                                                                                                       |
| Optimize ignores the driver's location                            | `RouteStop` is `{orderId, address}`; `current_location` is accepted and discarded.                                                                                                                                     |
| `POST /v1/invites/` rejects an empty body                         | Send `{}`.                                                                                                                                                                                                             |

---

## 7. Sign-off

A pass means every box below is ticked on **one** platform, with §3 green.

- [ ] `npx tsc --noEmit` clean
- [ ] `npm test` 97/97
- [ ] `npm run verify:api` 8/8
- [ ] Contract drift check: three empty arrays
- [ ] A1–A5
- [ ] B1–B10
- [ ] C1–C6
- [ ] D1–D12
- [ ] E1–E4
- [ ] F1–F4
- [ ] G1–G5

Record platform, date, server commit, and anything that failed. A gap listed in §6 is not a
failure — but a §6 item that has silently _stopped_ happening means the server changed, and
this document needs re-verifying.

---

## Appendix A — `seed-test-day.mjs`

Save anywhere and run with `node` (Node 21: bundled `fetch` and `crypto.randomUUID`).
Requires the server running and its seed applied at least once.

> Reads and writes **development data only**. Never point it at an environment holding real
> patient records (PRD §8.3).

```js
/**
 * Builds one realistic day for driver@stlaurent.example.ca against the running
 * server. Admin creates and assigns; the driver's own endpoints move each order,
 * so every row lands with a real status-event trail.
 *
 * Usage: node seed-test-day.mjs [YYYY-MM-DD]
 */
const API = process.env.API_URL ?? "http://localhost:3000";
const PASSWORD = "DevPassword123!";
const DATE = process.argv[2] ?? new Date().toISOString().slice(0, 10);

const key = () => crypto.randomUUID();

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      // Only when there is a body: the server rejects a JSON content-type on an
      // empty body, which is exactly why the app's http.ts sets it conditionally.
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(method === "POST" || method === "PATCH"
        ? { "Idempotency-Key": key() }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return json;
}

const login = (email) =>
  call("POST", "/v1/auth/login", { body: { email, password: PASSWORD } });

const STOPS = [
  {
    name: "Marie Tremblay",
    window: "AM",
    payment_status: "unpaid",
    amount_due: 42.5,
    cooler: false,
    end: "ready",
  },
  {
    name: "Jean Bouchard",
    window: "AM",
    payment_status: "paid",
    amount_due: null,
    cooler: true,
    end: "ready",
  },
  {
    name: "Sofia Nasser",
    window: "PM",
    payment_status: "unpaid",
    amount_due: 25.75,
    cooler: false,
    end: "on_the_way",
  },
  {
    name: "Louis Gagnon",
    window: "PM",
    payment_status: "unpaid",
    amount_due: 18.0,
    cooler: true,
    end: "completed",
  },
  {
    name: "Priya Raman",
    window: "PM",
    payment_status: "paid",
    amount_due: null,
    cooler: false,
    end: "returned",
  },
];

const admin = (await login("admin@stlaurent.example.ca")).access_token;
const driverAuth = await login("driver@stlaurent.example.ca");
const driverId = driverAuth.user.id;
const driver = driverAuth.access_token;

const { data: clients } = await call("GET", "/v1/clients/?limit=200", {
  token: admin,
});
const byName = new Map(
  clients.filter((c) => c.is_active).map((c) => [c.name, c.id]),
);

// Reset the day so a re-run rebuilds it instead of stacking a second copy on top.
// `cancel` only accepts in_pharmacy, so anything already in the van is returned first.
const inVan = await call(
  "GET",
  `/v1/orders/?date=${DATE}&status=picked_up&limit=200`,
  { token: admin },
);
for (const o of inVan.data)
  await call("POST", `/v1/driver/orders/${o.id}/return`, { token: driver });
if (inVan.data.length)
  console.log(`returned ${inVan.data.length} leftover picked_up order(s)`);

const existing = await call(
  "GET",
  `/v1/orders/?date=${DATE}&status=in_pharmacy&limit=200`,
  { token: admin },
);
for (const o of existing.data)
  await call("POST", `/v1/orders/${o.id}/cancel`, { token: admin });
if (existing.data.length)
  console.log(
    `cancelled ${existing.data.length} leftover in_pharmacy order(s)`,
  );

console.log(`seeding ${DATE} for driver ${driverId}\n`);

for (const s of STOPS) {
  let clientId = byName.get(s.name);
  if (!clientId) {
    const created = await call("POST", "/v1/clients/", {
      token: admin,
      body: {
        name: s.name,
        address: `${100 + Math.floor(Math.random() * 900)} rue Sainte-Catherine E, Montreal, QC H2L 2E8`,
        phone_number:
          "+15145550" + String(100 + Math.floor(Math.random() * 899)),
      },
    });
    clientId = created.id;
    byName.set(s.name, clientId);
  }

  const order = await call("POST", "/v1/orders/", {
    token: admin,
    body: {
      client_id: clientId,
      driver_id: driverId,
      delivery_date: DATE,
      delivery_window: s.window,
      payment_status: s.payment_status,
      amount_due: s.amount_due,
      requires_cooler_bag: s.cooler,
    },
  });

  const steps = {
    ready: [],
    on_the_way: ["pickup"],
    completed: ["pickup", "complete"],
    returned: ["pickup", "return"],
  }[s.end];
  for (const verb of steps)
    await call("POST", `/v1/driver/orders/${order.id}/${verb}`, {
      token: driver,
    });

  if (s.end === "completed" && s.amount_due) {
    await call("POST", `/v1/driver/orders/${order.id}/payment`, {
      token: driver,
      body: { payment_method: "cash", amount_collected: s.amount_due },
    });
  }

  console.log(
    `  ${s.end.padEnd(11)} ${s.window}  ${s.name.padEnd(18)} ${order.id}`,
  );
}

const queue = await call("GET", `/v1/driver/queue?date=${DATE}`, {
  token: driver,
});
const ready = queue.stops.filter((s) => s.status === "in_pharmacy").length;
const onTheWay = queue.stops.filter((s) => s.status === "picked_up").length;
console.log(
  `\nqueue ${DATE}: Ready ${ready} · On the way ${onTheWay} · Done ${queue.closed.length}`,
);
```

---

## Appendix B — useful one-liners

Admin and driver tokens:

```bash
TOK=$(curl -s -X POST http://localhost:3000/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@stlaurent.example.ca","password":"DevPassword123!"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")

DT=$(curl -s -X POST http://localhost:3000/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"driver@stlaurent.example.ca","password":"DevPassword123!"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")
```

What the app sees on launch:

```bash
curl -s -H "authorization: Bearer $DT" http://localhost:3000/v1/driver/queue \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const q=JSON.parse(d);
      console.log(q.date,
        'ready=' + q.stops.filter(s=>s.status==='in_pharmacy').length,
        'onway=' + q.stops.filter(s=>s.status==='picked_up').length,
        'done='  + q.closed.length);})"
```

Today's orders grouped by status:

```bash
curl -s -H "authorization: Bearer $TOK" "http://localhost:3000/v1/orders/?limit=200" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);
      console.log(JSON.stringify(j.data.reduce((a,o)=>(a[o.status]=(a[o.status]||0)+1,a),{})));})"
```

Deactivate and reactivate the driver (test C5 — always reactivate):

```bash
curl -s -X PATCH http://localhost:3000/v1/drivers/1337a8e9-f2c5-4621-a462-02a384781e00 \
  -H "authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"is_active":false}'

curl -s -X PATCH http://localhost:3000/v1/drivers/1337a8e9-f2c5-4621-a462-02a384781e00 \
  -H "authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"is_active":true}'
```

> `uuidgen` does not exist in Git Bash on Windows. For an ad-hoc Idempotency-Key, use
> `node -pe "crypto.randomUUID()"`.
