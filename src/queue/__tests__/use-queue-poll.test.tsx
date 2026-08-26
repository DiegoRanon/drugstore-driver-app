/**
 * The poll's demotion from discovery mechanism to fallback.
 *
 * `splitQueue` is a pure function and tested next door; this covers the other
 * half of `use-queue` — how often it asks the server, which is now a function
 * of whether the socket is carrying the news instead.
 *
 * The case worth guarding is the last one. PRD §7 requires clients to fall back
 * to polling when the socket drops, so a change that made the interval
 * conditional on the socket *existing* rather than being *connected* would
 * leave a driver in a dead spot on no refresh path at all.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

import {
  QUEUE_POLL_CONNECTED_INTERVAL_MS,
  QUEUE_POLL_INTERVAL_MS,
  queueQueryKey,
  useQueue,
} from '../use-queue';
import { RealtimeContext } from '../realtime-status';
import { queue as buildQueue } from '@/test-support/queue-fixtures';

/** `mock`-prefixed so `jest.mock`'s hoisted factory may close over it. */
const mockGetQueue = jest.fn();

jest.mock('@/api/client', () => ({
  getQueue: (...args: unknown[]) => mockGetQueue(...args),
}));

let queryClient: QueryClient;

function wrapper(connected: boolean) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <RealtimeContext.Provider value={{ connected }}>{children}</RealtimeContext.Provider>
      </QueryClientProvider>
    );
  };
}

/** The interval TanStack Query actually settled on for the queue query. */
function activeInterval(): number | false | undefined {
  const [observer] = queryClient
    .getQueryCache()
    .find({ queryKey: queueQueryKey() })!.observers;
  return observer?.options.refetchInterval as number | false | undefined;
}

beforeEach(() => {
  mockGetQueue.mockReset().mockResolvedValue(buildQueue({}));
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});

afterEach(() => {
  queryClient.clear();
});

describe('useQueue polling', () => {
  it('polls every thirty seconds with no socket', async () => {
    const { result } = renderHook(() => useQueue(), { wrapper: wrapper(false) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(activeInterval()).toBe(QUEUE_POLL_INTERVAL_MS);
  });

  it('backs off to two minutes while the socket is up', async () => {
    // Changes arrive live, so the poll is only a net for a dropped frame —
    // no reason to spend four times the requests on it.
    const { result } = renderHook(() => useQueue(), { wrapper: wrapper(true) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(activeInterval()).toBe(QUEUE_POLL_CONNECTED_INTERVAL_MS);
  });

  it('never stops polling entirely, however healthy the socket looks', () => {
    // The fallback PRD §7 requires. A frame can be missed; a poll cannot.
    expect(QUEUE_POLL_CONNECTED_INTERVAL_MS).toBeGreaterThan(0);
    expect(Number.isFinite(QUEUE_POLL_CONNECTED_INTERVAL_MS)).toBe(true);
  });

  it('polls at the ordinary interval outside a RealtimeProvider', async () => {
    // `NO_REALTIME` reports disconnected, so a screen mounted on its own gets
    // the safe answer rather than a two-minute gap it cannot fill.
    const { result } = renderHook(() => useQueue(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(activeInterval()).toBe(QUEUE_POLL_INTERVAL_MS);
  });
});
