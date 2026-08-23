/**
 * Token storage for the browser — deliberately memory-only.
 *
 * `expo-secure-store` is a native module with no web implementation; calling it
 * here throws. The tempting substitute is `localStorage`, and that is exactly
 * what must not happen: a 30-day refresh token in web storage is readable by
 * any script on the origin and survives the tab, which is the opposite of the
 * hardware-backed guarantee PRD §4.3 asks for.
 *
 * So the web build holds the credential in a module variable and nothing else.
 * The practical effect is that a reload signs the driver out — correct, because
 * the browser is a development and design-review surface here, not a shipping
 * target (the product ships to iOS 16+ and Android 10+ via Expo Go and, later,
 * a dev build). This file exists so that surface *runs*, not so the app can be
 * deployed to it.
 */
import type { StoredSession } from './session-token';

export {
  isExpiring,
  REFRESH_SKEW_MS,
  sessionFromTokenPair,
  type StoredSession,
} from './session-token';

/** Never written anywhere. Dies with the tab, by design. */
let session: StoredSession | null = null;

export async function saveSession(next: StoredSession): Promise<void> {
  session = next;
}

export async function loadSession(): Promise<StoredSession | null> {
  return session;
}

export async function clearSession(): Promise<void> {
  session = null;
}

export function resetSessionCache(): void {
  session = null;
}
