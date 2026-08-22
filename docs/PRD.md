# PRD — Driver App (React Native)

**Product:** Drugstore Delivery App B2B
**Component:** Driver-facing mobile app (iOS + Android)
**Status:** Development Planning
**Version:** 0.1 (MVP) — written against server API v1; driver flow verified by 128 server tests and 49 black-box HTTP checks

---

## 1. Purpose & Scope

The driver app is the driver's entire interface to the platform. A driver arrives at the pharmacy, sees the deliveries assigned to them, takes a batch in charge, follows an optimized route, confirms each drop-off with one tap, collects payment at the door when flagged, and returns undeliverable packages. It holds **no business logic**: state transitions, payment rules, and PII access are all enforced server-side, and the app renders what the API tells it.

The strategy (MVP §1) is to beat Mobilus and Livramed on **driver friction**, not on feature count. Every screen in this document is judged by one question: can a driver standing at a door in the rain, phone in one hand and package in the other, finish the interaction in one tap?

### In scope

- Authentication for the `driver` role, including invite-code registration (MVP §3)
- The delivery queue: ready / on-the-way views, batch pickup, route optimization
- One-tap Proof of Delivery, Return Order, POS payment recording, cooler-bag QC (MVP §5)
- One-tap calling to the client and the pharmacy (MVP §5)
- Offline-tolerant operation on flaky mobile networks
- Bilingual FR/EN, French by default
- Law 25 / PIPEDA controls that fall on the device tier (MVP §8)

### Out of scope (MVP)

- Admin views of any kind — a driver token gets `403` on every admin route, and the app has no screens for them
- Digital payment processing. The driver carries a physical POS terminal; the app only records that collection happened (MVP §5)
- Signature or photo capture at the door — see §2, this is a deliberate divergence from Mobilus
- Multi-pharmacy support. A driver belongs to exactly one organization (server PRD §1); no org grouping or switching
- Background location tracking and live push — **the server has no location ingest or WebSocket layer yet** (§9.2). Do not design against them.
- In-app chat or messaging. Communication is the phone call (MVP §5)
- Patient-facing anything. Patients receive SMS from the server; they never see this app.

---

## 2. Competitive Reference — Mobilus

Mobilus is the incumbent driver app in Quebec pharmacy delivery and the benchmark named in MVP §1. Its driver app organizes the day into three status tabs — **Ready** (à livrer), **Returning** (retours), **On the way** (en route) — over a dark-themed list of order cards. Each card shows: client name, delivery address, a colour-coded delivery-window label (e.g. orange "LIVRAISON AM (10H)", pink "LIVRAISON PM (13H30)", green "LIVRAISON SOIRÉE (17H)"), a per-order time constraint chip ("After 17:00", "Before 13:30"), elapsed delay, straight-line distance with compass bearing ("10.21 km ENE"), and a `$` badge when money must be collected at the door. A toolbar offers multi-select for batch actions, a map view with a pin legend (ready / on the way / urgent / time-constrained), route optimization, manual reordering, grouping by pharmacy, sorting, and filters. Proof of delivery is an electronic signature or geolocated time-stamped photo, and the patient receives an SMS with a live-tracking ETA link when the driver departs.

That is a mature, feature-dense product — and its density is the opening. Our MVP position on each Mobilus capability:

| Mobilus capability                                            | Our position              | Rationale                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Three status tabs with counts                                 | **Adopt**                 | Proven mental model for a driver's day; maps cleanly onto our order statuses (§5.1)                                                             |
| Card: name, address, window label, `$` badge, distance, delay | **Adopt**                 | Everything a driver triages by, glanceable without opening the order (§5.2)                                                                     |
| Route optimization                                            | **Adopt**                 | Core MVP requirement (MVP §5); server-brokered via Mapbox                                                                                       |
| Map view with pin legend                                      | **Adopt, simplified**     | Two pin states (ready / on the way) plus a payment marker; no separate "urgent" tier in MVP                                                     |
| Multi-select batch actions                                    | **Adopt for pickup only** | Taking 10 packages in charge must not be 10 interactions (§5.3)                                                                                 |
| Signature / photo PoD                                         | **Reject**                | MVP §5 mandates single-tap PoD. Signature capture is the single highest-friction step in the Mobilus flow — this is the headline simplification |
| Per-order time constraints ("After 17:00")                    | **Defer**                 | Our schema models AM/PM windows only; raised as a server gap (§9.3)                                                                             |
| Evening delivery window (SOIRÉE)                              | **Defer**                 | `delivery_window` enum is `AM`/`PM`; competitor parity question raised in §12                                                                   |
| Manual route reordering                                       | **Defer**                 | No server endpoint writes `sequence_number` except optimize; raised in §9.3                                                                     |
| Grouping by pharmacy / multi-org                              | **Reject**                | One driver, one organization, by design (server PRD §1)                                                                                         |
| Driver cash & travel reports                                  | **Defer**                 | Useful for end-of-day POS reconciliation; needs a server endpoint (§9.3)                                                                        |
| SMS with live ETA link to patient                             | **Defer**                 | Server Twilio integration is not built; and it is a server feature, not an app feature (§9.2)                                                   |

The bet: a Mobilus driver performs sign-or-photograph at every door; ours taps once. Over a 40-stop day that is the product.

---

## 3. Architecture & Stack

| Layer              | Choice                                   | Notes                                                                                                                          |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Framework          | React Native via Expo (managed workflow) | EAS Build + Submit; over-the-air JS updates via EAS Update                                                                     |
| Language           | TypeScript, strict                       | `noUncheckedIndexedAccess`, matching the server repo                                                                           |
| Navigation         | Expo Router                              | File-based; typed routes                                                                                                       |
| API types          | `openapi-typescript`                     | Generated from the server's `openapi.json` — never hand-written (same rule as the dashboard)                                   |
| Server state       | TanStack Query                           | **In-memory cache only** for anything carrying PII — no disk persistence (§8.2)                                                |
| Mutation outbox    | SQLite (`expo-sqlite`), encrypted        | Queued writes survive app death; replayed in order on reconnect (§6)                                                           |
| Token storage      | `expo-secure-store`                      | iOS Keychain / Android Keystore, hardware-backed. Never AsyncStorage                                                           |
| Maps               | `@rnmapbox/maps`                         | Rendering only, with a short-lived scoped token from the server (server PRD §5.4). The Mapbox secret never ships in the binary |
| Navigation handoff | Native intents                           | Turn-by-turn is delegated to Google Maps / Apple Maps / Waze (§5.4)                                                            |
| i18n               | `i18next` + `expo-localization`          | FR default, EN toggle                                                                                                          |
| Crash reporting    | Sentry React Native                      | PII scrubbing configured before first deploy (§8.3)                                                                            |
| OS support         | iOS 16+, Android 10+                     | Covers the used-phone market drivers actually carry                                                                            |

### 3.1 Thin-client rule

The app never talks to Mapbox Optimization, Twilio, or PostgreSQL. It talks to `/v1` and renders the result. Route order comes from the server as `sequence_number`; the app must not re-sort stops by its own distance math, or the driver's screen will disagree with what the admin dashboard shows.

### 3.2 Distribution

App Store + Google Play, with EAS internal distribution / TestFlight for the pilot pharmacies. OTA updates cover JS-only fixes; anything touching native modules ships through the stores.

---

## 4. Authentication & Session

### 4.1 What the server gives us

`POST /v1/auth/login` returns a 15-minute access JWT and a 30-day opaque refresh token. Refresh rotates on every use, and **presenting an already-rotated token revokes the entire token family** (server PRD §4.2). The same single-flight constraint that shaped the dashboard's session design applies here.

### 4.2 Registration with an invite code (MVP §3)

First-run screen offers **Sign in** and **I have an invite code**. Registration posts the code plus the driver's details to `POST /v1/auth/register/driver`. Codes are eight characters from an alphabet omitting I, O, 0, and 1, typed off a printed sheet — render the input uppercase, monospace, auto-grouped in two blocks of four, with a paste path. A consumed or expired code returns a specific error code; show which problem it was, because "invalid code" sends the driver back to the pharmacist to regenerate a code that may be fine.

### 4.3 Token storage

Both tokens live in `expo-secure-store` and nowhere else. A 30-day refresh token is a 30-day credential to patient addresses; on a device that rides in a delivery car all day, hardware-backed storage is the control that matters. No token ever appears in AsyncStorage, Redux state persisted to disk, or a log line.

### 4.4 Refresh single-flight

All API calls go through one client that owns refresh. When the access token is inside 60 seconds of expiry, exactly one refresh runs; concurrent requests await it (a mutex in the client — no Redis on a phone). Two parallel refreshes with the same token look like theft to the server and log the driver out mid-route. `401 INVALID_REFRESH_TOKEN` is terminal: wipe tokens, purge all cached order data, return to login. Never retry.

### 4.5 Deactivation

When the pharmacy deactivates a driver, the server revokes their sessions. The next API call returns `401`; the app treats it as §4.4 terminal — wipe and login screen. There is no offline grace period for a revoked driver: cached PII is purged even though the outbox (which contains no patient data, §6.3) may still drain later.

---

## 5. Functional Requirements

### 5.1 The queue — home screen

Data source: `GET /v1/driver/queue?date=` — returns `stops` (active orders in `sequence_number` order), `closed` (today's finished deliveries, PII-stripped), and `pharmacy` (name and phone for the dialer).

Three tabs, mirroring the Mobilus model but mapped to our state machine:

| Tab            | Contents                                          | Server status           |
| -------------- | ------------------------------------------------- | ----------------------- |
| **Ready**      | Assigned, still at the pharmacy                   | `in_pharmacy`           |
| **On the way** | In the driver's vehicle                           | `picked_up`             |
| **Done**       | Today's closed deliveries + packages to hand back | `completed`, `returned` |

Each tab shows its count in the tab bar, exactly as Mobilus does — the driver's first glance answers "how much day is left."

**No separate Returning tab.** In our model a return is instantaneous and terminal (`picked_up → returned`, server PRD §5.3); there is no tracked return leg. Instead, the **Done** tab pins a "Return to pharmacy" section listing today's returned orders by order reference — no patient data, which is all the server will give us for terminal orders anyway (§8.1) — so the driver has a physical checklist of packages to hand back at the counter.

Refresh model: pull-to-refresh plus an automatic re-fetch every 30 seconds while the app is foregrounded. There is no push channel yet (§9.2), and a new assignment must appear without the driver thinking about it.

### 5.2 The order card

Modeled directly on the Mobilus card, which is well-solved glanceable design:

1. **Patient name** — primary line
2. **Address** — secondary line, single truncated line; full address on the detail sheet
3. **Window chip** — colour-coded `AM` / `PM` with the organization's local window times (from `/v1/auth/me` org context), e.g. "AM (9h–12h)". Colour plus text, never colour alone
4. **`$` badge** — shown when `amount_due` is set; the strongest visual on the card, because forgetting to collect is the costliest driver error
5. **Cooler badge** — when `requires_cooler_bag`, so the driver grabs the bag at pickup, not remembers it at the door
6. **Sequence position and ETA** — once a route is optimized; position is `sequence_number`, never a client-side sort
7. **Delay** — elapsed time since the order entered its current status, matching Mobilus's delay counter
8. **Distance + bearing** — straight-line distance from current position ("10.2 km ENE"), computed on-device from coordinates; this is display math, not routing

Tapping a card opens a detail sheet: full address, phone (call button), amount due, window, and the action button for the order's current state. Actions are rendered from the server's transition rules, not a client-side re-implementation of the state machine.

Sort and filter (toolbar, as in Mobilus): default order is route sequence; alternatives are distance and name. Search over name and address. Filter to `$`-flagged and cooler-flagged orders.

### 5.3 Pickup — taking charge

From the **Ready** tab, the driver multi-selects orders (Mobilus-style checkbox mode, plus a select-all) and confirms once. The app fires `POST /v1/driver/orders/:id/pickup` per order — the server has no batch endpoint (§9.3) — with one progress indicator, not ten. Each success moves the card to **On the way**; a failure (e.g. the admin reassigned the order seconds ago → `409`) leaves that card in place with an inline reason and never blocks the rest of the batch.

After a successful pickup batch, the app immediately requests route optimization (§5.4) so the driver walks out with an ordered list.

### 5.4 Route optimization, map, and navigation (MVP §5)

`POST /v1/driver/queue/optimize` with the current device location. The server writes `sequence_number` 1..N and returns the reordered queue.

- **Degraded mode is a first-class state.** The server never fails an optimize call over a provider outage — it returns the previous sequence with `degraded: true` (verified server behaviour). The app shows a quiet banner: "Route not optimized — using previous order", and everything else works. A routing outage must never stop a delivery run.
- Re-optimize triggers: after a pickup batch, after a return (the driver now heads back to the pharmacy), and manually from the toolbar. Automatic recalculation on every completion is a server Phase 5 item; until then the manual control is prominent.
- **Map view** (toolbar toggle, as in Mobilus): all active stops pinned on Mapbox, numbered by sequence; distinct pin styles for ready vs on-the-way; `$` marker on collection stops; a legend, since Mobilus taught drivers to expect one. Tapping a pin opens the same detail sheet as the list.
- **Turn-by-turn is not our problem.** "Navigate" on any stop opens the address in the driver's preferred navigation app (Google Maps / Apple Maps / Waze) via native intent. Building in-app guidance would be years of work to be worse than what the driver already trusts.

### 5.5 One-tap calling (MVP §5)

Call buttons on the detail sheet for the client (`phone_number` from the queue payload) and the pharmacy (`pharmacy.phone`), invoking the native dialer. No server telephony, no in-app VoIP. Once an order is terminal the server stops sending the client's phone number, and the button disappears with it.

### 5.6 Proof of Delivery — the one tap (MVP §5)

On the active stop's detail sheet: a single, full-width, thumb-reachable **"Delivered"** button → `POST /v1/driver/orders/:id/complete`.

- No signature. No photo. No confirmation dialog for a paid order — the tap **is** the confirmation, and undo is an admin correction, deliberately (server PRD §5.3: terminal states are immutable to drivers).
- **The one guard:** if `amount_due` is set and no payment has been recorded, the Delivered tap first presents the payment sheet (§5.7). Completing an unpaid `$` order without collecting must be a conscious choice ("Complete without payment"), because it surfaces on the pharmacy's exceptions report.
- The UI transitions optimistically and the write goes through the outbox (§6). The driver never waits on a spinner at the door.
- On success, if `requires_cooler_bag`, the QC prompt appears (§5.8). Then the card moves to **Done** and its PII leaves the device (§8.1).

### 5.7 Payment collection (MVP §5)

No digital payments. The driver carries a physical POS terminal; the app records the outcome.

The payment sheet shows `amount_due` large, two method buttons (**Cash** / **Card**), and an amount field **pre-filled with `amount_due`** — the common case is one tap on the method. Submits `POST /v1/driver/orders/:id/payment` with `{ payment_method, amount_collected }`.

- The server responds with `matches_amount_due`. A mismatch is not an error — partial payments happen at the door — but the app shows "collected $15.00 of $42.50" so a typo is caught while the driver is still standing there.
- The server refuses payment against a returned order (nothing was collected from a patient who never answered); the app never offers the sheet on a return.
- `payment_status` is never written by the app directly; recording the collection is the only verb.

### 5.8 Return Order (MVP §5)

Patient unavailable → one **"Return Order"** button on the detail sheet → `POST /v1/driver/orders/:id/return`. One confirmation ("Package will be returned to the pharmacy") because it is terminal and, unlike Delivered, it is the rare path — a mis-tap here is likelier than at a door where the driver just handed over a package.

- Only reachable from `picked_up`; the server enforces it, so the button only exists on **On the way** orders.
- The order joins the "Return to pharmacy" checklist on the Done tab (§5.1) and a re-optimize is offered, since the route now ends at the pharmacy.
- A second attempt is a **new order** created by the admin — the app has no "retry delivery" affordance.

### 5.9 Cooler-bag QC (MVP §5)

Immediately after completing or returning an order with `requires_cooler_bag`, a prompt: "Did you retrieve the cooler bag?" → **Yes** / **No** via `POST /v1/driver/orders/:id/cooler-check`.

Three states matter to the pharmacy's exceptions report, so the app must preserve all three: confirmed (`true`), answered no (`false`), and **dismissed** (`NULL` — the endpoint is simply never called). The prompt is dismissible and never blocks the next delivery: it is a QC record, not a gate. Unanswered checks remain visible as a badge on the Done tab entry so the driver can answer later, from the van, before end of day.

### 5.10 Done tab — today's history

The `closed` list from the queue payload: status, timestamps, payment recorded, cooler-check state, order reference. **No patient name, address, or phone** — the server strips them from terminal orders and the app renders what remains (§8.1). Yesterday is not reachable; the app is a tool for today's run, and history lives on the pharmacy's dashboard.

### 5.11 Bilingual FR/EN

Quebec drivers. French default, complete and idiomatic — window labels ("Livraison AM"), actions ("Livré", "Retourner la commande"), and every error string. Initial locale from the organization's `locale` via `/v1/auth/me`, overridable in settings, persisted on-device. French strings run 15–30% longer than English; the one-tap buttons must tolerate it without truncation.

---

## 6. Offline & Network Resilience

The defining mobile constraint. Underground parking, concrete apartment towers, and dead zones on the Laurentian autoroute are the working environment, and the server was explicitly built for retrying clients — every driver mutation accepts an `Idempotency-Key`, replays are byte-identical, and a same-key-different-body replay is rejected with `409 IDEMPOTENCY_KEY_CONFLICT` (verified server behaviour).

### 6.1 The outbox

Every mutation (pickup, complete, return, payment, cooler-check) is written to a local SQLite outbox **before** the network attempt, with a client-generated UUID as its idempotency key, then applied optimistically to the UI.

- The outbox drains in FIFO order per order — a payment recorded before a completion must arrive in that order, because the server refuses payment on a terminal order.
- Retries use exponential backoff and resume on connectivity change and app foreground.
- A drained entry is deleted. An entry answered `4xx` (other than `408`/`429`) is **dead** — it will never succeed — and surfaces as a conflict (§6.2) instead of retrying forever.
- The key travels with the entry, so a retry after app death reuses the same key and lands as a server-side replay, not a duplicate.

### 6.2 Conflicts

Optimistic UI means the server can disagree after the fact — the admin cancelled the order while the driver was offline, say. When a dead outbox entry is detected, the app re-fetches the queue, reconciles to server truth, and shows a plain notice: "Order for [name] was cancelled by the pharmacy — do not deliver." Conflicts are rare and loud beats silent.

### 6.3 What may touch disk

The outbox contains order IDs, verbs, amounts, and timestamps — **no patient name, address, or phone**. The queue cache (which does carry PII) is memory-only and dies with the process; a fresh launch re-fetches. This split is what §4.5 and §8.1 rely on: purging PII never loses a pending write.

### 6.4 Offline honesty

A subtle status indicator when the outbox is non-empty ("2 updates pending sync"), so a driver ending their shift in a dead zone knows to keep the app alive until it drains. No modal nagging; the whole design goal is that offline feels identical to online.

---

## 7. Design & UX

| Requirement        | Target                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Theme              | Dark by default — the working environment is a vehicle, often at night; Mobilus trained this market on dark UI               |
| Tap targets        | ≥ 48dp; primary actions full-width in the thumb zone. Winter gloves are a use case                                           |
| Status encoding    | Colour + text + icon, never colour alone                                                                                     |
| Typography         | Name and address legible at arm's length on a dashboard mount                                                                |
| One-handed         | Every core action (pickup, delivered, return, pay, call) reachable with one thumb, phone-in-hand                             |
| Screen wake        | Keep-awake while the map or active route is on-screen                                                                        |
| Interruption-proof | The app resumes exactly where it was after a phone call or navigation-app round-trip; drivers bounce between apps constantly |

The card is scanned, not read. Exceptions (`$` to collect, cooler bag, degraded route, pending sync) surface as badges the driver cannot miss at a glance, and everything else stays quiet.

---

## 8. Privacy & Security (device tier)

The server narrowed the exposure surface; the app's job is not to widen it. The device is the highest-risk tier in the system — it leaves the building.

### 8.1 PII lifetime is the active delivery (MVP §8)

The server enforces this: once an order is `completed` or `returned`, its responses simply contain no `patient_name`, `address`, or `phone_number` — the keys are absent, verified down to the serializer types. The app's obligations:

- Evict the order's PII from the in-memory cache on terminal transition, not merely stop rendering it.
- Never copy PII into anything that outlives the process: no disk persistence of the queue cache (§6.3), no PII in navigation params, no PII in the address handed to the navigation app after the stop is closed.
- On logout, deactivation, or token-family revocation: full cache purge (§4.5).

A driver's device holds the addresses of the patients on today's active run — never yesterday's, never a completed stop's.

### 8.2 Storage rules

- Tokens: `expo-secure-store` only (§4.3).
- Outbox: SQLite, encrypted at rest, PII-free by construction (§6.3).
- No PII in AsyncStorage, MMKV, TanStack Query persistence, or any backup-eligible file. Android `allowBackup=false`; the outbox is excluded from iOS backups.

### 8.3 Logging and crash reporting

No PII in console output or crash payloads. Sentry `beforeSend` drops request/response bodies and strips `patient_name`, `address`, `phone_number` — configured before first deploy, mirroring the dashboard rule. Surface `request_id` in error states; it is the handle support uses against server logs.

### 8.4 Screen and device hygiene

- Android `FLAG_SECURE` and iOS screenshot obscuring on screens rendering patient data — the queue is a list of patient addresses, and the OS app-switcher thumbnail should not be a photograph of it.
- No PII in OS notifications (there are no push notifications in v1 regardless).
- Lost device: the pharmacy deactivates the driver on the dashboard → server revokes the token family → the app wipes on next contact (§4.5). The 15-minute access-token TTL bounds the offline window; document this as the incident-response path.

---

## 9. Server Contract Dependencies

### 9.1 Ready now

The complete driver flow is built and verified: login/refresh/registration, the queue with PII-stripped terminal orders, pickup / complete / return, payment recording with `matches_amount_due`, cooler-check with three-state semantics, route optimize with the degraded contract, and idempotency on every mutation. The app can be built against the running API today.

### 9.2 Not built — do not design against these

| Capability                                             | Server state                                                 | App implication                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Location ingest (`POST /v1/driver/locations`)          | Phase 5                                                      | No background tracking; no "share my location" toggle in v1                               |
| WebSocket push (`order.assigned`, `queue.resequenced`) | Phase 5                                                      | 30-second foreground polling instead (§5.1)                                               |
| Real Mapbox optimizer                                  | Phase 5 — port + degradation contract exist, adapter is fake | Optimize works end-to-end but sequences are not yet traffic-aware; no per-stop ETA (§9.3) |
| Automatic re-optimization on state change              | Phase 5                                                      | The app triggers optimize explicitly (§5.4)                                               |
| Patient SMS "on the way"                               | No Twilio integration                                        | Nothing — a server feature; the app does not compensate                                   |

Ship no placeholder UI for these. A greyed-out tracking toggle teaches drivers the product is unfinished.

### 9.3 Gaps to raise with the server team

1. **Batch pickup.** Taking 15 packages in charge is 15 `POST`s. The app hides it (§5.3), but a `POST /v1/driver/orders/pickup-batch` would remove a burst of failure modes on the worst network at the pharmacy counter.
2. **Per-stop ETA.** Mobilus shows an ETA per stop once optimized; our optimize response carries sequence only. When the real Mapbox adapter lands (Phase 5), returning leg durations would let the app show ETAs — and feed a future "on the way" SMS.
3. **Per-order time constraints.** Mobilus supports "after 17:00" per order; we model only the AM/PM window. If pharmacies ask for it, it is an `orders` column plus optimizer input, and the card design (§5.2) already reserves the chip slot.
4. **Manual reordering.** Mobilus lets drivers reorder stops by hand, and drivers who know their territory will ask. Needs an endpoint that writes `sequence_number` from a client-supplied order.
5. **Driver day-summary.** Mobilus offers cash and travel reports. A `GET /v1/driver/summary?date=` (deliveries, returns, cash vs card collected) would back an end-of-shift POS reconciliation screen — the `closed` payload nearly suffices already if payment fields are included on terminal orders.
6. **Queue delta polling.** `GET /v1/driver/queue` is a full re-fetch every 30 s. Fine at MVP scale; an `updated_since` parameter (the admin orders list already has one) would cut payload and battery when queues grow.

---

## 10. Non-Functional Requirements

| Requirement                               | Target                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cold start to interactive queue           | < 2 s on a mid-range Android                                                                                                                                 |
| Tap to visual confirmation (PoD, payment) | < 200 ms perceived — optimistic, never network-gated                                                                                                         |
| Full delivery cycle offline               | Pickup → deliver → pay → return all function with zero connectivity; sync on reconnect (§6)                                                                  |
| Battery                                   | < 5%/hour foreground use, tracking off (v1 has no tracking)                                                                                                  |
| Poll cadence                              | Queue every 30 s foregrounded; nothing in background                                                                                                         |
| Crash-free sessions                       | > 99.5%                                                                                                                                                      |
| Accessibility                             | Dynamic type respected on cards; VoiceOver/TalkBack labels on all actions; 4.5:1 contrast on the dark theme                                                  |
| Test coverage                             | Non-negotiable: outbox replay ordering and idempotency-key reuse, PII cache eviction on terminal transition, refresh single-flight, degraded-route rendering |

---

## 11. Suggested Build Sequence

1. **Foundation** — Expo scaffold, generated API types, typed client with refresh single-flight, secure token storage, error envelope handling, CI + EAS.
2. **Session** — login, invite-code registration, deactivation/revocation wipe path. _Hardest to retrofit; matches the dashboard's lesson._
3. **Queue read path** — tabs, cards, detail sheet, pharmacy/client calling, FR/EN wiring. Establishes the PII memory-only cache and eviction rules.
4. **The delivery verbs** — pickup (with batch select), complete, return, payment sheet, cooler prompt — all through the outbox from day one. Building optimistic-first is much cheaper than bolting it on.
5. **Route & map** — optimize with degraded handling, Mapbox map view, navigation handoff.
6. **Polish** — Done tab and return checklist, sync indicator, conflict surfacing, accessibility pass, screenshot flags.
7. **Later phases** — background location + live push + traffic-aware ETAs, as the server ships Phase 5.

---

## 12. Open Questions

1. **Evening window.** Mobilus supports three windows (AM / PM / soirée) and the screenshots show pharmacies actively using all three. Our enum is `AM`/`PM`. Is two windows a real constraint for target pharmacies, or a launch blocker? Adding a value is cheap now and disruptive later.
2. **Device policy.** Driver-owned phones or pharmacy-issued devices? BYOD raises the stakes on §8 (backups, screenshots, OS version floor) and argues for the biometric app-lock below.
3. **Biometric app lock.** Require FaceID/fingerprint on app foreground after N minutes? Cheap with `expo-local-authentication`, meaningful for a device left on a car seat — but friction at every red light. Needs a real driver's input.
4. **How does a driver learn about a new assignment mid-route?** 30-second foreground polling covers the app-open case; there is no push in v1. If drivers keep the phone in navigation full-time, an assignment could go unseen for a while. Is that acceptable operationally, or does the pharmacy call the driver anyway (their current workflow)?
5. **Should "Delivered" ever require a second factor** (e.g. long-press instead of tap) to prevent pocket-taps? A mis-tapped completion is an admin correction and a PII wipe on the device. Recommendation: full-width button with a 300 ms press is enough; revisit with pilot data.
6. **Straight-line distance on cards** (Mobilus shows "10.21 km ENE"): useful triage signal or noise once the route is sequenced? Trivial to compute; the question is card real estate.
7. **What does the driver do at day's end with uncollected payments or unanswered cooler checks?** The exceptions live on the pharmacy's report, but a small end-of-shift checklist in the app (pending syncs, unanswered QC, packages to return) may prevent most morning-after support calls. Depends on §9.3's day-summary endpoint.
