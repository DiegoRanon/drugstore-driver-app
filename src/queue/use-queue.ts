/**
 * The day's run, read once and shared by all three pages.
 *
 * Ready, On the way, and Done are three views of one payload, not three
 * requests: every page and the tab bar call `useQueue()`, and TanStack Query
 * de-duplicates them onto a single `GET /v1/driver/queue`. That is also what
 * keeps the tab counts and the list a driver is looking at from disagreeing.
 *
 * Feature 4 adds the 30-second foreground poll and the org-locale wiring. What
 * is here is the read itself.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getQueue } from '@/api/client';
import { isActiveStop, type ActiveStop, type ClosedStop, type QueueResponse } from '@/api/types';

/** `date` is part of the key so switching days does not show yesterday's run. */
export function queueQueryKey(date?: string): readonly unknown[] {
  return ['driver', 'queue', date ?? 'today'];
}

export function useQueue(date?: string): UseQueryResult<QueueResponse, Error> {
  return useQuery({
    queryKey: queueQueryKey(date),
    queryFn: () => getQueue(date),
  });
}

export type QueueSlices = {
  /** Waiting at the counter — `in_pharmacy`. */
  ready: ActiveStop[];
  /** In the van — `picked_up`. */
  onTheWay: ActiveStop[];
  /** `completed`, `returned`, and `cancelled` alike. */
  done: ClosedStop[];
  counts: { ready: number; on_the_way: number; done: number };
};

const EMPTY: QueueSlices = {
  ready: [],
  onTheWay: [],
  done: [],
  counts: { ready: 0, on_the_way: 0, done: 0 },
};

/**
 * Splits one queue payload into the three tabs.
 *
 * Order is preserved exactly as the server sent it. The server assigns
 * `sequence_number` and the admin dashboard shows the same order; re-sorting
 * here by anything — distance, time, name — would put the driver's screen and
 * the pharmacist's screen into disagreement (PRD §3.1).
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

  return {
    ready,
    onTheWay,
    done: queue.closed,
    counts: {
      ready: ready.length,
      on_the_way: onTheWay.length,
      done: queue.closed.length,
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
