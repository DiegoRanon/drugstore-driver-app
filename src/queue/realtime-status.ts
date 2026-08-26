/**
 * Whether the live channel is up, and nothing else.
 *
 * Its own module to break an import cycle: `useQueue` reads this to pick its
 * poll interval, while `RealtimeProvider` reads `QUEUE_MUTATION_KEY` and
 * `queueQueryKey` out of `use-queue`. Both importing this instead of each other
 * keeps the graph acyclic — the same move `session-token.ts` makes out of
 * `token-store`, and `QUEUE_MUTATION_KEY` makes out of `mutations.ts`.
 */
import { createContext, useContext } from 'react';

export type RealtimeStatus = {
  /** Drives the poll interval in `useQueue`; not rendered anywhere. */
  connected: boolean;
};

/**
 * A screen mounted outside the provider polls at the ordinary interval rather
 * than crashing. The socket is an accelerator on a working queue, never a
 * correctness gate — same reasoning as `NO_ALERTS` in `shift-alerts-provider`.
 */
export const NO_REALTIME: RealtimeStatus = { connected: false };

export const RealtimeContext = createContext<RealtimeStatus>(NO_REALTIME);

export function useRealtime(): RealtimeStatus {
  return useContext(RealtimeContext);
}
