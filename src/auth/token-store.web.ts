/**
 * Token storage for the browser — `sessionStorage`, and nothing longer-lived.
 *
 * The native counterpart (`token-store.ts`) keeps the credential in the
 * Keychain/Keystore, which the web has no equivalent of. This file used to be
 * memory-only for exactly that reason: the browser was a design-review surface,
 * not something a driver worked from.
 *
 * The pilot changes that. Drivers run this build in a phone browser, where a
 * reload or a backgrounded tab being evicted is routine — and a memory-only
 * store turns each of those into a password prompt in a parked car, which is
 * the opposite of the low-friction product this is meant to be.
 *
 * So the credential lives in `sessionStorage`, and the trade is stated plainly:
 *
 * - **Not `localStorage`.** A 30-day refresh token that survives every tab and
 *   every restart is a 30-day key to patient addresses sitting in web storage,
 *   readable by any script that reaches this origin (PRD §4.3, §8.2).
 *   `sessionStorage` is scoped to the tab and dies when it closes.
 * - **Short-lived by configuration.** The pilot API runs
 *   `REFRESH_TOKEN_TTL_DAYS=1`, so what is stored here expires in a day rather
 *   than a month. The exposure window is the mitigation, since the storage
 *   guarantee cannot be.
 *
 * This is a pilot accommodation, not the shipping design — iOS/Android through
 * `expo-secure-store` remains the target, and this file should go back to being
 * memory-only when the browser stops being a delivery surface.
 */
import { parseStoredSession, type StoredSession } from './session-token';

export {
  isExpiring,
  REFRESH_SKEW_MS,
  sessionFromTokenPair,
  type StoredSession,
} from './session-token';

/** Same key as the native store, for one obvious place to look. */
const SESSION_KEY = 'driver.session.v1';

/**
 * In-memory mirror, same contract as the native store: `undefined` means "not
 * read yet", `null` means "read, and there is none". Every API call needs the
 * access token, and this keeps that off a synchronous storage read.
 */
let cached: StoredSession | null | undefined;

/**
 * `sessionStorage` is not always reachable: it is absent during the Node export
 * pass, and Safari in private mode throws on access rather than returning null.
 * Neither is worth crashing the launch path over — a driver who cannot persist
 * signs in again, which is the old behaviour.
 */
function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Refresh rotates the pair, and presenting an already-rotated refresh token
 * revokes the whole family (server PRD §4.2) — so the pair is written as one
 * value under one key and can never half-update.
 */
export async function saveSession(session: StoredSession): Promise<void> {
  cached = session;
  try {
    storage()?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Quota or a hardened privacy mode. The in-memory cache still carries the
    // session for this page view; only surviving a reload is lost.
  }
}

export async function loadSession(): Promise<StoredSession | null> {
  if (cached !== undefined) return cached;

  let raw: string | null = null;
  try {
    raw = storage()?.getItem(SESSION_KEY) ?? null;
  } catch {
    raw = null;
  }

  cached = raw === null ? null : parseStoredSession(raw);
  return cached;
}

/** Sign-out, a revoked token family, and deactivation (§4.5). */
export async function clearSession(): Promise<void> {
  cached = null;
  try {
    storage()?.removeItem(SESSION_KEY);
  } catch {
    // Nothing to do: the cache is already cleared, and a store we cannot
    // remove from is a store we could not write to either.
  }
}

/** Drops the in-memory mirror without touching storage. Tests only. */
export function resetSessionCache(): void {
  cached = undefined;
}
