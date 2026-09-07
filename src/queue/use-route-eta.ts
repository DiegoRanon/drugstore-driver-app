/**
 * When the driver gets to each remaining stop, and when they are done.
 *
 * WHAT RETRIGGERS IT
 *
 * The query key is the *ordered list of stop ids*, not the date. That single
 * choice is the whole retrigger mechanism:
 *
 *   - deliver a stop  → it leaves the list → new key → re-measured
 *   - return a stop   → same
 *   - a stop added mid-shift, or a re-optimize → same
 *   - the 30-second queue poll returning an unchanged run → *same key*, so
 *     nothing is fetched and no Routes API call is billed
 *
 * The optimistic cache is what changes the key instantly: `applyComplete`
 * removes the stop the moment the driver taps Delivered. If the mutation then
 * fails and rolls back, the key rolls back with it and the previous estimate
 * is served from cache.
 *
 * WHY IT WAITS FOR THE WRITE TO LAND
 *
 * The key changing early is not licence to fetch early. `GET
 * /v1/driver/queue/eta` measures the queue *the server* holds, not the stops
 * passed here, so a request that overtakes the completion it was triggered by
 * gets an estimate that still counts the delivered stop — and caches it under
 * the new key. Nothing invalidates it afterwards, because the id list does not
 * change a second time when the write finally lands, which is why the stale
 * finish time used to survive until a manual refresh.
 *
 * So the query stays disabled while a queue write is in flight, the same way
 * `useQueue` suspends its poll, and runs once the server has actually applied
 * it. `placeholderData` keeps the previous estimate on screen throughout, so
 * the banner never blinks out — it just updates a moment later than the list.
 *
 * WHY IT IS NOT PART OF THE QUEUE
 *
 * `GET /v1/driver/queue` is polled every thirty seconds and must stay cheap.
 * This costs a Routes API call each time, so it is a separate request the app
 * makes deliberately. Folding it into the poll would bill a traffic lookup
 * twice a minute per driver for an answer that mostly has not changed.
 */
import { useIsMutating, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getRouteEta } from '@/api/client';
import type { ActiveStop, EtaStop, RouteEta } from '@/api/types';
import { QUEUE_MUTATION_KEY } from '@/queue/use-queue';

/**
 * Traffic moves even when the route does not. Re-measuring every five minutes
 * keeps a long run honest without turning the screen into a billing meter.
 */
export const ETA_STALE_MS = 5 * 60_000;

export function routeEtaQueryKey(orderedIds: readonly string[]): readonly unknown[] {
  return ['driver', 'eta', orderedIds.join('|')];
}

export type RouteEtaSlice = {
  query: UseQueryResult<RouteEta, Error>;
  /** Per-stop arrival, by order id. Empty while loading or degraded. */
  byStop: ReadonlyMap<string, EtaStop>;
  /** The whole-run summary, or null when there is nothing trustworthy to show. */
  summary: {
    finishTime: string;
    totalDurationSeconds: number;
    totalDistanceMeters: number;
    /** Stops with no coordinates, so the estimate covers less than the list. */
    unestimatedCount: number;
  } | null;
};

/**
 * @param stops The run in the order the server sent it. Order matters: it is
 *   both the chain being measured and the cache key.
 */
export function useRouteEta(stops: ActiveStop[], date?: string): RouteEtaSlice {
  const orderedIds = useMemo(() => stops.map((stop) => stop.id), [stops]);

  /*
    A write in flight means the optimistic cache is ahead of the server. The
    id list here already reflects the delivery; the queue the endpoint would
    measure does not. Waiting costs a second of a stale banner and buys an
    estimate that matches the run.
  */
  const writing = useIsMutating({ mutationKey: QUEUE_MUTATION_KEY });

  const query = useQuery({
    queryKey: routeEtaQueryKey(orderedIds),
    queryFn: () => getRouteEta({ date }),
    // Nothing to measure, and nothing worth spending a call on.
    enabled: orderedIds.length > 0 && writing === 0,
    staleTime: ETA_STALE_MS,
    // The previous run's estimate while the new one loads, rather than a
    // banner that blinks out every time a stop is delivered.
    placeholderData: (previous) => previous,
  });

  const byStop = useMemo(() => {
    const map = new Map<string, EtaStop>();
    if (query.data && !query.data.degraded) {
      for (const stop of query.data.stops) map.set(stop.order_id, stop);
    }
    return map;
  }, [query.data]);

  const summary = useMemo(() => {
    const eta = query.data;
    // `degraded` means the provider could not measure. Showing a zeroed
    // summary would read as "you are finished", which is the opposite.
    if (!eta || eta.degraded || eta.stops.length === 0) return null;

    return {
      finishTime: eta.finish_time,
      totalDurationSeconds: eta.total_duration_seconds,
      totalDistanceMeters: eta.total_distance_meters,
      unestimatedCount: eta.unestimated_order_ids.length,
    };
  }, [query.data]);

  return { query, byStop, summary };
}
