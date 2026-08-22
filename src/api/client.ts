/**
 * The one path from this app to `/v1`.
 *
 * Everything authenticated goes through `request`, which is what makes the
 * single-flight refresh in `refresh.ts` an actual guarantee rather than a
 * convention — a screen that called `fetch` directly would bypass the mutex
 * and could revoke the driver's token family (PRD §4.4).
 */
import { ApiError } from './errors';
import { API_BASE_URL, httpFetch, type ApiResponse, type HttpRequest } from './http';
import {
  endSession,
  getValidAccessToken,
  refreshAfterUnauthorized,
} from './refresh';
import type {
  LoginBody,
  LoginResponse,
  MeResponse,
  QueueResponse,
  RegisterDriverBody,
  RegisterDriverResponse,
} from './types';
import {
  clearSession,
  loadSession,
  saveSession,
  sessionFromTokenPair,
} from '@/auth/token-store';

export { API_BASE_URL };
export type { ApiResponse } from './http';

/** An authenticated request: the token is this module's business, not yours. */
export type ApiRequest = Omit<HttpRequest, 'token'>;

/**
 * Authenticated call with the full response envelope.
 *
 * Use when the caller needs `requestId` for an error message or
 * `idempotentReplay` to tell a replayed write from a fresh one (Feature 5).
 */
export async function requestWithMeta<T>(
  path: string,
  request: ApiRequest = {},
): Promise<ApiResponse<T>> {
  const token = await getValidAccessToken();

  try {
    return await httpFetch<T>(path, { ...request, token });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    if (error.isTokenExpired) {
      // Our expiry check said the token was fine and the server disagreed — a
      // fast device clock, or a revocation landing between the two. Rotate
      // once and replay. Exactly once: a second 401 after a fresh token is a
      // real rejection, and looping on it would hammer the server.
      const refreshed = await refreshAfterUnauthorized(token);
      try {
        // Same body, same Idempotency-Key. The server fingerprints method +
        // URL + body, so this either replays the stored response or runs for
        // the first time — never double-writes.
        return await httpFetch<T>(path, { ...request, token: refreshed });
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.isTerminalAuthFailure) {
          await endSession(retryError);
        }
        throw retryError;
      }
    }

    if (error.isTerminalAuthFailure) {
      // Deactivated driver, or a revoked family. Wipe and go to sign-in; there
      // is no offline grace period for a revoked driver (PRD §4.5).
      await endSession(error);
    }

    throw error;
  }
}

/** Authenticated call, unwrapped to the payload. The common case. */
export async function request<T>(
  path: string,
  init: ApiRequest = {},
): Promise<T> {
  return (await requestWithMeta<T>(path, init)).data;
}

/* -------------------------------------------------------------------------- */
/* Unauthenticated endpoints                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Signs in and persists the token pair.
 *
 * Persisting here rather than at the call site is deliberate: the secure store
 * is the only sanctioned home for a token (§4.3), and a screen that forgot to
 * write it would appear to work until the app was backgrounded.
 */
export async function login(credentials: LoginBody): Promise<LoginResponse> {
  const { data } = await httpFetch<LoginResponse>('/v1/auth/login', {
    method: 'POST',
    body: credentials,
  });
  await saveSession(sessionFromTokenPair(data));
  return data;
}

/**
 * Redeems an invite code. Returns no tokens — the server creates the account
 * and the driver then signs in normally.
 */
export async function registerDriver(
  body: RegisterDriverBody,
): Promise<RegisterDriverResponse> {
  const { data } = await httpFetch<RegisterDriverResponse>(
    '/v1/auth/register/driver',
    { method: 'POST', body },
  );
  return data;
}

/**
 * Ends the session server-side, then locally.
 *
 * The local wipe is unconditional. A driver tapping sign-out on a dead network
 * must still end up signed out on this device; the refresh token they leave
 * behind on the server expires on its own.
 */
export async function logout(): Promise<void> {
  const session = await loadSession();
  try {
    if (session) {
      await httpFetch<void>('/v1/auth/logout', {
        method: 'POST',
        token: session.accessToken,
        body: { refresh_token: session.refreshToken },
      });
    }
  } catch {
    // Deliberately swallowed — see above.
  } finally {
    await clearSession();
  }
}

/* -------------------------------------------------------------------------- */
/* Authenticated endpoints                                                    */
/* -------------------------------------------------------------------------- */

/** Current driver and organization. `organization.locale` seeds i18n. */
export function getMe(): Promise<MeResponse> {
  return request<MeResponse>('/v1/auth/me');
}

/**
 * The day's run, already in route order.
 *
 * `date` is optional; the server defaults to today in the organization's
 * timezone, which is the right answer and not one this app can compute.
 */
export function getQueue(date?: string): Promise<QueueResponse> {
  return request<QueueResponse>('/v1/driver/queue', { query: { date } });
}
