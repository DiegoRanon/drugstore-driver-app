/**
 * Sitting out the login limiter, so the live gate reports features not throttles.
 *
 * `/v1/auth/login` carries its own budget — ten per window, far tighter than the
 * 100 req/min per-IP limit — and the gate is now two suites that each sign in as
 * both the driver and the admin several times over. Together they sit close
 * enough to that ceiling that two runs in quick succession, or one run in an
 * unlucky order, fail on `RATE_LIMITED` at a login that has nothing to do with
 * what the test set out to prove.
 *
 * The server already says how long to wait. This waits.
 *
 * Test-support only: nothing in the app retries a throttle behind a driver's
 * back, because a driver staring at a spinner needs to be told (PRD §5.1).
 */
import { ApiError, retryAfterSeconds } from '@/api/errors';

const FALLBACK_WAIT_SECONDS = 60;

export const waitSeconds = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

/** Runs `attempt`, and on a throttle waits the server's own `retry-after` out once. */
export async function withLoginBudget<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'RATE_LIMITED') throw error;

    await waitSeconds((retryAfterSeconds(error) ?? FALLBACK_WAIT_SECONDS) + 1);
    return attempt();
  }
}

/**
 * The same courtesy for the raw `fetch` calls that stand in for the admin
 * dashboard, which never go through the app's client and so never raise an
 * `ApiError` to inspect.
 */
export async function fetchWithLoginBudget(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const first = await fetch(input, init);
  if (first.status !== 429) return first;

  const retryAfter = Number(first.headers.get('retry-after'));
  await waitSeconds((Number.isFinite(retryAfter) ? retryAfter : FALLBACK_WAIT_SECONDS) + 1);
  return fetch(input, init);
}
