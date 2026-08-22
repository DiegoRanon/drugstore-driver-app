/**
 * Raw transport. Knows how to speak to `/v1`; knows nothing about sessions.
 *
 * This exists as its own module purely to break an import cycle: `client.ts`
 * owns auth and therefore needs `refresh.ts`, while `refresh.ts` has to make
 * one HTTP call of its own (`POST /v1/auth/refresh`) that must *not* go
 * through the auth-owning path — refreshing in order to refresh does not
 * terminate. Both import this instead of each other.
 *
 * Nothing here reads or writes a token. Callers pass one explicitly.
 */
import { DEFAULT_BASE_URL } from './base-url';
import { ApiError, ApiUnreachableError } from './errors';

/**
 * Where `/v1` lives.
 *
 * `EXPO_PUBLIC_API_URL` is inlined at build time by Expo and is what you set
 * for a real device (`EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000 npx expo start`)
 * — a phone on the pharmacy wifi cannot reach the laptop on `localhost`.
 *
 * Without it, `base-url.ts` supplies the per-platform development default.
 */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_BASE_URL;

export type QueryValue = string | number | boolean | null | undefined;

export type HttpRequest = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Bearer token. Omitted for login, register, and refresh. */
  token?: string | null;
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Replay protection for the mutating driver endpoints. */
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type ApiResponse<T> = {
  data: T;
  status: number;
  /** From `x-request-id`. The handle support uses against server logs (§8.3). */
  requestId: string | null;
  /** The server replayed a stored response for our `Idempotency-Key`. */
  idempotentReplay: boolean;
};

/**
 * Built by hand rather than with `new URL()`.
 *
 * React Native's `URL` / `URLSearchParams` polyfill is incomplete and differs
 * between engines; string concatenation with explicit encoding behaves the
 * same on every platform, and the paths here are all literals we control.
 */
export function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, QueryValue>,
): string {
  let base = baseUrl;
  while (base.endsWith('/')) base = base.slice(0, -1);
  const suffix = path.startsWith('/') ? path : `/${path}`;

  const pairs: string[] = [];
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }

  return pairs.length > 0
    ? `${base}${suffix}?${pairs.join('&')}`
    : `${base}${suffix}`;
}

/**
 * The server's `Idempotency-Key` ceiling. Longer keys are rejected with
 * `VALIDATION_FAILED`, so catch it here rather than spending a round-trip.
 */
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

export async function httpFetch<T>(
  path: string,
  request: HttpRequest = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', token, query, body, idempotencyKey, signal } = request;

  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotencyKey) {
    if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new Error(
        `Idempotency-Key must be ${MAX_IDEMPOTENCY_KEY_LENGTH} characters or fewer`,
      );
    }
    headers['idempotency-key'] = idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(API_BASE_URL, path, query), {
      method,
      headers,
      // The server fingerprints method + URL + body against the stored
      // Idempotency-Key, so a retry has to serialize identically. It hashes a
      // key-sorted form, so field order is not load-bearing — but the values
      // are, and a retry must resend the body it first sent, not a rebuilt one.
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    // Offline, DNS failure, connection refused — the request never landed, so
    // it is safe to replay. Distinct from an error the server chose to return.
    throw new ApiUnreachableError(cause);
  }

  if (!response.ok) throw await ApiError.fromResponse(response);

  const requestId = response.headers.get('x-request-id');
  const idempotentReplay = response.headers.get('idempotent-replay') === 'true';

  // 204 on logout.
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return { data: undefined as T, status: response.status, requestId, idempotentReplay };
  }

  return {
    data: (await response.json()) as T,
    status: response.status,
    requestId,
    idempotentReplay,
  };
}
