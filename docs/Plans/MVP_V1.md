# Driver App — MVP Build Plan

## Context

drugstore-driver-app is currently the stock Expo SDK 57 template (src/app/index.tsx is still the "Welcome to Expo" screen). The server it talks to is complete and running locally at ../drugstore-server: the full driver flow — login, invite registration, queue, pickup/complete/return, payment, cooler-check, route optimize with a degraded contract, and Idempotency-Key on every mutation — is built and verified.

> **Revised after the server moved.** The backend was rebuilt against the pharmacy's real workflow (docs/Plans/domain_workflow.md) and now has a different state machine: an order is born `scheduled` and invisible to drivers, and `returned` is no longer terminal — `picked_up → returned → returned_to_pharmacy`, where the middle state means the package is in the driver's van. The vendored openapi.json was eight days stale when this was noticed, and every type in the app described an API that no longer existed.
>
> **Re-syncing openapi.json is step one of any future feature here.** Copy ../drugstore-server/openapi.json over the local one, run `npm run api:types`, and let `npm run typecheck` produce the work list. Feature 4.5 below is what that produced this time.

The goal of this plan is the MVP defined in docs/PRD.md: a driver-facing app that renders what /v1 tells it and lets a driver finish each doorstep interaction in one tap. Deployment is explicitly out of scope — no EAS Build/Submit, no store config, no OTA, no Sentry wiring. Development runs in Expo Go.

The build starts with a UI design pass driven by screenshots you will provide, so no screen is written against a guessed visual language.

## Scope decisions made during planning

Decision

Rationale

### No map view, no distance/bearing on cards

The API exposes no coordinates for stops. /v1/driver/queue returns address as a string; the orders table has no lat/lng at all (only driver_locations does, and that is Phase 5). PRD §5.4's map and §5.2's item 8 are not buildable as specified. Geocoding on-device was rejected: it breaks the thin-client rule (§3.1) and ships patient addresses to a third party from the highest-risk tier. Logged as a server gap below. Also keeps @rnmapbox/maps out, so everything runs in Expo Go.

### "Navigate" still ships

Native intent takes an address string — no coordinates needed. This is the part of §5.4 that actually survives.

### No SQLite outbox in this scope — online-first instead

The delivery verbs ship without the outbox of PRD §6. What replaces it is the pair the server was designed for: an `Idempotency-Key` on every driver write, so a retry can never double-write, and an optimistic apply with verbatim snapshot rollback, so a refusal leaves the screen exactly where it started. A failed write surfaces inline and the driver taps again.

What is genuinely lost: a write attempted with no signal fails then and there rather than draining later. That is a real gap, and it is the reason the outbox stays on the roadmap rather than being cut.

`src/api/idempotency.ts` is the seam. It generates keys without `expo-crypto` — Expo's winter runtime installs no `crypto.randomUUID`, and this is a collision-avoidance token scoped to one device inside a 24-hour server window, not a security primitive. When the outbox lands, keys have to survive app death so a retry replays instead of duplicating, and that one function is where persistence goes.

### No new native dependency for drag reorder

Manual sequencing (PRD §5.4) is built on the `react-native-gesture-handler@2.32` and `react-native-reanimated@4.5.1` already in Expo Go's prebuilt set. Every drag-list package on npm is still catching up to Reanimated 4 / RN 0.86, and a bundle that will not open in Expo Go costs more than the ~150 lines of `Gesture.Pan()` it replaces. The rows are fixed-height by design, so the maths is one `round(y / stride)`. Chevrons ship alongside the drag because a screen reader cannot drag.

### Outbox encryption behind a flag

Applies when the outbox is built. SQLCipher is not supported in Expo Go. The outbox is PII-free by construction (PRD §6.4), so plaintext during development is acceptable; PRAGMA key is applied only when a key is configured, making encryption a config change on a dev build later.

### FLAG_SECURE / screenshot blocking deferred

Same reason. Wired as a no-op hook now, enabled with the dev build.

### Tests included

PRD §10 calls idempotency-key handling, PII eviction when the delivery attempt ends, optimistic rollback, refresh single-flight, and degraded-route rendering non-negotiable. jest-expo + React Native Testing Library, run locally. CI is deployment work and stays out.

One rule earned the hard way: **no `as QueueResponse` casts in test fixtures.** Six suites used to hand-roll queue payloads with a cast to paper over the fields they did not care about, and those casts kept compiling after the server grew `to_return` and `totals` — failing at runtime inside `splitQueue` instead. `src/test-support/queue-fixtures.ts` builds complete, type-checked rows, so the next server change breaks one file.

## Stack (Expo SDK 57 exact)

Already present: expo@~57.0.12, expo-router@~57.0.12, react-native@0.86.2, react@19.2.3, TypeScript 6, typed routes + React Compiler enabled in app.json.

To add via npx expo install: expo-secure-store, expo-location, expo-localization, expo-keep-awake, expo-clipboard.
Deferred with the outbox: expo-sqlite, expo-network, expo-crypto.
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

### Feature 3 — Session ✅ done

Shipped:

src/auth/session-provider.tsx — the session derived from the secure store, never from React state that outlives it. Three states: restoring (one Keychain read, covered by the native splash), signed-out (carrying *why*, when it was taken away), and signed-in (with the /v1/auth/me profile, or null when the app launched offline — a driver in a parking garage is not sent back to a login screen).

Expo Router Stack.Protected guards in src/app/\_layout.tsx. No router.replace in a useEffect anywhere: the guard flipping *is* the navigation, so there is no window in which a signed-out device renders a patient address.

src/app/(auth)/sign-in.tsx and src/app/(auth)/register.tsx — two routes, not two states of one screen. The segmented control navigates between them, so a driver arriving with a printed code can land on /register directly. Invite code is uppercase monospace, grouped 4+4, with a paste path that strips spaces, dashes, and newlines (expo-clipboard). Password minimum 12, surfaced before the round-trip. Registration signs the driver straight in with the credentials already in hand, falling back to the sign-in screen if that second call fails — the account exists either way.

src/app/(app)/ready.tsx, on-the-way.tsx, done.tsx — a page per state, behind a real tab navigator whose bar is the Feature 1 glass component driven by navigation state. Ready = in_pharmacy, On the way = picked_up, Done = closed (completed, returned, and cancelled alike).

src/locale/ — strings.ts (FR/EN, French as the shape of record so a missing English key is a build error), locale-provider.tsx, and error-message.ts, which maps server *codes* to wording. Nothing branches on server prose, which is English-only and changes without notice.

src/queue/query-client.ts and use-queue.ts — pulled forward from Feature 4 because the three pages needed data and the deactivation path needed a cache to purge. gcTime: 0 is a privacy rule, not tuning: an unmounted query keeps nothing (§6.3). One request feeds all three pages and the tab badges, so the count and the list cannot disagree.

src/auth/token-store.web.ts — memory-only. expo-secure-store has no web implementation, and localStorage is not a substitute for a hardware-backed keychain, so the browser build holds the credential in a module variable and a reload signs out. Web is a design-review and verification surface here, not a shipping target.

Two defects found and fixed during verification, both invisible to the tests that existed at the time:

PII bleeding between tabs. Every tab scene is transparent so the shared mesh shows through — which means an inactive scene is not hidden *behind* the active one, it shows *through* it. Opening Done rendered the Ready list's patient names and addresses ghosting behind the closed cards. detachInactiveScreens is the platform answer and does nothing on web, so QueueScreen now refuses to draw unless it is the focused tab. Caught by looking at a screenshot, not by a test; there is now a test.

`/` matched no route at all. Harmless on native, a hard 404 on web. src/app/index.tsx now redirects by session state, naming each target only while its guard is open so it cannot bounce.

Verification — passed: npx tsc --noEmit clean · npm test 97/97 green, up from 67 (30 new: 7 session lifecycle, 6 queue split, 13 error mapping and both-languages-complete, 4 queue page frame) · npx expo export --platform android bundles with no errors · npm run verify:api 8/8 against the running server, now covering both remaining gate items — backdating the access token and confirming the refresh token rotates silently, and deactivating the driver through the admin API and confirming the wipe (reactivation runs in `finally`, so a failed assertion cannot leave the seeded driver locked out) · the app driven end to end in a real browser against the real server, 18/18 checks and zero page errors: sign-in in French, the localized INVALID_CREDENTIALS message, /register as its own route, the pharmacy name from /v1/auth/me, all three pages, tab badges matching the server payload exactly (2/1/2), and no patient address anywhere on Done.

Today's queue was empty because the seed dates orders to whenever it last ran, so five orders were created for today through the admin API and walked into all three states with the driver's own endpoints — the workflow this plan already describes, not a database edit.

### Feature 4 — Queue read path

src/queue/use-queue.ts landed in Feature 3 (TanStack Query, gcTime: 0, no persistence, pull-to-refresh).

#### Shipped — the foreground poll, and shift awareness on top of it

docs/Plans/domain_workflow.md describes two moments where the pharmacy pushes work at a driver who is not looking at their phone: the morning assignment ("le livreur reçoit une notification") and orders added mid-shift, after which "le livreur doit repasser par la pharmacie à sa discrétion". With no push channel on the server, the poll is the entire discovery mechanism, so it ships with the part that makes a changed payload legible.

src/queue/use-queue.ts — refetchInterval at 30s, well inside the server's 100 req/min per-user budget.

src/queue/app-state-focus.ts — React Query's focus signal is written against a browser tab and never fires on a phone by itself. Wiring focusManager to AppState once, above every screen, is what makes two specified behaviours true: the queue refreshes when the driver comes back from the dialer or a navigation app (§7), and refetchIntervalInBackground's default of false actually suspends the poll on a pocketed phone (§10, "nothing in the background"). Both fail silently if it is ever unwired, which is why it has its own test.

src/queue/shift-alerts.ts — the pure reducer folding each payload into two facts. The first payload of the app's life, and the first of a new day, only establish a baseline: alerting there would fire on every cold start, which teaches a driver to ignore the banner and is therefore the same as staying silent. Closed orders count as seen. Pending is rebuilt from the payload rather than accumulated, so a package taken in charge drops out on its own, and an unchanged poll returns the identical state object so 120 renders an hour of blurred glass never happen.

src/queue/shift-alerts-provider.tsx — one diff engine above the tab group. Ready and On the way are separate trees that must say different things about the same arrival, and a diff per screen would keep two baselines that drift apart the moment a tab is detached.

src/components/driver/shift-alert-banner.tsx — the two readings. On Ready, how many packages appeared at the counter. On On the way, and only when the driver already has packages in the van, that a trip back is now on the table. It states the fact and never nags; the driver decides when. Dismissible, and it returns if more arrive. **Counts only — no patient name goes in a banner**, which can sit on screen while the phone is on a dashboard mount (§8.1).

QueueScreen gained a `banner` slot so a page composes its own notice below the shared error and degraded ones.

Verification — passed: npx tsc --noEmit clean · npm test 127/127 green, up from 97 (30 new: 12 reducer, 5 focus wiring, 5 provider, 7 banner, 1 frame) · npx expo export bundles clean on android and web · npm run verify:api 9/9 against the running server, now including a live gate that creates an order through the admin API mid-session the way a pharmacist would at 2pm and asserts the driver is told about exactly that order, that a quiet poll keeps saying it, that dismissing clears it for good, and that cancelling removes it — the order is cancelled in a `finally` so a failed assertion cannot leave a phantom delivery behind.

That live gate found the one defect this feature had: it first failed on CLIENT_INACTIVE, because the seed leaves deactivated clients in `/v1/clients/` and the test took the first row. Worth recording as a property of the seeded data rather than of the test.

The live suites now run with maxWorkers: 1. Two of them in parallel put roughly the server's whole per-IP budget through it in a minute, and the gate then fails on RATE_LIMITED rather than on anything it set out to prove.

#### Remaining in Feature 4

The three pages are wired to real data as of Feature 3, one route each. Still to do: the stop sheet, and i18n moving from src/locale to i18next + expo-localization with the initial locale seeded from /v1/auth/me organization.locale and the driver's override persisted on-device.

Stop sheet wired: call patient (phone_number) and pharmacy (pharmacy.phone) via Linking.openURL('tel:'). Both disappear on terminal orders because the server stops sending the numbers.

src/i18n/ — i18next + expo-localization replacing src/locale/'s plain dictionary. Every call site already reads through useStrings(), so the swap lands in the provider and nowhere else. Strings are already externalized and both languages are asserted complete by a test.

src/lib/delivery-windows.ts — AM 09:00–12:00 / PM 13:00–17:00, mirroring the dashboard's file. The server does not expose the org's real window times (/v1/auth/me gives only id/name/phone/timezone/locale), so this is one constant, not literals scattered through the UI.

Verification gate: seeded orders appear in the right tabs with correct counts; PII evicted from the cache on terminal transition (test asserts the cache entry has no address key); FR and EN both render.

### Feature 4.5 — Contract re-alignment ✅ done

Prompted by the server change described in Context. The whole feature is what `npm run typecheck` reported after re-syncing openapi.json.

src/api/types.ts — the load-bearing change. `ActiveStop` is now `Extract<Stop, { patient_name: string }>` — defined by the PII it carries rather than by a hand-written status union, so the app's privacy boundary and the server's `PII_VISIBLE_STATUSES` cannot drift. `ClosedStop` comes from the `closed` bucket, because `stops`, `to_return`, `closed`, and every mutation response share one schema and only the bucket says what a row means.

`ReturnStop` and `TerminalStop` needed a helper, not `Extract`. `ClosedStop` is a *single* object type whose `status` is a four-way union, so `Extract<ClosedStop, { status: 'returned' }>` distributes over nothing and evaluates to `never` — silently, at every use site. `AtStatus<T, S> = Omit<T, 'status'> & { status: S }` narrows it properly, and both results are still `Omit<ClosedStop, …>`, so neither has a patient key to read.

Two `Assert<Same<…>>` lines pin the runtime status literals against the generated types. A status the server adds fails the build there rather than producing a stop that belongs to no bucket and disappears from every tab.

src/api/transitions.ts — new. `available_transitions` is on the admin `orderResponse` and no driver payload, so the app mirrors `stateMachine.ts` itself. `as const satisfies Record<StopStatus, …>` makes a new status a compile error here first. The doc comment on stop-sheet.tsx claiming the array "comes from the server" was false and is corrected.

src/queue/use-queue.ts — four slices from three server buckets. `splitQueue` filters rather than asserts (`to_return.filter(isReturnStop)`), so a mis-bucketed row degrades into an omission instead of a card reading `returned_to_pharmacy_at` off something that has none. `QUEUE_MUTATION_KEY` lives here so `useQueue` can suspend its own poll while a write is in flight.

The fourth tab, À rapporter, sits between On the way and Done — visual order is workflow order. Labels drop to 11pt: four tabs leave ~73pt each on a 390pt screen and "À rapporter" is the longest in either language.

src/test-support/queue-fixtures.ts — new, cast-free, replacing six hand-rolled builders.

Verification gate: typecheck and `npm test` clean; the live gate's order-creation helper now calls `POST /v1/orders/{id}/ready`, and asserts the driver cannot see the order before it does.

### Feature 5 — The delivery verbs, online-first

src/api/client.ts — one function per verb, each through the existing `request()` with an `Idempotency-Key`. Three contract traps are encoded in the functions rather than left to call sites: `pickupOrder` sends `{}` rather than no body at all (omitting it drops `content-type`, which is a different request and a different fingerprint); `handoverOrder` sends no `body` key, because that route declares no body schema; and `completeOrder` takes a discriminated `{ kind: 'paid' | 'exception' | 'none' }`, so sending `payment` and `payment_exception` together — a 400 — is unrepresentable rather than validated.

src/queue/optimistic.ts — pure reducers over one QueueResponse, testable with no network, cache, or component. `closeStop` builds the closed row by *naming the keys that survive* rather than spreading and deleting: that is where PRD §8.1's "evict PII on transition" actually happens, and a spread with an omit list is one forgotten field away from leaving an address in the cache. `sortStops` reproduces the server's comparator (is_priority DESC, sequence_number ASC NULLS LAST, then array position) so a priority toggle reorders under the driver's thumb rather than on the next poll.

src/queue/mutations.ts — `useQueueMutation` wraps useMutation: cancel, snapshot, apply, restore-verbatim on error. Verbatim rather than a computed inverse, so the screen lands where it started whatever else was in flight. `sequence` and `optimize` answer with the whole queue, so those write the response into the cache instead of invalidating.

Two cache interactions that are invisible until they bite. `gcTime: 0` means a setQueryData on a key with no observers is collected on the next tick — the optimistic update vanishes. What saves it is that GlassTabBar calls useQueueSlices() for the whole tab group's lifetime; the corollary is that no queue mutation may be fired from anything that outlives the navigator. And the 30-second poll is suspended via `useIsMutating` while a write is in flight, or a refetch mid-window overwrites the optimistic state with server truth that predates it.

Verbs: pickup (multi-select + select-all, the label check, one POST per order via Promise.allSettled so a 409 on one card never blocks the batch), priority, complete, return, cooler prompt, per-order and batch handover.

Label check: the pickup sheet lists each order's packages[] as tappable label-code chips and sends the ticked count as confirmed_package_count. A mismatch is accepted and logged by the server, never refused — the bags on the counter are the truth — so the confirm button stays enabled at any count. Asserted against the live server.

Payment: rides on complete, in one transaction. Never /payment then /complete. The "client cannot pay" path leads with a call-the-pharmacy button and records what the driver was told (waived_by_pharmacy / deferred_to_pharmacy), because the workflow puts that decision with the pharmacy, not the driver. /payment keeps one job: the terminal that only went through after the delivery was already marked complete.

Return: reason required (a bodyless call is 400), optional note capped at 500 and admin-only. The order lands on À rapporter, not Done — the copy must not say "terminé".

Cooler prompt: three states preserved — true, false, and dismissed = never call the endpoint. Never a gate. **The one call that cannot be optimistic**: cooler-check is only valid once the order is terminal, so firing it against an optimistic completed answers 409. It waits for the transition to resolve.

Hand-back: the whole stack at once is the default action (`POST /v1/driver/returns/handover`, one transaction, all or nothing — which is what a counter looks like); the per-card button covers a partial hand-back. `pharmacy.return_deadline` is on screen and turns danger past the hour.

Notifications: an in-app feed on a pushed route, badged from `unread_notifications` on the queue payload so the count costs no extra request. Marking read is explicit, never automatic on mount.

Verification gate: `npm run typecheck`, `npm test`, and `npm run verify:api` clean. The live gate walks two real orders through every state asserting the transitions mirror in both directions, and proves idempotent replay, the key-conflict refusal, the accepted count mismatch, and the sequence endpoint nulling what it is not sent.

### Feature 6 — The route, the driver's way first

Manual sequencing is now the primary control and the optimizer is the suggestion, which is the order the workflow puts them in: "le livreur détermine manuellement l'itinéraire le plus rapide … en tenant compte de l'estimation de distance faite par l'application et des commandes prioritaires."

src/components/driver/reorder-sheet.tsx — a full-screen modal over the list it edits, not a route, so the tab group underneath stays mounted and the queue's cache observer survives. Three server behaviours shape it:

1. It edits the whole day, not the van. `POST /v1/driver/queue/sequence` clears sequence_number on any active order missing from ordered_order_ids, so the sheet lists Ready and On the way together even though it opens from On the way. Proven against the live server rather than assumed.
2. Priority beats position. The server re-sorts is_priority DESC ahead of sequence_number, so `sortStops` runs on every change and the snap-back happens under the finger instead of a second later.
3. The response is the whole queue, written straight into the cache.

Drag on gesture-handler + reanimated, uniform row height so the maths is one round(y / stride); chevrons alongside, because TalkBack cannot drag.

POST /v1/driver/queue/optimize stays as the secondary control, with a one-shot expo-location foreground fix (works in Expo Go; permission denial is not fatal — current_location is optional).

Degraded is a first-class state: the server returns the previous sequence with degraded: true rather than failing. Quiet banner, everything else keeps working. It is **not** set merely because estimates are missing — an adapter that can order but not measure has given a perfectly good route, and absent estimates say so by being absent. With the current FakeOptimizer they always are, so the app renders distances when they arrive and nothing when they do not.

"Navigate" opens the address in Google/Apple Maps via native intent; expo-keep-awake while the active route is on screen; app resumes exactly where it was after the round-trip.

Verification gate: reordering survives a refetch, and a stop left at the counter does not lose its sequence number; stop the server's optimizer and confirm the banner appears with the old order intact.

### Feature 7 — Polish

The Done tab, the À rapporter checklist with its unanswered-cooler-check badges, and the notifications feed moved into Features 4.5–6; they were not polish once `returned` stopped being terminal. What remains:

Conflict surfacing beyond the inline notice; the "N updates pending sync" indicator (deferred with the outbox — nothing to be honest about until writes can be pending); accessibility pass (VoiceOver/TalkBack labels, dynamic type on cards); FR/EN completeness sweep with four tabs; i18next migration.

Verification gate: full manual run-through of a 5-stop day in French, then English.

## Verification (end-to-end)

Start the backend from ../drugstore-server:

docker compose up -d # postgres :5433, redis :6379
npm run migrate && npm run seed
npm run dev # :3000

Seeded driver accounts (password DevPassword123!): driver@stlaurent.example.ca (FR org) and driver@riverside.example.ca (EN org). Two organizations exist deliberately — cross-org isolation shows up as visible data, not an empty list. Orders are created/assigned from the admin dashboard at ../drugstore-admin-dashboard (npm run dev, :3001).

App: EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000 npx expo start, then Expo Go. Per-feature gates above; `npm run typecheck`, `npm test`, and `npm run verify:api` must be clean at every gate.

Note the two-step order creation. `POST /v1/orders` produces a `scheduled` order that **no driver can see**; staff have to call `POST /v1/orders/{id}/ready` before it reaches the queue. An order that never appears in the app is almost always this, not a bug in the app — and a driver hitting that id directly gets 404, not a "not ready" message, because the repository excludes the row before the state machine is reached.

A full day, end to end:

1. Admin creates an order → it does **not** appear for the driver. Admin marks it ready → it appears in **À livrer** and the bell count increments.
2. Batch-select two, tick the labels, take in charge → both move to **En route**; the POS banner reflects amount_due_total.
3. Complete one with a cash payment; complete another through "Le client ne peut pas payer" → waived_by_pharmacy. Both land in **Terminé**.
4. Return a third with customer_absent and a note → it lands in **À rapporter**, not Terminé, showing its label codes and no patient data.
5. Hand it back → **Terminé**, returned_to_pharmacy.
6. Reorder the route; confirm the new sequence survives a refetch and that a stop left at the counter did not lose its sequence number.
7. Kill the network mid-write: the error is inline, the optimistic state rolls back, and re-tapping succeeds with no duplicate on the server.

## Server gaps to raise

> Specified in full, with workflow citations, API shapes, and acceptance criteria, in **docs/Plans/SERVER_CHANGES_PRD.md** — the document to hand to whoever owns ../drugstore-server. What follows is the app-side summary; the two must be kept in step.

Re-audited against the running server and the live schema on 2026-08-23, not against the spec alone — several of these are cases where `openapi.json` and the implementation disagree.

### Blocking a planned feature

**Deactivation is not immediate on the driver endpoints.** Found while verifying Feature 3, against the running server. Deactivating a driver revokes every refresh token, and /v1/auth/me and /v1/auth/refresh both re-check is_active and answer ACCOUNT_DISABLED — but the driver endpoints only verify the JWT, so an already-issued access token keeps returning patient addresses until it expires, up to 15 minutes. PRD §4.5 says "the next API call returns 401"; that holds for /v1/auth/me, not for /v1/driver/queue. The app cannot close this — the token verifies correctly — so it needs an is_active re-check in the server's auth preHandler, or a revocation list. Pinned by a live test that fails if the server ever closes it.

**`degraded` is never sent by `GET /v1/driver/queue`.** Still open. The spec declares `degraded` on the GET response, but only `optimizeQueue` ever sets it. So the "route not optimized" banner can only be shown in the seconds after an optimize call, and vanishes on the next poll or pull-to-refresh. Either persist the degraded state for the day and return it from the GET, or drop it from the GET schema so the client stops expecting it.

**No push channel.** Partly addressed: the server now has a notifications feed (`GET /v1/driver/notifications`) and the app renders it with a badge on the queue payload's `unread_notifications`. But it is still *pull*. domain_workflow.md states plainly that the driver *receives a notification*, and that orders added mid-shift must reach a driver who is already out — and a 30-second foreground poll does nothing while the phone is in a navigation app, the exact case the workflow calls out. Closing it needs Expo push tokens and a send path server-side; on the client it also needs a dev build, since Expo Go has not accepted remote push since SDK 53.

**No stop coordinates.** Blocks the map view and card distance/bearing outright. The workflow raises the severity: it has the driver planning the route by hand "en tenant compte de l'estimation de distance faite par l'application", so the aid that manual ordering is supposed to be weighed against does not exist. Confirmed against the live table: `orders` has `address` but no `latitude`/`longitude`. Needs coordinates on orders, geocoded server-side at creation, exposed in the driver queue payload.

**Route optimization is a stub, and the app's location fix is discarded.** `FakeOptimizer` sorts stops by `address.localeCompare` — deterministic and visibly reordered, but not a route. No Mapbox adapter exists: `ROUTE_OPTIMIZER=mapbox` passes env validation, logs a warning, and falls back to the fake. And `RouteStop` carries only `{orderId, address}`, so the `current_location` the app is specified to send in Feature 6 is accepted by the endpoint and then ignored. Feature 6 can still be built against the contract, but its gate can only prove *that* the sequence changes, never that it improved.

**The pharmacy address is not exposed.** Still open, and now more visible. `organizations.address` exists in the schema; the driver queue's `pharmacy` object is `{name, phone, return_deadline}`. The À rapporter tab shows a deadline for a trip it cannot hand a navigation intent for. Add `address` to the queue's pharmacy object.

**Org delivery-window times are not exposed.** Confirmed to exist as four real columns — `am_window_start` 09:00, `am_window_end` 12:00, `pm_window_start` 13:00, `pm_window_end` 17:00 — and returned by no endpoint. Both clients hardcode them; a pharmacy that changes its windows silently gets wrong labels in both.

### Worth having, not blocking

**No driver-scoped read of a single order.** Every route under `/v1/orders` is gated `requireRole("admin")`, so a driver has no `GET /v1/driver/orders/{id}`. Conflict reconciliation and any deep link to one stop must refetch the whole day's queue to see one order — which is also why a notification row pointing at an order outside today's payload can only show a plain notice.

**No batch pickup endpoint** — 15 packages is 15 POSTs on the worst network in the building. Mitigated, not closed: the app fires them with `Promise.allSettled` so one failure never blocks the rest.

**Per-stop ETA and a driver day-summary**, as listed in PRD §9.3. `estimates` now exists on the queue response but the current FakeOptimizer never populates it.

### Closed since this list was written

`POST /v1/driver/queue/sequence` (manual reordering), `updated_since` on the driver queue, a required `reason` on return, the `returned → returned_to_pharmacy` handover leg with both a per-order and a batch endpoint, per-order priority, package label codes, and `requested_delivery_time`. The server-side specification for these lives in SERVER_CHANGES_PRD.md; the delivered shapes are in ../drugstore-server/docs/api-contracts.md.

**Trivial:** `POST /v1/invites/` rejects a body-less request with `VALIDATION_FAILED` ("Expected object, received null") even though every field in its schema is optional. `{}` works. Papercut, not a defect.

## Out of scope (MVP)

Admin screens, digital payments, signature/photo PoD, multi-pharmacy, background location, push/WebSocket, in-app chat, patient SMS — plus all deployment work: EAS Build/Submit, store metadata, OTA updates, Sentry.
