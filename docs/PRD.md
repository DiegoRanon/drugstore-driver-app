# PRD — Driver App (React Native)

**Product:** Medibus Delivery App B2B
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
| Mutation outbox    | **Deferred** — see §6.1                  | Writes go online-first with an `Idempotency-Key` and snapshot rollback; SQLite queueing is a later feature (§6.2)               |
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

When the pharmacy deactivates a driver, the server revokes their sessions. The next API call returns `401`; the app treats it as §4.4 terminal — wipe and login screen. There is no offline grace period for a revoked driver: cached PII is purged immediately. (Once the outbox of §6.2 exists, it contains no patient data — §6.4 — and may drain later.)

---

## 5. Functional Requirements

### 5.1 The queue — home screen

Data source: `GET /v1/driver/queue?date=`. The server buckets the day for us — `stops` (active orders, priority first then `sequence_number`), `to_return` (failed deliveries still in the van), and `closed` (today's finished orders) — plus `pharmacy` (name, phone, and `return_deadline`), `totals`, and `unread_notifications`.

Four tabs, mapped to the state machine:

| Tab              | Contents                              | Server status                                          |
| ---------------- | ------------------------------------- | ------------------------------------------------------ |
| **Ready**        | Assigned, still at the pharmacy       | `in_pharmacy`                                          |
| **On the way**   | In the driver's vehicle               | `picked_up`                                            |
| **À rapporter**  | Failed, in the van, owed to the counter | `returned`                                           |
| **Done**         | Nothing else can happen               | `completed`, `returned_to_pharmacy`, `cancelled`       |

Each tab shows its count in the tab bar, exactly as Mobilus does — the driver's first glance answers "how much day is left."

**The return leg is a tab, and it is required.** An earlier draft of this section said a return was instantaneous and terminal, with no tracked return leg, and folded the hand-back list into Done. The server's lifecycle is `picked_up → returned → returned_to_pharmacy`: `returned` means the package is in the driver's van and the pharmacy is still owed it. It is not terminal, not active, and — because the delivery attempt is over — not PII-visible either. A tab rather than a section of Done, because it is a physical checklist worked against `pharmacy.return_deadline` at the counter, and burying it under a scroll of completed deliveries is the exact failure that deadline exists to prevent.

Refresh model: pull-to-refresh plus an automatic re-fetch every 30 seconds while the app is foregrounded. There is no push channel yet (§9.2), and a new assignment must appear without the driver thinking about it. The poll suspends while a write is in flight, so a refetch cannot overwrite an optimistic update with server state that predates it.

`GET /v1/driver/queue` also accepts `updated_since` and answers `has_new`. The app does not use it: `src/queue/shift-alerts.ts` diffs stop ids across polls and produces a *count* of what arrived, which is what the banners render and strictly more than a boolean.

### 5.2 The order card

Modeled directly on the Mobilus card, which is well-solved glanceable design:

1. **Patient name** — primary line
2. **Address** — secondary line, single truncated line; full address on the detail sheet
3. **Window chip** — colour-coded `AM` / `PM` with the organization's local window times (from `/v1/auth/me` org context), e.g. "AM (9h–12h)". Colour plus text, never colour alone
4. **`$` badge** — shown when `amount_due` is set; the strongest visual on the card, because forgetting to collect is the costliest driver error
5. **Cooler badge** — when `requires_cooler_bag`, so the driver grabs the bag at pickup, not remembers it at the door
6. **Sequence position and ETA** — once a route is optimized; position is `sequence_number`, never a client-side sort
7. **Delay** — elapsed time since the order entered its current status, matching Mobilus's delay counter
8. **Priority flag** — when `is_priority`. The server sorts priority stops to the front of `stops` regardless of route position, so the badge is what explains an order the driver would otherwise read as a bug
9. **Requested time** — `requested_delivery_time` beside the window chip when the pharmacy set one, never instead of it: a bare "14:30" has lost the half-day it belongs to
10. **Package count** — `package_count` when more than one, so the driver knows how many bags to carry to the door

Straight-line distance and bearing are still not buildable: the API exposes no coordinates for a stop.

Tapping a card opens a detail sheet: full address, phone (call button), amount due, window, and the action button for the order's current state.

**Actions come from `src/api/transitions.ts`, which mirrors the server's `stateMachine.ts`.** They are not derived by a switch inside a component, and they are not read off the payload: `available_transitions` exists on the admin `orderResponse` and on no driver response, so there is nothing to render from. Owning the mirror means owning the drift risk, and `src/api/__tests__/live-server-transitions.test.ts` is the answer to it — it walks two real orders through every state and asserts both directions at each step.

Sort and filter (toolbar, as in Mobilus): default order is route sequence; alternatives are distance and name. Search over name and address. Filter to `$`-flagged and cooler-flagged orders.

### 5.3 Pickup — taking charge

From the **Ready** tab, the driver multi-selects orders (Mobilus-style checkbox mode, plus a select-all) and confirms once. The app fires `POST /v1/driver/orders/:id/pickup` per order — the server has no batch endpoint (§9.3) — with one progress indicator, not ten. Each success moves the card to **On the way**; a failure (e.g. the admin reassigned the order seconds ago → `409`) leaves that card in place with an inline reason and never blocks the rest of the batch (`Promise.allSettled`, never `Promise.all`).

**The label check.** Confirming opens a sheet listing every selected order's `packages[]` as tappable label-code chips, which the driver ticks off with the employee — the workflow's *"en vérifiant que les étiquettes correspondent aux commandes qu'il a sur son application en collaborant avec l'employé."* The ticked count is sent as `confirmed_package_count`, the digital trace of that check.

A count that disagrees with the order is **accepted and logged by the server, never refused**, so the confirm button stays enabled at any count including zero. The bags on the counter are the truth, and a driver standing there mid-conversation must not be blocked by a validation error. The mismatch renders as a caution line, not a gate.

**Priority at the counter.** "Si une commande doit être livrée prioritairement, l'employé le dit au livreur maintenant." A flag control on the Ready card calls `POST /v1/driver/orders/:id/priority`; the stop re-sorts to the front immediately, the way the server will on the next poll.

**The POS terminal.** When `totals.requires_payment_terminal`, a banner on Ready names how many stops owe money and how much, from `payment_stop_count` and `amount_due_total` — while the driver is still in the building.

After a successful pickup batch the driver can order the run by hand (§5.4).

### 5.4 Route optimization, map, and navigation (MVP §5)

**The driver orders the run, and the optimizer suggests.** `domain_workflow.md` §En route: *"Le livreur détermine manuellement l'itinéraire le plus rapide … en tenant compte de l'estimation de distance faite par l'application et des commandes prioritaires."* A reorder sheet, reached from On the way, drives `POST /v1/driver/queue/sequence`. Three things about that endpoint shape it:

1. **It edits the whole day, not the van.** The server clears `sequence_number` on any active order missing from `ordered_order_ids`, so the sheet lists Ready *and* On the way together even though it opens from On the way. A partial list would silently unsequence everything still at the counter — asserted against the live server in `live-server-write-verbs.test.ts`.
2. **Priority beats position.** The server sorts `is_priority DESC` ahead of `sequence_number`, so a stop dragged above a priority one comes back below it. The same comparator runs locally on every change, so the snap-back happens under the driver's finger rather than a second later on screen.
3. **The response is the whole queue**, written straight into the cache. No invalidate, no second round trip.

Drag to reorder, with up/down chevrons beside the grip — a screen reader cannot drag, and one-handed operation is a §7 requirement. Built on the `react-native-gesture-handler` and `react-native-reanimated` already in Expo Go's prebuilt set; no new native dependency.

Per-stop distances render from `estimates` when a prior optimize supplied them, and nothing at all when it did not. Never invent a distance from an absence.

`POST /v1/driver/queue/optimize` stays as the secondary control ("Proposer un ordre"), with the current device location. The server writes `sequence_number` 1..N and returns the reordered queue.

- **Degraded mode is a first-class state.** The server never fails an optimize call over a provider outage — it returns the previous sequence with `degraded: true` (verified server behaviour). The app shows a quiet banner: "Route not optimized — using previous order", and everything else works. A routing outage must never stop a delivery run.
- `degraded` means one thing only: the route is the driver's previous one because the optimizer could not answer. It is **not** set when `estimates` are missing — an adapter that can order but not measure has given a perfectly good route, and missing estimates say so by `estimates` being absent.
- **Map view** (toolbar toggle, as in Mobilus): all active stops pinned on Mapbox, numbered by sequence; distinct pin styles for ready vs on-the-way; `$` marker on collection stops; a legend, since Mobilus taught drivers to expect one. Tapping a pin opens the same detail sheet as the list.
- **Turn-by-turn is not our problem.** "Navigate" on any stop opens the address in the driver's preferred navigation app (Google Maps / Apple Maps / Waze) via native intent. Building in-app guidance would be years of work to be worse than what the driver already trusts.

### 5.5 One-tap calling (MVP §5)

Call buttons on the detail sheet for the client (`phone_number` from the queue payload) and the pharmacy (`pharmacy.phone`), invoking the native dialer. No server telephony, no in-app VoIP. Once an order is terminal the server stops sending the client's phone number, and the button disappears with it.

### 5.6 Proof of Delivery — the one tap (MVP §5)

On the active stop's detail sheet: a single, full-width, thumb-reachable **"Delivered"** button → `POST /v1/driver/orders/:id/complete`.

- No signature. No photo. No confirmation dialog for a paid order — the tap **is** the confirmation, and undo is an admin correction, deliberately (server PRD §5.3: terminal states are immutable to drivers).
- **The one guard:** if `amount_due` is set and no payment has been recorded, the Delivered tap first presents the payment sheet (§5.7). The payment rides on the completion — `POST .../complete` takes an optional `{ payment }` and writes the transition and the collection in **one transaction**. Never `/payment` then `/complete`: that is two writes and a window where one landed and the other did not.
- **The client cannot pay.** The workflow is explicit that this is not the driver's decision: *"le livreur doit appeler la pharmacie et demander quoi faire (rapporter la commande ou donner gratuitement)."* So the sheet leads with a full-width **"Appeler la pharmacie"**, and the options below it *record what the driver was told* — `payment_exception: waived_by_pharmacy` or `deferred_to_pharmacy`, with an optional note — rather than offering a choice. Both end up on the pharmacy's exceptions report under this driver's name, which is why the wording matters. The third way out is bringing it back, which routes to the return sheet with `payment_refused` preselected.
- `payment` and `payment_exception` together is a `400`. The client models the outcome as a discriminated union (`{ kind: 'paid' } | { kind: 'exception' } | { kind: 'none' }`) so sending both is unrepresentable rather than validated.
- The UI transitions optimistically and rolls back from a snapshot on failure (§6). The driver never waits on a spinner at the door.
- On success, if `requires_cooler_bag`, the QC prompt appears (§5.9). Then the card moves to **Done** and its PII leaves the device (§8.1).

### 5.7 Payment collection (MVP §5)

No digital payments. The driver carries a physical POS terminal; the app records the outcome.

The payment sheet shows `amount_due` large, two method buttons (**Cash** / **Card**), and an amount field **pre-filled with `amount_due`** — the common case is one tap on the method. It submits through `POST .../complete` (§5.6), in one transaction with the delivery.

**`POST /v1/driver/orders/:id/payment` keeps exactly one job**: the terminal that only went through *after* the delivery was already marked complete. It is surfaced as "Enregistrer le paiement" on a completed card in Done, and nowhere else. The server accepts it on `picked_up` and `completed` only.

- The server responds with `matches_amount_due`. A mismatch is not an error — partial payments happen at the door — but the app shows "collected $15.00 of $42.50" so a typo is caught while the driver is still standing there.
- The server refuses payment against a returned order (nothing was collected from a patient who never answered); the app never offers the sheet on a return.
- `payment_status` is never written by the app directly; recording the collection is the only verb.

### 5.8 Return Order (MVP §5)

Patient unavailable → one **"Retourner la commande"** button on the detail sheet → a reason sheet → `POST /v1/driver/orders/:id/return`.

- **`reason` is required.** A bodyless call is `400 VALIDATION_FAILED`; there is no path that skips it. Five options, closed set: `customer_absent`, `customer_refused`, `wrong_address`, `payment_refused`, `other`.
- **`note` is optional and the driver never sees it again.** It writes to `orders.failure_note`, which is admin-only, redacted from logs, and stripped from every driver response. Capped at 500 characters with a live counter.
- Only reachable from `picked_up`; the server enforces it, so the button only exists on **On the way** orders.
- **A return is not terminal.** The order moves to `returned` and lands on the **À rapporter** tab (§5.13), not Done. The copy on the confirm must not say "terminé" — the driver still owes the pharmacy a handover.
- A second attempt is a **new order** created by the admin — the app has no "retry delivery" affordance.

### 5.9 Cooler-bag QC (MVP §5)

Immediately after completing or returning an order with `requires_cooler_bag`, a prompt: "Avez-vous récupéré le sac réfrigérant ?" → **Yes** / **No** via `POST /v1/driver/orders/:id/cooler-check`.

**This is the one call in the app that cannot be optimistic.** `cooler-check` is only valid once the order is terminal, so firing it against an optimistic `completed` the server has not written yet answers `409 ORDER_INVALID_TRANSITION`. The prompt waits for the transition to resolve.

Three states matter to the pharmacy's exceptions report, so the app must preserve all three: confirmed (`true`), answered no (`false`), and **dismissed** (`NULL` — the endpoint is simply never called). The prompt is dismissible and never blocks the next delivery: it is a QC record, not a gate. Unanswered checks remain visible as a badge on the Done tab entry so the driver can answer later, from the van, before end of day.

### 5.10 Done tab — today's history

The `closed` list from the queue payload: status, timestamps, cooler-check state, order reference. **No patient name, address, or phone** — the server strips them the moment the delivery attempt ends and the app renders what remains (§8.1). Yesterday is not reachable; the app is a tool for today's run, and history lives on the pharmacy's dashboard.

A `returned` order is **not** here. It is closed in the privacy sense and open in every other, so it belongs on **À rapporter** (§5.13). The split is enforced by type: `splitQueue` narrows this list to `TerminalStop`, and `ClosedOrderCard` will not accept anything else.

### 5.11 Bilingual FR/EN

Quebec drivers. French default, complete and idiomatic — window labels ("Livraison AM"), actions ("Livré", "Retourner la commande"), and every error string. Initial locale from the organization's `locale` via `/v1/auth/me`, overridable in settings, persisted on-device. French strings run 15–30% longer than English; the one-tap buttons must tolerate it without truncation. Four tabs squeeze the bar: labels drop to 11pt, and "À rapporter" is the longest in either language.

### 5.12 Notifications

*"Le livreur reçoit une notification et la commande apparaît dans la section en pharmacie."* There is no push channel (§9.2), so this is an in-app feed: `GET /v1/driver/notifications`, with four types — `order_assigned`, `order_ready`, `order_unassigned`, `order_cancelled`.

- **The badge is free.** `unread_notifications` rides on the queue payload the app already fetches every 30 seconds, so the bell in the header costs no extra request. The feed itself is fetched only when the screen opens.
- **A pushed route, not a fifth tab.** It is a destination the driver visits and leaves, and it should cover the tab bar. Pushing also leaves the tab group mounted, which keeps the queue's only long-lived cache observer alive (§6.1).
- **Marking read is explicit** — a tap on a row, or "tout marquer comme lu" — never automatic on mount. A driver who opens the feed at a red light and locks the phone would otherwise lose the badge and the only signal that anything happened. Marking read invalidates the queue too, so the bell follows.
- **Counts and order references only, never a name.** A feed row sits on screen while the phone is on a dashboard mount, which is where PII is most visible and least controlled (§8.1). The server helps: a notification carries a type, an order id, and two timestamps.

### 5.13 Return to pharmacy

*"Une fois les commandes retournées, le livreur peut confirmer sur l'application que la pharmacie les a bien récupérées."*

The **À rapporter** tab renders `to_return`. Each card shows the order reference, the `failure_reason`, when the attempt failed, and — the point of the screen — the **label codes**, which are exactly what survives the PII strip so the driver can match parcels against the employee's list.

- **The deadline is on screen.** `pharmacy.return_deadline` renders as "À rapporter avant 18:00", turning danger-coloured and changing wording past the hour. Nothing on the server enforces it; that is why it has to be visible.
- **The whole stack at once is the default.** `POST /v1/driver/returns/handover` runs the batch in one transaction, all or nothing — which is what a counter looks like. The per-card "Rendu" (`POST /v1/driver/orders/:id/handover`) covers the pharmacy taking some now and the rest later.
- Unanswered cooler checks stay badged here as well as on Done, so they can be answered from the van before end of day.
- What the app does **not** do: remind the driver about the coolers or old medications the pharmacy asked for verbally. Those arrangements are made in person and the app carries no field for them (`domain_workflow.md`, scénario C).

---

## 6. Offline & Network Resilience

The defining mobile constraint. Underground parking, concrete apartment towers, and dead zones on the Laurentian autoroute are the working environment, and the server was explicitly built for retrying clients — every driver mutation accepts an `Idempotency-Key`, replays are byte-identical, and a same-key-different-body replay is rejected with `409 IDEMPOTENCY_KEY_CONFLICT` (verified server behaviour).

### 6.1 What ships now: online-first with replay protection

**The SQLite outbox below is deferred, not built.** What stands in its place is the pair the server was designed for, and it is enough to make a retry safe:

- **An `Idempotency-Key` on every driver write.** The server registers that plugin only inside the driver scope, so these are the only calls in the API that get it. It fingerprints method + URL + body against the key, so a byte-identical retry either replays the stored response or runs for the first time — never double-writes. Keys are generated by `src/api/idempotency.ts`, deliberately without `expo-crypto`: this is a collision-avoidance token scoped to one device inside a 24-hour window, not a security primitive, and Expo's winter runtime installs no `crypto.randomUUID`.
- **Optimistic apply with snapshot rollback.** `src/queue/mutations.ts` cancels in-flight queries, snapshots the cache, applies a pure reducer from `src/queue/optimistic.ts`, and restores the snapshot verbatim on failure. Verbatim, not a computed inverse: the screen has to end up exactly where it started whatever else was in flight.
- **A failed write surfaces inline and the driver taps again.** The second tap gets a fresh key, which is correct — the first may have a 4xx cached against it for 24 hours.
- **The poll suspends while a write is in flight.** `cancelQueries` handles a poll already running; `useIsMutating` handles the one that would start during the window and overwrite the optimistic state with server truth that predates it.

Two rules fall out of `gcTime: 0` (§6.3) and are easy to break:

- The queue's cache entry only survives because `GlassTabBar` observes it for the whole tab group's lifetime. A `setQueryData` on a key with no observer is collected on the next tick, taking the optimistic update with it.
- **Never fire a queue mutation from something that outlives the navigator** — sign-out, for one.

What is genuinely lost without the outbox: a write attempted with no signal fails then and there rather than draining later. `src/api/idempotency.ts` is the seam where persistence lands if that is built.

### 6.2 The outbox — deferred

Every mutation (pickup, complete, return, payment, cooler-check) is written to a local SQLite outbox **before** the network attempt, with a client-generated UUID as its idempotency key, then applied optimistically to the UI.

- The outbox drains in FIFO order per order — a payment recorded before a completion must arrive in that order, because the server refuses payment on a terminal order.
- Retries use exponential backoff and resume on connectivity change and app foreground.
- A drained entry is deleted. An entry answered `4xx` (other than `408`/`429`) is **dead** — it will never succeed — and surfaces as a conflict (§6.3) instead of retrying forever.
- The key travels with the entry, so a retry after app death reuses the same key and lands as a server-side replay, not a duplicate.

### 6.3 Conflicts

Optimistic UI means the server can disagree after the fact — the admin reassigned the order seconds before the driver tapped, say. Today that disagreement arrives synchronously: the write fails, the cache is restored from its snapshot, `onSettled` refetches, and the reason renders inline from the server's error *code* (never its prose). `ORDER_ALREADY_TERMINAL`, `ORDER_FORBIDDEN`, and a bare `404` all say something different and useful, and `src/locale/error-message.ts` carries all three in both languages.

A `404` on a driver verb means the order left this driver's queue — pulled back, reassigned, or cancelled. It must never be worded as "not ready yet": an unpacked order also answers 404, and the two are indistinguishable by design.

The notice names the **order reference**, not the patient. By the time an order is cancelled the server has already stopped sending the name, so there is nothing to put there even if it were wise.

Once the outbox exists, a dead entry (§6.2) takes the same path asynchronously. Conflicts are rare, and loud beats silent.

### 6.4 What may touch disk

The outbox contains order IDs, verbs, amounts, and timestamps — **no patient name, address, or phone**. The queue cache (which does carry PII) is memory-only and dies with the process; a fresh launch re-fetches. This split is what §4.5 and §8.1 rely on: purging PII never loses a pending write.

### 6.5 Offline honesty — deferred with the outbox

A subtle status indicator when the outbox is non-empty ("2 updates pending sync"), so a driver ending their shift in a dead zone knows to keep the app alive until it drains. No modal nagging; the whole design goal is that offline feels identical to online.

Until then there is nothing to be honest *about* — a write either lands or fails in front of the driver — so the app ships no such indicator rather than a placeholder that always reads zero.

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

**The cliff is not the terminal set.** This is the single easiest thing here to get wrong, and getting it wrong hands a patient's address back on every failed delivery.

```
PII_VISIBLE_STATUSES = [in_pharmacy, picked_up]
TERMINAL_STATUSES    = [completed, returned_to_pharmacy, cancelled]
```

`returned` is in neither. A failed delivery is **not terminal** — the driver still owes the pharmacy a handover — but the *attempt* is over, so the patient's details go immediately. Anything that re-derives the boundary from "is it finished?" is wrong.

The server enforces it structurally: once an attempt ends, the response simply has no `patient_name`, `address`, `phone_number`, or `authorized_recipient` — the keys are absent, and the closed branch of `toDriverOrderView` does not read those columns at all.

The app mirrors that in its own types rather than restating the status list. `ActiveStop` is defined as `Extract<Stop, { patient_name: string }>` — by the PII it carries, not by a hand-written union — so if the server ever makes another status PII-visible, it lands in that type on the next `npm run api:types` instead of drifting.

**Label codes deliberately survive the strip.** A bag number is not a person, and the hand-back checklist (§5.13) is unusable without them.

The app's obligations:

- Evict the order's PII from the in-memory cache **when the attempt ends**, not merely stop rendering it — and not one poll later. `closeStop` in `src/queue/optimistic.ts` is where that happens: it builds the closed row by naming the keys that survive rather than spreading and deleting, because a spread with an omit list is one forgotten field away from leaving an address behind.
- Never copy PII into anything that outlives the process: no disk persistence of the queue cache (§6.4), no PII in navigation params, no PII in a banner or a notification row (§5.12), no PII in the address handed to the navigation app after the stop is closed.
- On logout, deactivation, or token-family revocation: full cache purge (§4.5).

A driver's device holds the addresses of the patients on today's *active* run — never yesterday's, never a completed stop's, and never a failed one's.

### 8.2 Storage rules

- Tokens: `expo-secure-store` only (§4.3).
- Outbox (when built, §6.2): SQLite, encrypted at rest, PII-free by construction (§6.4).
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

The complete driver flow is built and verified against the running API:

| Endpoint | Used by |
| --- | --- |
| `POST /v1/auth/login` · `/refresh` · `/logout` · `/register/driver` · `GET /me` | §4 |
| `GET /v1/driver/queue?date=&updated_since=` | §5.1 — `stops`, `to_return`, `closed`, `totals`, `unread_notifications` |
| `POST /v1/driver/orders/{id}/pickup` | §5.3, with `confirmed_package_count` |
| `POST /v1/driver/orders/{id}/priority` | §5.3 |
| `POST /v1/driver/orders/{id}/complete` | §5.6, with `payment` **or** `payment_exception` |
| `POST /v1/driver/orders/{id}/payment` | §5.7, after-the-fact collections only |
| `POST /v1/driver/orders/{id}/return` | §5.8, `reason` required |
| `POST /v1/driver/orders/{id}/cooler-check` | §5.9 |
| `POST /v1/driver/orders/{id}/handover` · `POST /v1/driver/returns/handover` | §5.13 |
| `POST /v1/driver/queue/sequence` · `/optimize` | §5.4 |
| `GET /v1/driver/notifications` · `POST /notifications/read` | §5.12 |

Idempotency is accepted on every non-GET driver route and on nothing else in the API.

**Two server behaviours the client must not fight.** An order is born `scheduled` and no driver can see it until staff call `POST /v1/orders/{id}/ready` — which is the admin dashboard's job, not ours. And a driver hitting a `scheduled` order gets **404**, not 409: the repository excludes the row before the state machine is reached, so it is indistinguishable from one that does not exist. There is deliberately no "pas encore prête" string anywhere in this app, because it could never be shown.

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
2. **Per-stop ETA.** Partly closed: `estimates` now carries `distance_meters` and `duration_seconds` per order. The current `FakeOptimizer` never populates it, so the app renders distances when they arrive and nothing when they do not. A real adapter closes this.
3. **Per-order time constraints.** Mobilus supports "after 17:00" per order; we model only the AM/PM window. If pharmacies ask for it, it is an `orders` column plus optimizer input, and the card design (§5.2) already reserves the chip slot.
4. **Driver day-summary.** Mobilus offers cash and travel reports. A `GET /v1/driver/summary?date=` (deliveries, returns, cash vs card collected) would back an end-of-shift POS reconciliation screen — the `closed` payload nearly suffices already if payment fields are included on terminal orders.
5. **Pharmacy address.** `pharmacy` is `{ name, phone, return_deadline }`. The return-to-pharmacy leg (§5.13) has no destination to hand a navigation intent for the trip back.
6. **A driver-scoped read of one order.** Every route under `/v1/orders` is admin-only, so there is no `GET /v1/driver/orders/{id}`. A notification row that points at an order not in today's payload has nothing to fetch, and conflict reconciliation refetches the whole day to see one row.

*Closed since the last revision:* manual reordering (`POST /v1/driver/queue/sequence`), `updated_since` on the queue, a required return reason, the return handover leg, and per-order priority.

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
| Test coverage                             | Non-negotiable: idempotency-key uniqueness and reuse, PII cache eviction when the delivery attempt ends, optimistic rollback, the transitions mirror against the live server, refresh single-flight, degraded-route rendering |

---

## 11. Suggested Build Sequence

1. **Foundation** — Expo scaffold, generated API types, typed client with refresh single-flight, secure token storage, error envelope handling, CI + EAS.
2. **Session** — login, invite-code registration, deactivation/revocation wipe path. _Hardest to retrofit; matches the dashboard's lesson._
3. **Queue read path** — tabs, cards, detail sheet, pharmacy/client calling, FR/EN wiring. Establishes the PII memory-only cache and eviction rules.
4. **The delivery verbs** — pickup (with batch select and the label check), complete with payment or exception, return with a reason, cooler prompt, the hand-back leg — online-first, optimistic from day one (§6.1). The outbox slots in behind `newIdempotencyKey` later.
5. **Route** — manual sequencing, optimize with degraded handling, navigation handoff. No map: the API exposes no coordinates.
6. **Polish** — conflict surfacing, accessibility pass, screenshot flags, FR/EN sweep. (The Done tab, the hand-back checklist, and the notifications feed landed with step 4.)
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
