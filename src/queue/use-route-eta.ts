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
 * The optimistic cache is what makes this feel instant: `applyComplete`
 * removes the stop the moment the driver taps Delivered, so the key changes
 * before the server has answered and the new estimate is already in flight.
 * If the mutation then fails and rolls back, the key rolls back with it and
 * the previous estimate is served from cache.
 *
 * WHY IT IS NOT PART OF THE QUEUE
 *
 * `GET /v1/driver/queue` is polled every thirty seconds and must stay cheap.
 * This costs a Routes API call each time, so it is a separate request the app
 * makes deliberately. Folding it into the poll would bill a traffic lookup
 * twice a minute per driver for an answer that mostly has not changed.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getRouteEta } from '@/api/client';
import type { ActiveStop, EtaStop, RouteEta } from '@/api/types';

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

  const query = useQuery({
    queryKey: routeEtaQueryKey(orderedIds),
    queryFn: () => getRouteEta({ date }),
    // Nothing to measure, and nothing worth spending a call on.
    enabled: orderedIds.length > 0,
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
