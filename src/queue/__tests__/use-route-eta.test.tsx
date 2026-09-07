/**
 * What makes the estimate re-measure, and what makes it stay put.
 *
 * The whole retrigger mechanism is the query key being the *ordered stop ids*.
 * Two failures follow from getting it wrong and neither looks broken:
 * keying too loosely leaves a stale finish time on screen after a delivery,
 * and keying too tightly bills a Routes API call on every thirty-second poll.
 */
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

import { useRouteEta, type RouteEtaSlice } from '../use-route-eta';
import { QUEUE_MUTATION_KEY } from '../use-queue';
import { activeStop } from '@/test-support/queue-fixtures';
import type { ActiveStop, RouteEta } from '@/api/types';

/** `mock`-prefixed so `jest.mock`'s hoisted factory may close over it. */
const mockGetRouteEta = jest.fn();

jest.mock('@/api/client', () => ({
  getRouteEta: (...args: unknown[]) => mockGetRouteEta(...args),
}));

let queryClient: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function eta(overrides: Partial<RouteEta> = {}): RouteEta {
  return {
    departure_time: '2026-09-06T13:00:00.000Z',
    origin: 'pharmacy',
    stops: [
      {
        order_id: 'a',
        duration_seconds: 600,
        distance_meters: 3000,
        arrival_time: '2026-09-06T13:10:00.000Z',
      },
      {
        order_id: 'b',
        duration_seconds: 600,
        distance_meters: 3000,
        arrival_time: '2026-09-06T13:25:00.000Z',
      },
    ],
    total_duration_seconds: 1800,
    total_distance_meters: 6000,
    finish_time: '2026-09-06T13:30:00.000Z',
    unestimated_order_ids: [],
    degraded: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetRouteEta.mockReset();
  mockGetRouteEta.mockResolvedValue(eta());
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});

const A = activeStop({ id: 'a', status: 'picked_up' });
const B = activeStop({ id: 'b', status: 'picked_up' });
const C = activeStop({ id: 'c', status: 'picked_up' });

describe('useRouteEta — when it measures', () => {
  it('measures the run once on mount', async () => {
    renderHook(() => useRouteEta([A, B]), { wrapper });

    await waitFor(() => expect(mockGetRouteEta).toHaveBeenCalledTimes(1));
  });

  it('re-measures when a stop leaves the run', async () => {
    // Exactly what a delivery or a return does: `applyComplete` drops the
    // stop from the cache, the id list changes, and the estimate follows.
    const { rerender } = renderHook<RouteEtaSlice, { stops: ActiveStop[] }>(
      ({ stops }) => useRouteEta(stops),
      { wrapper, initialProps: { stops: [A, B] } },
    );
    await waitFor(() => expect(mockGetRouteEta).toHaveBeenCalledTimes(1));

    rerender({ stops: [B] });

    await waitFor(() => expect(mockGetRouteEta).toHaveBeenCalledTimes(2));
  });

  it('re-measures when a stop is added mid-shift', async () => {
    const { rerender } = renderHook<RouteEtaSlice, { stops: ActiveStop[] }>(
      ({ stops }) => useRouteEta(stops),
      { wrapper, initialProps: { stops: [A, B] } },
    );
    await waitFor(() => expect(mockGetRouteEta).toHaveBeenCalledTimes(1));

    rerender({ stops: [A, B, C] });

    await waitFor(() => expect(mockGetRouteEta).toHaveBeenCalledTimes(2));
  });

  it('re-measures when the same stops are reordered', async () => {
    // A re-optimize, or a priority flag flipping. The chain is different even
    // though the set is not, so the drive times are different too.
    const { rerender } = renderHook<RouteEtaSlice, { stops: ActiveStop[] }>(
      ({ stops }) => useRouteEta(stops),
      { wrapper, initialProps: { stops: [A, B] } },
    );
    await waitFor(() => expect(mockGetRouteEta).toHaveBeenCalledTimes(1));

    rerender({ stops: [B, A] });

    await waitFor(() => expect(mockGetRouteEta).toHaveBeenCalledTimes(2));
  });

  it('does not re-measure when a poll returns the same run', async () => {
    // The queue refetches every thirty seconds and mostly returns the same
    // stops in the same order. Each of those must cost nothing: this call is
    // billed per request.
    const { rerender } = renderHook<RouteEtaSlice, { stops: ActiveStop[] }>(
      ({ stops }) => useRouteEta(stops),
      { wrapper, initialProps: { stops: [A, B] } },
    );
    await waitFor(() => expect(mockGetRouteEta).toHaveBeenCalledTimes(1));

    // A new array of equal stops, as a refetch would produce.
    rerender({ stops: [activeStop({ id: 'a', status: 'picked_up' }), B] });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockGetRouteEta).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing when the run is empty', async () => {
    renderHook(() => useRouteEta([]), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockGetRouteEta).not.toHaveBeenCalled();
  });
});

describe('useRouteEta — what it reports', () => {
  it('indexes arrivals by order id', async () => {
    const { result } = renderHook(() => useRouteEta([A, B]), { wrapper });

    await waitFor(() => expect(result.current.byStop.size).toBe(2));
    expect(result.current.byStop.get('b')?.arrival_time).toBe(
      '2026-09-06T13:25:00.000Z',
    );
  });

  it('summarises the whole run', async () => {
    const { result } = renderHook(() => useRouteEta([A, B]), { wrapper });

    await waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(result.current.summary).toEqual({
      finishTime: '2026-09-06T13:30:00.000Z',
      totalDurationSeconds: 1800,
      totalDistanceMeters: 6000,
      unestimatedCount: 0,
    });
  });

  it('counts the stops the estimate could not cover', async () => {
    mockGetRouteEta.mockResolvedValue(eta({ unestimated_order_ids: ['c'] }));

    const { result } = renderHook(() => useRouteEta([A, B, C]), { wrapper });

    await waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(result.current.summary?.unestimatedCount).toBe(1);
  });

  it('reports nothing at all when the estimate is degraded', async () => {
    // Not a zeroed summary: "0 min" reads as "you are finished", and a driver
    // would believe it. Absence is the honest answer.
    mockGetRouteEta.mockResolvedValue(
      eta({ degraded: true, stops: [], total_duration_seconds: 0 }),
    );

    const { result } = renderHook(() => useRouteEta([A, B]), { wrapper });

    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(result.current.summary).toBeNull();
    expect(result.current.byStop.size).toBe(0);
  });

  it('reports nothing when the provider answered with no stops', async () => {
    mockGetRouteEta.mockResolvedValue(eta({ stops: [] }));

    const { result } = renderHook(() => useRouteEta([A, B]), { wrapper });

    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(result.current.summary).toBeNull();
  });
});

describe('useRouteEta — while a write is in flight', () => {
  /**
   * The endpoint measures the queue the *server* holds. A request that
   * overtakes the completion that triggered it comes back still counting the
   * delivered stop, and caches that answer under the post-delivery key — where
   * nothing invalidates it, because the id list never changes again. The
   * symptom was a finish time that only corrected itself on a manual refresh.
   */
  it('does not measure until the queue write has landed', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });

    function useHarness(stops: ActiveStop[]) {
      const mutation = useMutation({
        mutationKey: QUEUE_MUTATION_KEY,
        mutationFn: () => pending,
      });
      return { eta: useRouteEta(stops), mutation };
    }

    const { result, rerender } = renderHook<
      ReturnType<typeof useHarness>,
      { stops: ActiveStop[] }
    >(({ stops }) => useHarness(stops), {
      wrapper,
      initialProps: { stops: [A, B] },
    });

    await waitFor(() => expect(mockGetRouteEta).toHaveBeenCalledTimes(1));

    // The driver taps Delivered: the write starts, and the optimistic cache
    // drops the stop, which is what changes the key here.
    result.current.mutation.mutate();
    await waitFor(() => expect(result.current.mutation.isPending).toBe(true));
    rerender({ stops: [B] });

    // The key has changed, but the server has not applied anything yet.
    expect(mockGetRouteEta).toHaveBeenCalledTimes(1);

    release?.();

    await waitFor(() => expect(mockGetRouteEta).toHaveBeenCalledTimes(2));
  });

  it('keeps the previous estimate on screen while it waits', async () => {
    const { result, rerender } = renderHook<RouteEtaSlice, { stops: ActiveStop[] }>(
      ({ stops }) => useRouteEta(stops),
      { wrapper, initialProps: { stops: [A, B] } },
    );
    await waitFor(() => expect(result.current.summary).not.toBeNull());

    rerender({ stops: [B] });

    // Never null between runs: a banner that blinks out reads as "no estimate".
    expect(result.current.summary).not.toBeNull();
  });
});
