/**
 * The cache policy for everything the app reads from `/v1`.
 *
 * The defaults here are privacy rules, not tuning knobs. The queue is a list of
 * patient names, addresses, and phone numbers, and PRD §6.3 puts a hard line
 * around it: memory only, dies with the process, never persisted. So there is
 * no persister, no AsyncStorage, and `gcTime: 0` — the moment nothing is
 * rendering an order, its data is dropped rather than parked in a cache for the
 * next twenty minutes.
 */
import { QueryClient } from '@tanstack/react-query';

import { isRetriable } from '@/api/errors';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * Zero, not the five-minute default. This is the mechanism behind
         * "PII lifetime is the active delivery" (§8.1): an unmounted query
         * keeps nothing.
         */
        gcTime: 0,
        staleTime: 10_000,
        /**
         * The client already classifies failures. Retrying a 403 on someone
         * else's order, or a 401 that just wiped the session, only drains the
         * battery of a phone that is already having a bad day.
         */
        retry: (failureCount, error) => failureCount < 2 && isRetriable(error),
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}
