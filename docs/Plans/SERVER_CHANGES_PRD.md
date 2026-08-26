# PRD — Server changes to match the pharmacy's real workflow

**Target repo:** `../drugstore-server` (Fastify 5 · zod · knex · Postgres · Redis)
**Raised by:** drugstore-driver-app
**Status:** Requirements — not yet scheduled
**Source documents:** `docs/Plans/domain_workflow.md`, `docs/Plans/MVP_V1.md`, `docs/PRD.md`

---

## 1. Why this document exists

`domain_workflow.md` is the first description of how the pharmacy actually runs a delivery day, written by the people who run it. The driver app was built from `PRD.md`, which was itself derived from a competitive read of Mobilus and from what the API already offered. The two disagree, and the disagreements are not cosmetic: several steps the pharmacy performs every single day have **no representation in the data model at all**.

The driver app has since been re-planned against the real workflow, under an explicit constraint: **the app closes every gap it can close alone, and raises the rest here.** The first of those app features — shift awareness, the 30-second poll plus new-order alerts — has shipped. Everything in this document is a gap the app cannot close from the device, because the information either does not exist server-side or cannot be sent back to the pharmacy.

Each requirement below names the workflow sentence that motivates it. If a requirement cannot be traced to one, it does not belong here.

## 2. Scope

### In scope

Changes to `../drugstore-server`: schema migrations, the `/v1` contract, driver and admin endpoints, and the push delivery path.

### Out of scope

- Driver app work — tracked in `MVP_V1.md`.
- Admin dashboard screens. Several changes here imply dashboard work (a "mark prepared" control, a reconciliation view); that is called out per item but not specified.
- Anything already shipped and working: auth, refresh rotation, idempotency, the order state machine, the PII-stripping driver serializer.

### Explicitly rejected — do not build

The workflow's §Scénario C describes special situations: a deaf patient who needs a third party called, a paraplegic patient, a door code, a residence's internal pharmacy. It also states these are communicated **in person** and are deliberately **not in the application**. §Avant prise en charge separately implies the admin records "cas particulier" and "personne autorisé à réceptionner" at order entry.

**We follow §Scénario C.** The following are decided against, on both tiers:

| Not building | Why |
| --- | --- |
| `authorized_recipient` field on orders | The driver verifies a person by looking at them. A field would add a step to the one-tap PoD that is the product's headline simplification (`PRD.md` §2), and would put a named third party into the patient record. |
| Special-instruction / "cas particulier" free text on orders | Would collect health-adjacent detail (deafness, mental illness, mobility) and building access codes into a database that currently holds logistics only — the schema's own stated boundary. |
| Items-to-bring-back reminders beyond `requires_cooler_bag` | The workflow says the driver remembers these himself. `requires_cooler_bag` already exists and stays as it is. |
| Per-order time constraints, evening delivery window | Not mentioned in the workflow. Untouched. |

This table is as much a requirement as the rest of the document: **an implementer reading §Avant in isolation would build the authorized-recipient field.** It should not be built.

---

## 3. Summary

| ID | Change | Workflow step | Priority |
| --- | --- | --- | --- |
| **S1** | Return reason and note on `POST .../return` | §À l'adresse — Scénario B | **P0** |
| **S2** | Order preparation state | §Avant — staff declare orders ready | **P0** |
| **S3** | Handover confirmation for returned packages | §Retour en pharmacie | **P0** |
| **S4** | Payment fields on closed driver orders | §Retour — cash must match expected | **P0** |
| **S5** | Push notification channel | §Avant — "le livreur reçoit une notification" | **P0** |
| **S6** | Stop coordinates | §En route — distance estimate | P1 |
| **S7** | Pharmacy address in the queue payload | §Retour en pharmacie | P1 |
| **S8** | Organization window times and return-by cutoff | §Retour — "avant une certaine heure limite" | P1 |
| **S9** | Real route optimizer, and honour `current_location` | §En route | P1 |
| **S10** | Resolve `degraded` on `GET /v1/driver/queue` | contract defect | P1 |
| **S11** | Immediate deactivation on driver endpoints | `PRD.md` §4.5 | P1 |
| **S12** | Driver day summary | §Retour — reconciliation | P2 |
| **S13** | Manual reorder endpoint | §En route — the driver owns the route | P2 |
| **S14** | `updated_since` on the driver queue | efficiency | P2 |
| **S15** | Batch pickup | §Pendant prise en charge | P2 |
| **S16** | Driver-scoped single order read | conflict reconciliation | P2 |
| **S17** | `POST /v1/invites/` rejects a body-less request | papercut | P3 |

P0 = a step the pharmacy performs daily has no server representation. P1 = blocks a planned app feature, or is a known defect. P2/P3 = quality.

---

## 4. P0 — steps with no server representation

### S1 — Return reason and note

> *"Le livreur marque la commande comme non livré et doit justifier en sélectionnant que le client était absent. Il peut ajouter une note à sa discrétion (exemple si le client refuse de récuperer la commande mais est présent)."* — §À l'adresse, Scénario B

**Problem.** `POST /v1/driver/orders/{id}/return` accepts no body (`src/modules/driver/routes.ts`). A return records *that* a package came back and nothing about *why*. The pharmacy needs the justification: "absent" and "present but refused" are different problems with different follow-ups, and today both arrive as the same event.

The app deliberately does **not** capture this locally. A justification the pharmacy never sees is worse than none, because it creates the impression the information was recorded.

**Requirement.**

```
POST /v1/driver/orders/{id}/return
{
  "reason": "client_absent" | "client_refused" | "wrong_address" | "unable_to_pay" | "other",
  "note": string | null        // <= 500 chars, optional
}
```

- `reason` required. `note` optional, and **required when `reason` is `other`** — an unexplained "other" is not a justification.
- `unable_to_pay` exists because the workflow gives it its own branch (§Scénario A: the driver calls the pharmacy and is told to bring the order back). Separating it from `client_absent` is what lets the pharmacy see how much revenue is failing at the door rather than at the buzzer.
- Persist on `orders`: `return_reason` (a new enum type, following the `order_status` pattern) and `return_note VARCHAR(500)`.
- Surface on the admin order view and in the `order_status_events` trail.
- `note` is driver-authored free text about a delivery attempt. Govern it as PII: excluded from logs, covered by the retention policy, and **never returned on a driver-facing closed order**.

**Backwards compatibility.** Making the body required is a breaking change to a currently body-less endpoint. Ship `reason` optional first and record "not supplied" distinctly from any chosen value; make it required once the app ships the reason sheet.

**Acceptance.**
- A return with no reason is accepted during the transition window and recorded as unspecified.
- A return with `reason: "other"` and no note is rejected `VALIDATION_FAILED`.
- Reason and note appear on `GET /v1/orders/{id}` for the admin, and on no driver response.

---

### S2 — Order preparation state

> *"Le jour de la commande, les employés préparent physiquement la commande et la déclare comme prête à être prise en charge."* — §Avant prise en charge

**Problem.** An order is `in_pharmacy` from the moment the admin creates it. There is no distinction between *entered into the system* and *physically packed and sitting on the counter*. The driver's Ready tab therefore lists packages that may not yet exist as physical objects, and the app has no way to tell the difference.

**Requirement — a timestamp, not a status.**

Add `orders.prepared_at TIMESTAMPTZ NULL` and `orders.prepared_by_user_id UUID NULL` (FK `users`, `ON DELETE SET NULL`).

```
POST /v1/orders/{id}/prepare        // admin/staff, idempotent
POST /v1/orders/{id}/unprepare      // correction path
```

Expose `prepared: boolean` on `ActiveDriverOrderView` (`src/modules/orders/serializers.ts`).

**Why not a `prepared` value in the status enum.** `order_status` drives the transition table in `src/modules/orders/stateMachine.ts`, the `idx_orders_driver_date_sequence` partial unique index, the driver app's `ActiveStatus` union, and its three-tab mapping. A fourth active status would ripple through all of them to express a fact that is orthogonal to the lifecycle — an order can be assigned, resequenced, and cancelled regardless of whether it is packed. A nullable timestamp carries the same information at a fraction of the blast radius, and matches how `picked_up_at` and `completed_at` already work.

**Does an unprepared order block pickup?** *Recommendation: no.* A hard block means a staff member who forgets to tap "prepared" strands a driver at the counter holding a package with no way to proceed — trading a rare error for a frequent one. Expose the flag, let the app mark unprepared stops visually, and leave the physical check with the two people standing at the counter, which is where the workflow already puts it. If a pharmacy later wants enforcement, add it as a per-organization setting rather than a platform rule.

**Acceptance.**
- `prepare` is idempotent — a second call returns 200 and does not move the timestamp.
- `prepared` appears on active driver stops and is absent from closed ones.
- Pickup still succeeds on an unprepared order, unless enforcement is later enabled.

---

### S3 — Handover confirmation for returned packages

> *"Le livreur donne aux employés de la pharmacie les factures, le cash récolté et les commandes retourné. Une fois les commandes retourné, le livreur peut confirmer sur l'application que la pharmacie les as biens récupéré."* — §Retour en pharmacie

**Problem.** `returned` means "the driver decided at the door that this package is coming back". It does **not** mean the package is physically behind the counter again. Those two facts are separated by a whole afternoon in a vehicle, and the workflow asks the driver to confirm the second one explicitly. There is no endpoint, so the app's end-of-day checklist can only be a private tick that never reaches the pharmacy.

**Requirement.** Add `orders.returned_handover_at TIMESTAMPTZ NULL`.

```
POST /v1/driver/orders/handover
{ "order_ids": [uuid, ...] }      // 1..100
-> { "confirmed": [uuid], "rejected": [{ "order_id": uuid, "code": string }] }
```

A batch, because the driver hands over a stack of packages in one motion at the counter — one confirmation, not eight.

- Valid only on orders with `status = 'returned'` belonging to the calling driver. Anything else lands in `rejected` with a code; **a bad id never fails the whole batch**, matching how the app already handles per-card failures during pickup.
- Idempotent: re-confirming an already-confirmed order returns it under `confirmed` without moving the timestamp.
- Honours `Idempotency-Key` like every other driver mutation.
- Expose `returned_handover_at` on `ClosedDriverOrderView` (the closed view is being widened anyway — see S4) and on the admin view, so the pharmacy can see which returns are still sitting in a vehicle.

**Acceptance.**
- A mixed batch of valid, foreign, and non-returned ids confirms exactly the valid ones.
- Replaying the batch with the same `Idempotency-Key` returns `idempotent-replay: true` and changes nothing.

---

### S4 — Payment fields on closed driver orders

> *"Le montant rapporté doit correspondre aux montants attendu sauf exception."* — §Retour en pharmacie

**Problem.** `ClosedDriverOrderView` carries id, status, timestamps, and cooler state — no payment data at all. So the app cannot show a driver what they are expected to hand over. The app currently works around this with a local ledger of the collections it recorded itself, which is correct for its own writes and blind to everything else: a payment recorded on a previous device, a correction made by the admin, or a collection that landed server-side while the app was offline.

The reconciliation the workflow describes has two sides, and the pharmacy's side is authoritative. The driver should be reading the same number.

**Requirement.** Add to `ClosedDriverOrderView`: `amount_due`, `amount_collected`, `payment_method`, `payment_collected`.

**Privacy note.** The closed view is narrow *by design* — `src/modules/orders/serializers.ts` builds the terminal branch without reading the PII columns at all, which is what makes leaking a patient address a compile error rather than something a reviewer has to catch. Widening it needs a justification, and the justification is that these four fields are money and a method attached to an order id. None of them identifies a patient. `patient_name`, `address`, and `phone_number` **stay out**, and the terminal branch must continue not to read them.

**Acceptance.**
- A completed order with a recorded collection returns the method and the amount.
- A completed order with `amount_due` and no collection returns `payment_collected: false` — this is the exception the workflow explicitly allows, and the driver has to be able to explain it at the counter.
- No terminal driver response contains a patient name, address, or phone number. (Already pinned by an app test.)

---

### S5 — Push notification channel

> *"Le livreur recoit une notification et la commande apparait dans la section en pharmacie."* — §Avant prise en charge
> *"Le livreur effectue les livraisons mais reste à l'affut des commandes pouvant être ajouter par la pharmacie durant son shift."* — §En route

**Problem.** There is no push channel. The driver app now polls every 30 seconds while foregrounded and raises an in-app banner when the queue gains an order — which covers the driver who is looking at the app, and does nothing for the driver who is in Google Maps with the phone on a dashboard mount. That is precisely the case the workflow describes.

**Requirement.**

1. **Token registration.**
   ```
   POST   /v1/driver/push-tokens   { "token": string, "platform": "ios" | "android" }
   DELETE /v1/driver/push-tokens/{token}
   ```
   New table `driver_push_tokens(id, user_id, organization_id, token UNIQUE, platform, created_at, last_seen_at, revoked_at)`. Revoke on logout and on driver deactivation, alongside the refresh-token revocation that already happens there.

2. **Send on two events**, both fanned out through a background queue so that a provider outage never blocks the request that triggered it. `bullmq` is already declared in `package.json` but has **no callers anywhere in `src`** — S5 would be its first user, so the estimate has to include standing the worker up, not just writing a job.
   - an order is assigned to a driver (`POST /v1/orders/{id}/assign`, and creation with `driver_id`);
   - an order is assigned to a driver who already has `picked_up` orders that day — the "come back to the pharmacy" case, which deserves its own wording.

3. **No PII in the payload.** `PRD.md` §8.4 is explicit: a notification renders on a lock screen. Counts and order ids only — *"2 nouvelles commandes"*, never a patient name or address. The app fetches the queue when it is opened.

4. **Localised** from `organizations.locale`, the way `notifications` rows already are.

**Recommendation: Expo Push (HTTP to `exp.host`), not the WebSocket.** `socket.io` is already a dependency but is not wired into `src/app.ts` or `src/server.ts`. A socket only delivers to a connected client, which means a foregrounded app — exactly the case the 30-second poll already handles. The unsolved case is the backgrounded phone, and only the OS notification services reach it. The WebSocket stays worthwhile later for live dashboard updates; it does not satisfy this requirement.

**Client-side consequence, flagged for planning.** Expo Go has not accepted remote push since SDK 53, so the driver app needs a development build to receive these. `MVP_V1.md` currently puts all build and deploy work out of scope. **S5 cannot be verified end to end without lifting that constraint** — worth deciding before the server work is scheduled.

**Acceptance.**
- Assigning an order to a driver with a registered token produces exactly one notification.
- The payload contains no patient name, address, or phone number.
- A deactivated driver's tokens are revoked and receive nothing.
- Provider unavailability fails the queued job, not the assignment request.

---

## 5. P1 — blocked features and known defects

### S6 — Stop coordinates

> *"Le livreur détermine manuellement l'itinéraire le plus rapide … en tenant compte de l'estimation de distance faite par l'application."* — §En route

**Problem.** `orders` has `address` and no coordinates; only `driver_locations` has any. The workflow assumes the app shows a distance estimate the driver weighs when ordering the route by hand. The app has now shipped hand-ordering **without that aid**, because it cannot produce it: on-device geocoding was rejected, since it would ship patient addresses to a third party from the highest-risk tier and break the thin-client rule (`PRD.md` §3.1).

**Requirement.** Add `orders.latitude` and `orders.longitude` (DOUBLE PRECISION, nullable) plus `geocoded_at`. Geocode server-side at order creation and whenever the address changes, through the same brokered Mapbox credentials route optimization uses. Expose both on `ActiveDriverOrderView`.

A geocoding failure must not block order creation — leave the columns NULL, let the app fall back to showing no distance, and retry out of band.

**Privacy.** This does send patient addresses to Mapbox. That is a deliberate processor relationship at the server tier, contracted and logged once, and it is strictly better than the alternative of every driver's phone doing it individually. It needs a line in the Law 25 / PIPEDA processing record.

**Acceptance.** A created order gets coordinates within one geocode round-trip; a geocode failure leaves the order usable; coordinates appear on active driver stops and never on closed ones.

---

### S7 — Pharmacy address in the queue payload

> *"Une fois les commandes compléter, le livreur retourne en pharmacie."* — §Retour en pharmacie

`organizations.address` exists. The queue's `pharmacy` object is `{name, phone}` (`src/modules/orders/repository.ts::findOrganizationContact`), and `/v1/auth/me` gives `{id, name, phone, timezone, locale}`. The trip back to the pharmacy — which the workflow makes a required step, and which the app's return-to-pharmacy prompt now points at — has no destination to hand a navigation intent.

**Requirement.** Add `address` to the queue's `pharmacy` object, and `latitude`/`longitude` once S6 lands.

---

### S8 — Organization window times and return-by cutoff

> *"Le livreur retourne en pharmacie avant une certaine heure limite."* — §Retour en pharmacie

`organizations` carries four real columns — `am_window_start` 09:00, `am_window_end` 12:00, `pm_window_start` 13:00, `pm_window_end` 17:00 — returned by no endpoint. Both clients hardcode them (`src/lib/delivery-windows.ts` in the app, and its mirror in the dashboard), so a pharmacy that changes its hours silently gets wrong labels in both.

The cutoff is a *separate* fact from the PM window end: a pharmacy may want deliveries until 17:00 and drivers back by 17:30.

**Requirement.** Expose the four window times on `/v1/auth/me` under `organization`, and add `return_by_time TIME NULL` exposed alongside them. NULL means no cutoff, and the app shows none.

---

### S9 — Real route optimizer, and honour `current_location`

`FakeOptimizer` sorts by `address.localeCompare` — deterministic and visibly reordered, but not a route. `ROUTE_OPTIMIZER=mapbox` passes env validation, logs a warning, and falls back (`src/integrations/routing/index.ts`). And `RouteStop` is `{orderId, address}` (`src/integrations/routing/types.ts`), so the `current_location` the app sends is validated by `optimizeBodySchema`, passed to the port as `origin`, and then **discarded**, because no adapter can do anything with an address-only stop.

**Requirement.** Widen `RouteStop` to carry coordinates (depends on S6) and implement the Mapbox adapter behind the existing port. The degradation contract already works and must be preserved exactly: a provider outage returns the previous sequence with `degraded: true`, never an error.

**Priority note.** The driver app now treats the server sequence as a *suggestion* that seeds a hand-ordered route, so a stub optimizer is less damaging than it was when the server owned the ordering outright. That is why S9 sits at P1 rather than P0, despite being listed as blocking in the original plan.

---

### S10 — Resolve `degraded` on `GET /v1/driver/queue`

`queueResponseSchema` declares `degraded` on the GET, but only `optimizeQueue` ever sets it — `getQueue` returns `{date, pharmacy, stops, closed}`. The banner is reachable only in the seconds after an optimize call, and vanishes on the next poll. The spec and the implementation disagree.

**Requirement — pick one and make the contract honest:**
- **(a)** persist the degraded state for the driver's day and return it from the GET; or
- **(b)** remove `degraded` from the GET's schema, leaving it on optimize only.

**Recommendation: (b).** It is the cheaper change, and "your route was not optimized" is a much weaker statement now that the driver orders the stops themselves. Option (a) would be the right answer if the server still owned the ordering. The app already types `degraded` as optional and will simply stop seeing it.

---

### S11 — Immediate deactivation on driver endpoints

Deactivating a driver revokes every refresh token, and `/v1/auth/me` and `/v1/auth/refresh` re-check `is_active` and answer `ACCOUNT_DISABLED`. The driver endpoints do not: `authenticate` in `src/plugins/auth.ts` verifies the JWT and builds the request context from its claims, so an already-issued access token keeps returning patient addresses for up to 15 minutes. `PRD.md` §4.5 says "the next API call returns 401"; that is true of `/v1/auth/me` and false of `/v1/driver/queue`.

The app cannot close this — the token verifies correctly. It is pinned by a live test that **fails if the server ever closes it**, so the app team will notice the day it lands.

**Requirement.** Re-check `is_active` on authenticated requests. A per-request user lookup is the simple version; a Redis-backed revocation set (`ioredis` is already a dependency) keeps it off the hot path. Either is acceptable. A 15-minute window on a device that may itself be the reason for the deactivation is not.

---

## 6. P2 / P3 — quality

### S12 — Driver day summary

> *"La pharmacie entre les factures dans le système admin sous le nom du livreur. Le montant rapporté doit correspondre aux montants attendu."*

`GET /v1/driver/summary?date=` returning deliveries, returns, cash collected, card collected, and the count of completions with an uncollected `amount_due`. S4 lets the app compute this itself; a server-side summary makes the driver's number and the pharmacy's number provably the same number, which is the entire point of the reconciliation. The admin dashboard needs the mirror view — flagged, not specified here.

### S13 — Manual reorder endpoint

`PUT /v1/driver/queue/order` with `{date, ordered_order_ids}` writing `sequence_number`. `OrdersRepository.resequence` already does exactly this work for the optimizer and would be reused directly.

The driver app has **already shipped hand-ordering as device-local state**, so this is not blocking. It is the durable fix for a known consequence of that decision: until it lands, the pharmacist's dashboard shows a different stop order than the driver's phone. Whether that matters in practice is an operational question worth putting to the pharmacy.

### S14 — `updated_since` on the driver queue

The app polls every 30 seconds and receives the whole day each time. The index already exists (`idx_orders_org_updated`), and the admin orders list already supports the parameter.

### S15 — Batch pickup

`POST /v1/driver/orders/pickup-batch`. Taking fifteen packages in charge is fifteen POSTs on the worst network in the building — the pharmacy counter. The app hides it behind one progress indicator, but the failure modes are real. Same partial-success envelope as S3.

### S16 — Driver-scoped single order read

Every `/v1/orders` route is `requireRole("admin")`, so conflict reconciliation and any deep link to a single stop must refetch the whole day.

### S17 — `POST /v1/invites/` rejects a body-less request

Returns `VALIDATION_FAILED` ("Expected object, received null") even though every field in its schema is optional. `{}` works. A papercut, not a defect.

---

## 7. Delivery notes

**Migrations.** The latest applied is `009_schema_hardening`, so new work starts at `010`. Follow the existing house style: a header comment naming the requirement, `IF NOT EXISTS` guards, and `COMMENT ON COLUMN` explaining *why* the column exists, as `004_orders_amount_due.sql` does. A new enum type needs its own migration outside a transaction, as `002_cancelled_status_enum.sql` did.

**Contract propagation.** Every change here alters `openapi.json`. Regenerate with `npm run openapi:dump`; the driver app then regenerates `src/api/schema.d.ts` with `npm run api:types`, which turns any drift into a compile error rather than a runtime surprise. `docs/Testing/LIVE_API_TEST_PLAN.md` diffs the live spec against the checked-in one and currently expects 23 paths — that count moves with S2, S3, S5, S12, S13, S15, and S16.

**Compatibility.** Additive response fields are safe: the app's generated types ignore what they do not know, and its screens narrow on `status` before reading anything. Two changes need sequencing — **S1** (a new required request body: ship it optional first) and **S10(b)** (a narrowing, safe only because the app already treats `degraded` as optional).

**New error codes** to register in `src/core/errors.ts`: `ORDER_NOT_PREPARED` (422, only if S2 enforcement is ever enabled), `ORDER_NOT_RETURNED` (422, S3), `PUSH_TOKEN_INVALID` (422, S5).

**Testing.** The repo runs `vitest` plus the black-box `scripts/verify-*.mjs` suites. Each requirement above should extend `verify:driver`; S1, S2, and S3 additionally need state-machine unit tests. The driver app's own live gate (`npm run verify:api`) drives the real server and picks up contract drift on the next run.

**Suggested order.** S4 and S7 are hours of work and unblock the app's end-of-shift screen immediately. S1, S2, and S3 are the schema changes that make the workflow expressible at all, and should land together since all three touch the order lifecycle. S11 is a security fix and should not wait behind features. S6 and S9 are one project and should be scheduled as one. S5 is the largest, and needs the client-side build decision resolved first.
