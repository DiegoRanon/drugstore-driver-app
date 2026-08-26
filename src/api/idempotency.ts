/**
 * Keys for the `Idempotency-Key` header on every driver write.
 *
 * The server fingerprints method + URL + body against the key and either
 * replays the stored response or runs for the first time, so a retry after a
 * dropped connection can never double-write (`api-contracts.md`, §Changed
 * payloads). Reservations live 24 hours and are namespaced per user.
 *
 * **Not `expo-crypto`, deliberately.** This is a collision-avoidance token
 * scoped to one device inside that 24-hour window, not a security primitive:
 * guessing one buys nothing, because the server also matches the body and the
 * caller's user id. Expo's winter runtime installs no `crypto.randomUUID`, so
 * the alternative is a native dependency for a string that never leaves the
 * tuple (driver, order, verb, second).
 *
 * Protection against a double tap is the UI's job — `PrimaryAction` disables
 * itself on `loading` — not this function's. A deliberate second attempt after
 * a failure *should* get a fresh key: the first one may have a 4xx cached
 * against it.
 *
 * If the offline outbox from PRD §6 is ever built, keys have to survive app
 * death so a retry lands as a replay rather than a duplicate. This function is
 * the seam where that changes; nothing else needs to know.
 */

/** The server rejects anything longer with `VALIDATION_FAILED`. */
const MAX_LENGTH = 255;

let counter = 0;

/**
 * @param scope A short verb-ish tag (`pickup`, `complete`) that makes a key
 *   legible in a server log without having to correlate it to anything.
 */
export function newIdempotencyKey(scope: string): string {
  const time = Date.now().toString(36);
  const seq = (counter++).toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${scope}-${time}-${seq}-${random}`.slice(0, MAX_LENGTH);
}
