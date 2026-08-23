/**
 * The credential's shape and the pure arithmetic around it.
 *
 * Split out of `token-store` because that module has two platform
 * implementations and none of this differs between them.
 */
import type { TokenPair } from '@/api/types';

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  /** Absolute epoch milliseconds. `expires_in` is relative and unusable later. */
  expiresAt: number;
};

/** Converts a login/refresh response into what we persist. */
export function sessionFromTokenPair(
  tokens: TokenPair,
  now: number = Date.now(),
): StoredSession {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: now + tokens.expires_in * 1000,
  };
}

/**
 * Access tokens live 15 minutes. Refreshing 60 seconds early means a request
 * never leaves the device carrying a token that expires in flight on a slow
 * cellular link (PRD §4.4).
 */
export const REFRESH_SKEW_MS = 60_000;

export function isExpiring(
  session: StoredSession,
  now: number = Date.now(),
  skewMs: number = REFRESH_SKEW_MS,
): boolean {
  return session.expiresAt - now <= skewMs;
}

export function parseStoredSession(raw: string): StoredSession | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.accessToken !== 'string' ||
      typeof record.refreshToken !== 'string' ||
      typeof record.expiresAt !== 'number'
    ) {
      return null;
    }
    return {
      accessToken: record.accessToken,
      refreshToken: record.refreshToken,
      expiresAt: record.expiresAt,
    };
  } catch {
    // A corrupt entry is indistinguishable from no session: the driver signs
    // in again. Never throw here — this runs on the launch path.
    return null;
  }
}
