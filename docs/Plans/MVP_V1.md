# Driver App — MVP Build Plan

## Context

drugstore-driver-app is currently the stock Expo SDK 57 template (src/app/index.tsx is still the "Welcome to Expo" screen). The server it talks to is complete and running locally at ../drugstore-server: the full driver flow — login, invite registration, queue, pickup/complete/return, payment, cooler-check, route optimize with a degraded contract, and Idempotency-Key on every mutation — is built and verified.

The goal of this plan is the MVP defined in docs/PRD.md: a driver-facing app that renders what /v1 tells it and lets a driver finish each doorstep interaction in one tap. Deployment is explicitly out of scope — no EAS Build/Submit, no store config, no OTA, no Sentry wiring. Development runs in Expo Go.

The build starts with a UI design pass driven by screenshots you will provide, so no screen is written against a guessed visual language.

## Scope decisions made during planning

Decision

Rationale

### No map view, no distance/bearing on cards

The API exposes no coordinates for stops. /v1/driver/queue returns address as a string; the orders table has no lat/lng at all (only driver_locations does, and that is Phase 5). PRD §5.4's map and §5.2's item 8 are not buildable as specified. Geocoding on-device was rejected: it breaks the thin-client rule (§3.1) and ships patient addresses to a third party from the highest-risk tier. Logged as a server gap below. Also keeps @rnmapbox/maps out, so everything runs in Expo Go.

### "Navigate" still ships

Native intent takes an address string — no coordinates needed. This is the part of §5.4 that actually survives.

### Outbox encryption behind a flag

SQLCipher is not supported in Expo Go. The outbox is PII-free by construction (§6.3), so plaintext during development is acceptable; PRAGMA key is applied only when a key is configured, making encryption a config change on a dev build later.

### FLAG_SECURE / screenshot blocking deferred

Same reason. Wired as a no-op hook now, enabled with the dev build.

### Tests included

PRD §10 calls outbox replay ordering, idempotency-key reuse, PII eviction, refresh single-flight, and degraded-route rendering non-negotiable. jest-expo + React Native Testing Library, run locally. CI is deployment work and stays out.

## Stack (Expo SDK 57 exact)

Already present: expo@~57.0.12, expo-router@~57.0.12, react-native@0.86.2, react@19.2.3, TypeScript 6, typed routes + React Compiler enabled in app.json.

To add via npx expo install: expo-secure-store, expo-sqlite, expo-location, expo-localization, expo-network, expo-keep-awake, expo-crypto, expo-clipboard.
npm-only: @tanstack/react-query, i18next, react-i18next, openapi-typescript (dev), jest-expo + @testing-library/react-native (dev).

tsconfig.json gains "noUncheckedIndexedAccess": true (PRD §3).

Deliberately not installed: @rnmapbox/maps, @sentry/react-native.

## Feature sequence

Each feature ends at a verification gate. Work stops at the end of Feature 1's gate.

### Feature 1 — Design system & screen components ✅ done

Style: high-fidelity Liquid Glass — frosted translucent panels over an organic mesh gradient, heavy backdrop blur, 1px crisp rims, high-contrast text. Built from the four supplied screenshots.

#### Shipped:

src/design/tokens.ts — the palette, the Glass recipes (blur / fill / border / lit edge, four levels), Tint status surfaces, type scale, 4pt spacing, TapTarget 48 / PrimaryActionHeight 60.

src/components/glass/ — mesh-background.tsx (four feathered colour blobs + BlurTargetView for Android's explicit blur source) and glass-panel.tsx (the one surface every card, chip, sheet and bar is made of).

src/components/driver/ — order-card.tsx (active + closed), next-stop-card.tsx, stop-sheet.tsx, queue-tab-bar.tsx, actions.tsx, badges.tsx, chrome.tsx, inputs.tsx.

src/lib/format.ts, src/lib/delivery-windows.ts, src/design/fixtures.ts (typed to the real /v1/driver/queue payload), src/design/gallery-strings.ts (FR/EN).

src/app/design.tsx — the gallery, reachable at /design; src/app/\_layout.tsx is now a transparent Stack over the mesh. (Named design.tsx, not \_design.tsx — Expo Router excludes underscore-prefixed files from routing.)

Template demo screens and components removed; tsconfig.json gains noUncheckedIndexedAccess and explicit types.

Test tooling landed early (jest-expo, React Native Testing Library) to verify rendering.

#### Three fixes after the first visual review, all of which made the design robust rather than merely correct on one platform:

React Navigation's theme was painting over the mesh. Its default background is an opaque rgb(242,242,242), which sat above the mesh and turned every screen light grey. \_layout.tsx now supplies a dark theme with transparent background/card.

The mesh's full-screen feathering BlurView washed the field out wherever blur falls back to a plain translucent view. Softness now comes from geometry — oversized, mostly off-screen blobs with colour-to-transparent ramps, plus a vignette — so no platform can turn the field light.

Glass fills are dark-based, never white-alpha. A white translucent fill only reads as glass when a real blur samples a dark field beneath it; tinting down into navy keeps the surface correct with or without blur, making blur an enhancement instead of a dependency.

Also: Navigate on the hero card takes the accent fill while Contact stays glass, matching the reference and the actual hierarchy.

Verification — passed: npx tsc --noEmit clean · npm test 11/11 green (both languages, PII-free closed card, transitions driven by the server prop) · npx expo export --platform android bundles 1267 modules with no errors · Metro serves the entry bundle over HTTP 200 · rendered in a headless browser and screenshotted at three scroll positions, no page errors — visual confirmation, since the washed-out background was invisible to every passing test.

### Feature 2 — Foundation ✅ done

#### Shipped:

npm run api:types → openapi-typescript openapi.json -o src/api/schema.d.ts. The generated src/api/schema.d.ts is never hand-edited. openapi-typescript peers on typescript@^5.x while this project is on TypeScript 6, so package.json carries an npm overrides entry mapping its typescript to the root one — the generator runs correctly against TS 6.0.3.

src/api/types.ts — named aliases derived from paths[...]. The driver stop type is the union ActiveStop | ClosedStop, extracted from the queue payload and discriminated on status, plus isActiveStop / isClosedStop so no screen re-derives the narrowing. The hand-written shapes in src/design/fixtures.ts are gone: the fixtures and the Feature 1 components now type-check against the generated aliases, so a server change breaks the build rather than the screen.

src/api/errors.ts — ApiError from the { error: { code, message, details } } envelope, with request_id lifted off the x-request-id header and idempotent-replay noted. Codes checked against the server's own registry (drugstore-server/src/core/errors.ts) rather than copied from the dashboard, which corrected two things: the expired-access-token code is TOKEN_EXPIRED (the dashboard's INVALID_TOKEN does not exist server-side), and the terminal set is INVALID_REFRESH_TOKEN / UNAUTHENTICATED / ACCOUNT_DISABLED. Also carries isRetriable, encoding the corrected dead-entry rule that Feature 5 drains on.

src/api/http.ts — raw transport, added beyond the plan to break a genuine import cycle: client.ts owns auth and so needs refresh.ts, while refresh.ts must make one call that does not go through the auth-owning path. Both import http.ts instead of each other. Query strings are built by hand rather than with new URL(), whose RN polyfill is incomplete.

src/api/base-url.ts + base-url.android.ts — the development default, split by platform file extension instead of a Platform.OS branch. This keeps src/api free of any React Native import, which is what lets the live verification run under plain Node.

src/api/client.ts — the one wrapper owning auth: attaches the bearer token, sends Idempotency-Key (rejecting >255 chars before spending a round-trip), and on a 401 TOKEN_EXPIRED refreshes once and replays the request with the same body and the same key. Terminal auth failures wipe the session. Typed endpoints for login, registerDriver, logout, getMe, getQueue.

src/api/refresh.ts — the single-flight mutex. One in-flight promise per process; concurrent callers await it. The stored session is read inside the critical section, never captured before an await, so a caller cannot present an already-rotated token and revoke the family. refreshAfterUnauthorized additionally compares the failing token against the stored one, so twenty simultaneous 401s produce one refresh. An unreachable server never wipes the session; only terminal auth codes do.

src/auth/token-store.ts — expo-secure-store only, keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY so the credential is neither backup- nor iCloud-eligible. The pair is stored under one key: a crash between two writes would leave a live access token beside a dead refresh token and lock the driver out permanently. An in-memory mirror keeps the Keychain off the hot path of every request.

Verification — passed: npx tsc --noEmit clean · npm test 67/67 green, up from 14 (53 new: 13 refresh/single-flight, 23 envelope-and-classification, 17 client) · npx expo export --platform android bundles with no errors · npm run verify:api drives the real client against the running server — signs in as the seeded FR driver, reads /v1/auth/me (locale fr, tz America/Toronto), prints the queue, and asserts the PII contract against 6 active stops and 9 terminal orders.

#### Three notes from the verification:

The live gate needs its own jest config (jest.verify.config.js). jest-expo installs Expo's WinterCG fetch over Node's, backed by a stub native module whose responses carry no status, so a real HTTP call cannot be evaluated under the app preset. It is excluded from npm test, which stays hermetic.

Today's queue is legitimately empty whenever the seed was last run on an earlier day. The verification therefore walks back to the most recent day carrying both active and closed orders — otherwise the terminal-payload assertions pass vacuously, which is the one way that test could go green while proving nothing.

The server's idempotency fingerprint sorts object keys before hashing, so a retry must be semantically identical rather than literally byte-identical. The client resends the original body regardless, which satisfies both readings.

### Feature 3 — Session

src/app/(auth)/sign-in.tsx, src/app/(auth)/register.tsx, src/auth/session-provider.tsx.

Expo Router Stack.Protected guards in src/app/\_layout.tsx — guard={!!session} for (app), guard={!session} for (auth).

Invite registration: 8-char code, uppercase monospace input auto-grouped 4+4, paste path via expo-clipboard. Distinct messages per code — INVITE_CODE_INVALID (422) vs INVITE_CODE_EXPIRED (422) vs INVITE_CODE_REDEEMED (409) — because "invalid code" sends the driver back to the pharmacist for nothing. Password minimum is 12 characters (server schema).

Throttling: LOGIN_THROTTLED carries details.retry_after_seconds; RATE_LIMITED carries only the x-ratelimit-reset header. Both must render real minutes.

Deactivation path: any terminal 401/403 ⇒ wipe secure store, purge the query cache, return to sign-in. The outbox survives (PII-free).

Verification gate: log in as driver@stlaurent.example.ca / DevPassword123!; kill the token and confirm silent refresh; deactivate the driver from the dashboard and confirm the next call wipes to sign-in.

### Feature 4 — Queue read path

src/queue/use-queue.ts — TanStack Query against GET /v1/driver/queue?date=, gcTime: 0, no persistence (PII is memory-only, §6.3). 30s foreground poll + pull-to-refresh; well inside the server's 100 req/min per-user budget.

src/app/(app)/index.tsx — the three tabs wired to real data: Ready = in_pharmacy, On the way = picked_up, Done = closed (which also includes cancelled).

Stop sheet wired: call patient (phone_number) and pharmacy (pharmacy.phone) via Linking.openURL('tel:'). Both disappear on terminal orders because the server stops sending the numbers.

src/i18n/ — i18next + expo-localization, FR default, initial locale from /v1/auth/me organization.locale, override persisted on-device. Every string from Feature 1 externalized.

src/lib/delivery-windows.ts — AM 09:00–12:00 / PM 13:00–17:00, mirroring the dashboard's file. The server does not expose the org's real window times (/v1/auth/me gives only id/name/phone/timezone/locale), so this is one constant, not literals scattered through the UI.

Verification gate: seeded orders appear in the right tabs with correct counts; PII evicted from the cache on terminal transition (test asserts the cache entry has no address key); FR and EN both render.

### Feature 5 — The delivery verbs, through the outbox

src/outbox/db.ts — expo-sqlite, PRAGMA journal_mode = WAL, table outbox(id, order_id, verb, body_json, idempotency_key, created_at, attempts, next_attempt_at, state). PRAGMA key applied only when a key is configured.

src/outbox/queue.ts — write-before-network, then optimistic UI. Key generated with expo-crypto randomUUID() and stored with the entry so a retry after app death replays server-side instead of duplicating. Drain is FIFO per order — payment must land before completion. Exponential backoff; resume on expo-network connectivity change and on app foreground.

Dead-entry rule, corrected against the server: any 4xx is dead except 408, 429, and 409 IDEMPOTENCY_REQUEST_IN_FLIGHT — that last one means the original request is still running server-side and explicitly asks the client to retry shortly. The PRD's blanket "4xx is dead" would strand it.

Verbs: pickup (multi-select + select-all, one POST per order, one progress indicator, a 409 on one card never blocks the batch), complete, return (single confirmation), payment sheet, cooler prompt.

Payment guard: tapping Delivered on an order with amount_due set and no payment recorded opens the payment sheet first; "Complete without payment" is a conscious second choice. Server accepts payment on picked_up or completed (not on returned/cancelled), and answers PAYMENT_ALREADY_COLLECTED on a double-submit. matches_amount_due: false renders "collected $15.00 of $42.50" — not an error.

Cooler prompt: three states preserved — true, false, and dismissed = never call the endpoint. Never a gate. Only valid once terminal and only when requires_cooler_bag.

Verification gate: airplane mode → pickup → deliver → pay → return all succeed optimistically; re-enable network and confirm the outbox drains in order with no duplicates; force-quit mid-drain and confirm the replay reuses the same key and returns idempotent-replay: true. Tests cover replay ordering and key reuse.

### Feature 6 — Route optimization

POST /v1/driver/queue/optimize with a one-shot expo-location foreground fix (works in Expo Go; permission denial is not fatal — the body's current_location is optional).

Degraded is a first-class state: the server returns the previous sequence with degraded: true rather than failing. Quiet banner, everything else keeps working.

Triggers: after a pickup batch, after a return, and a prominent manual control.

Stops render in server sequence_number order only — never a client-side re-sort (§3.1).

"Navigate" opens the address in Google/Apple Maps via native intent; expo-keep-awake while the active route is on screen; app resumes exactly where it was after the round-trip.

Verification gate: optimize reorders the list; stop the server's optimizer (ROUTE_OPTIMIZER=fake already degrades on failure) and confirm the banner appears with the old order intact.

### Feature 7 — Polish

Done tab with the "Return to pharmacy" checklist and unanswered-cooler-check badges; "N updates pending sync" indicator; conflict surfacing (dead entry ⇒ re-fetch, reconcile, plain notice); accessibility pass (VoiceOver/TalkBack labels, dynamic type on cards); FR/EN completeness sweep.

Verification gate: full manual run-through of a 5-stop day in French, then English.

## Verification (end-to-end)

Start the backend from ../drugstore-server:

docker compose up -d # postgres :5433, redis :6379
npm run migrate && npm run seed
npm run dev # :3000

Seeded driver accounts (password DevPassword123!): driver@stlaurent.example.ca (FR org) and driver@riverside.example.ca (EN org). Two organizations exist deliberately — cross-org isolation shows up as visible data, not an empty list. Orders are created/assigned from the admin dashboard at ../drugstore-admin-dashboard (npm run dev, :3001).

App: EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000 npx expo start, then Expo Go. Per-feature gates above; npx tsc --noEmit and npm test must be clean at every gate.

## Server gaps to raise (found while planning)

No stop coordinates. Blocks the map view and card distance/bearing outright. Needs latitude/longitude on orders (geocoded server-side at creation) exposed in the driver queue payload.

Org delivery-window times are not exposed. They exist on organizations but no endpoint returns them; both clients are hardcoding defaults.

No batch pickup endpoint — 15 packages is 15 POSTs on the worst network in the building.

Per-stop ETA, manual reordering, driver day-summary, and updated_since on the driver queue, as already listed in PRD §9.3.

## Out of scope (MVP)

Admin screens, digital payments, signature/photo PoD, multi-pharmacy, background location, push/WebSocket, in-app chat, patient SMS — plus all deployment work: EAS Build/Submit, store metadata, OTA updates, Sentry.
