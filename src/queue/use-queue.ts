/**
 * The day's run, read once and shared by all four pages.
 *
 * Ready, On the way, À rapporter, and Done are four views of one payload, not
 * four requests: every page and the tab bar call `useQueue()`, and TanStack
 * Query de-duplicates them onto a single `GET /v1/driver/queue`. That is also
 * what keeps the tab counts and the list a driver is looking at from
 * disagreeing.
 */
import { useIsMutating, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getQueue } from '@/api/client';
import { useRealtime } from '@/queue/realtime-status';
import {
  isActiveStop,
  isReturnStop,
  isTerminalStop,
  type ActiveStop,
  type Pharmacy,
  type QueueResponse,
  type QueueTotals,
  type ReturnStop,
  type TerminalStop,
} from '@/api/types';

/** `date` is part of the key so switching days does not show yesterday's run. */
export function queueQueryKey(date?: string): readonly unknown[] {
  return ['driver', 'queue', date ?? 'today'];
}

/**
 * Shared by every write against the queue.
 *
 * Declared here rather than in `mutations.ts` because `useQueue` reads it to
 * suspend its own poll, and the import would otherwise run the other way and
 * cycle.
 */
export const QUEUE_MUTATION_KEY = ['driver', 'queue', 'write'] as const;

/**
 * The foreground poll (PRD §5.1).
 *
 * The pharmacy adds orders during a shift and expects the driver to find out
 * without thinking about it (`domain_workflow.md`, §En route). This used to be
 * the whole discovery mechanism; since the server grew the Socket.IO layer it
 * is the fallback PRD §7 requires of clients — "clients must fall back to
 * polling if the socket drops" — which is a demotion, not a removal. A frame
 * can be missed; a poll cannot.
 *
 * Thirty seconds against the server's 100 req/min per-user budget leaves room
 * for the entire delivery flow on top. It only runs while the app is
 * foregrounded — `refetchIntervalInBackground` defaults to false, and
 * `subscribeAppStateFocus` is what makes "foregrounded" mean anything on a
 * phone.
 */
export const QUEUE_POLL_INTERVAL_MS = 30_000;

/**
 * The same poll while the socket is up, where it is a safety net rather than
 * the discovery path: two minutes catches a dropped frame without spending
 * four times the requests on a driver whose changes already arrive live.
 */
export const QUEUE_POLL_CONNECTED_INTERVAL_MS = 120_000;

export function useQueue(date?: string): UseQueryResult<QueueResponse, Error> {
  /*
    A poll that fires between an optimistic write and its response overwrites
    the optimistic cache with server state that predates the write — a stop
    visibly jumping back to the tab it just left, then forward again a second
    later. `cancelQueries` in `onMutate` handles a poll already in flight; this
    handles the one that would start during the window.
  */
  const writing = useIsMutating({ mutationKey: QUEUE_MUTATION_KEY });

  // Falls back to `false` outside a RealtimeProvider, which is the safe answer:
  // no socket assumed, ordinary interval.
  const { connected } = useRealtime();

  return useQuery({
    queryKey: queueQueryKey(date),
    queryFn: () => getQueue(date),
    refetchInterval:
      writing > 0
        ? false
        : connected
          ? QUEUE_POLL_CONNECTED_INTERVAL_MS
          : QUEUE_POLL_INTERVAL_MS,
  });
}

export type QueueTab = 'ready' | 'on_the_way' | 'to_hand_back' | 'done';

export type QueueSlices = {
  /** Waiting at the counter — `in_pharmacy`. */
  ready: ActiveStop[];
  /** In the van, still to deliver — `picked_up`. */
  onTheWay: ActiveStop[];
  /** Failed, in the van, owed back to the pharmacy — `returned`. */
  toHandBack: ReturnStop[];
  /** `completed`, `returned_to_pharmacy`, and `cancelled` alike. */
  done: TerminalStop[];
  totals: QueueTotals | null;
  pharmacy: Pharmacy | null;
  counts: Record<QueueTab, number>;
};

const EMPTY: QueueSlices = {
  ready: [],
  onTheWay: [],
  toHandBack: [],
  done: [],
  totals: null,
  pharmacy: null,
  counts: { ready: 0, on_the_way: 0, to_hand_back: 0, done: 0 },
};

/**
 * Splits one queue payload into the four tabs.
 *
 * The server already buckets the day — `stops`, `to_return`, `closed` — so
 * this only has to split `stops` by status and narrow the other two. It
 * **filters, never asserts**: `to_return` and `closed` share one schema whose
 * `status` enum is the full closed set, so only the bucket says what a row
 * means. Filtering makes a mis-bucketed row an omission rather than a crash in
 * a card that reads `returned_to_pharmacy_at` off something that has none.
 *
 * Order is preserved exactly as the server sent it. `stops` arrives sorted
 * priority-first, then by `sequence_number`; the admin dashboard shows the
 * same order. Re-sorting here by anything — distance, time, name — would put
 * the driver's screen and the pharmacist's screen into disagreement (PRD §3.1).
 */
export function splitQueue(queue: QueueResponse | undefined): QueueSlices {
  if (!queue) return EMPTY;

  const ready: ActiveStop[] = [];
  const onTheWay: ActiveStop[] = [];

  for (const stop of queue.stops) {
    // The queue's `stops` array is typed as the union, so this narrowing is
    // what makes `stop.patient_name` legal below.
    if (!isActiveStop(stop)) continue;
    if (stop.status === 'in_pharmacy') ready.push(stop);
    else onTheWay.push(stop);
  }

  const toHandBack = queue.to_return.filter(isReturnStop);
  const done = queue.closed.filter(isTerminalStop);

  return {
    ready,
    onTheWay,
    toHandBack,
    done,
    totals: queue.totals,
    pharmacy: queue.pharmacy,
    counts: {
      ready: ready.length,
      on_the_way: onTheWay.length,
      to_hand_back: toHandBack.length,
      done: done.length,
    },
  };
}

/** `useQueue` plus the split, for screens that need both. */
export function useQueueSlices(date?: string): {
  query: UseQueryResult<QueueResponse, Error>;
  slices: QueueSlices;
} {
  const query = useQueue(date);
  const slices = useMemo(() => splitQueue(query.data), [query.data]);
  return { query, slices };
}
