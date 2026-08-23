/**
 * Where the driver's credentials live: `expo-secure-store`, and nowhere else.
 *
 * A 30-day refresh token is a 30-day credential to patient addresses, on a
 * device that rides in a delivery car all day. Hardware-backed storage (iOS
 * Keychain / Android Keystore) is the control that matters, so no token may
 * ever reach AsyncStorage, a persisted cache, a navigation param, or a log
 * line (PRD §4.3, §8.2).
 *
 * `token-store.web.ts` is the counterpart for the browser, where no such
 * storage exists.
 */
import * as SecureStore from 'expo-secure-store';

import { parseStoredSession, type StoredSession } from './session-token';

export {
  isExpiring,
  REFRESH_SKEW_MS,
  sessionFromTokenPair,
  type StoredSession,
} from './session-token';

const SESSION_KEY = 'driver.session.v1';

/**
 * Strictest accessibility that still works for this app.
 *
 * `THIS_DEVICE_ONLY` keeps the entry out of iCloud Keychain and out of an
 * encrypted backup restored onto a different phone — §8.2's "no
 * backup-eligible file", applied to the credential itself. `WHEN_UNLOCKED` is
 * affordable because the MVP has no background work: the outbox drains on
 * foreground (Feature 5), so nothing needs to read a token while the phone is
 * locked in a driver's pocket.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'drugstore-driver',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * In-memory mirror of what is on disk.
 *
 * Every API call needs the access token, and every SecureStore read is a
 * native round-trip; doing that per request would put the Keychain on the hot
 * path of a list refresh. The cache is written only through the functions
 * below, so it cannot drift from the stored value.
 *
 * `undefined` means "not read yet"; `null` means "read, and there is none".
 */
let cached: StoredSession | null | undefined;

/**
 * Refresh rotates the token pair, and presenting an already-rotated refresh
 * token revokes the entire family (server PRD §4.2). So the pair is stored as
 * one value under one key: a crash between two separate writes would leave a
 * new access token beside a dead refresh token and lock the driver out for
 * good. One key means the swap either happens or it does not.
 */
export async function saveSession(session: StoredSession): Promise<void> {
  cached = session;
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), OPTIONS);
}

export async function loadSession(): Promise<StoredSession | null> {
  if (cached !== undefined) return cached;
  const raw = await SecureStore.getItemAsync(SESSION_KEY, OPTIONS);
  cached = raw === null ? null : parseStoredSession(raw);
  return cached;
}

/**
 * Wipe on sign-out, on a revoked token family, and on deactivation (§4.5).
 * The caller purges the query cache; this only owns the credential.
 */
export async function clearSession(): Promise<void> {
  cached = null;
  await SecureStore.deleteItemAsync(SESSION_KEY, OPTIONS);
}

/**
 * Drops the in-memory mirror without touching disk. Tests only — production
 * code has no reason to force a re-read.
 */
export function resetSessionCache(): void {
  cached = undefined;
}
