/**
 * The seam between a socket frame and a refetch.
 *
 * The socket itself is socket.io's problem and the queue split is tested on its
 * own, which leaves exactly one thing here: the policy about *when* a socket is
 * held open, and what a frame is allowed to do when one arrives.
 *
 * Three of these are guards rather than features, and each stands for a real
 * failure — a socket open on a signed-out device, a refetch clobbering an
 * optimistic write, and ten assignments becoming ten full queue fetches.
 */
import type { Socket } from 'socket.io-client';

type Handler = (...args: unknown[]) => void;

/**
 * A socket.io double: records listeners and connect/disconnect calls.
 *
 * `mock`-prefixed, as is `mockSockets` below, because `jest.mock`'s factory is
 * hoisted above them and may only close over names spelled that way.
 */
class MockSocket {
  handlers = new Map<string, Handler[]>();
  connectCalls = 0;
  disconnectCalls = 0;
  closed = false;

  on(event: string, handler: Handler): this {
    const existing = this.handlers.get(event) ?? [];
    this.handlers.set(event, [...existing, handler]);
    return this;
  }

  connect(): this {
    this.connectCalls += 1;
    return this;
  }

  disconnect(): this {
    this.disconnectCalls += 1;
    return this;
  }

  close(): this {
    this.closed = true;
    return this;
  }

  removeAllListeners(): this {
    this.handlers.clear();
    return this;
  }

  /** Server-side push. */
  emitServer(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
}

let mockSockets: MockSocket[] = [];
let mockSignedIn = true;
let mockWriting = 0;

jest.mock('@/api/realtime', () => ({
  REALTIME_EVENTS: [
    'order.assigned',
    'order.ready',
    'order.unassigned',
    'order.cancelled',
  ],
  createRealtimeSocket: () => {
    const socket = new MockSocket();
    mockSockets.push(socket);
    return socket as unknown as Socket;
  },
}));

jest.mock('@/auth/session-provider', () => ({
  useSession: () => ({
    state: mockSignedIn ? { status: 'signed-in', profile: null } : { status: 'signed-out', endedReason: null },
  }),
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { Text } from 'react-native';

import {
  REALTIME_REFRESH_DEBOUNCE_MS,
  RealtimeProvider,
  useRealtime,
} from '../realtime-provider';
import { queueQueryKey } from '../use-queue';

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return { ...actual, useIsMutating: () => mockWriting };
});

let queryClient: QueryClient;
let invalidate: jest.SpyInstance;

function Probe() {
  const { connected } = useRealtime();
  return <Text testID="connected">{String(connected)}</Text>;
}

function mount() {
  return render(
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <Probe />
      </RealtimeProvider>
    </QueryClientProvider>,
  );
}

/** The single socket the provider built, or a failure if it built none. */
function socket(): MockSocket {
  expect(mockSockets).toHaveLength(1);
  return mockSockets[0]!;
}

function invalidatedQueueKeys(): unknown[] {
  return invalidate.mock.calls
    .map(([arg]) => (arg as { queryKey?: unknown } | undefined)?.queryKey)
    .filter((key) => JSON.stringify(key) === JSON.stringify(queueQueryKey()));
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSockets = [];
  mockSignedIn = true;
  mockWriting = 0;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  // Read once on mount to decide whether to connect immediately. A plain
  // property on RN's mock, not a getter, so it is set rather than spied.
  (AppState as { currentState: string }).currentState = 'active';
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  queryClient.clear();
});

describe('RealtimeProvider', () => {
  it('opens no socket at all while signed out', () => {
    // A socket is a credentialed connection carrying this driver's changes.
    // Holding one open after a sign-out — or a deactivation mid-route — would
    // outlive the session wipe in `SessionProvider`.
    mockSignedIn = false;

    mount();

    expect(mockSockets).toHaveLength(0);
  });

  it('connects once signed in and foregrounded', () => {
    mount();

    expect(socket().connectCalls).toBe(1);
  });

  it('reports connected only between connect and disconnect', () => {
    const { getByTestId } = mount();
    expect(getByTestId('connected')).toHaveTextContent('false');

    act(() => socket().emitServer('connect'));
    expect(getByTestId('connected')).toHaveTextContent('true');

    act(() => socket().emitServer('disconnect'));
    expect(getByTestId('connected')).toHaveTextContent('false');
  });

  it('stops claiming to be connected when a handshake is refused', () => {
    const { getByTestId } = mount();
    act(() => socket().emitServer('connect'));

    act(() => socket().emitServer('connect_error', new Error('UNAUTHENTICATED')));

    expect(getByTestId('connected')).toHaveTextContent('false');
  });

  it('refetches the queue when an assignment arrives', () => {
    mount();
    act(() => socket().emitServer('order.assigned'));

    // Debounced, so nothing has happened yet.
    expect(invalidatedQueueKeys()).toHaveLength(0);

    act(() => jest.advanceTimersByTime(REALTIME_REFRESH_DEBOUNCE_MS));

    expect(invalidatedQueueKeys()).toHaveLength(1);
  });

  it.each(['order.ready', 'order.unassigned', 'order.cancelled'])(
    'refetches the queue on %s too',
    (event) => {
      mount();
      act(() => socket().emitServer(event));
      act(() => jest.advanceTimersByTime(REALTIME_REFRESH_DEBOUNCE_MS));

      expect(invalidatedQueueKeys()).toHaveLength(1);
    },
  );

  it('folds a burst of assignments into one refetch', () => {
    // A dispatcher assigning the morning run fires one frame per order.
    mount();

    act(() => {
      for (let i = 0; i < 10; i += 1) socket().emitServer('order.assigned');
    });
    act(() => jest.advanceTimersByTime(REALTIME_REFRESH_DEBOUNCE_MS));

    expect(invalidatedQueueKeys()).toHaveLength(1);
  });

  it('waits for an in-flight write rather than clobbering its optimistic cache', () => {
    // The window `useQueue` already suspends its poll for: a refetch landing
    // here would replace the optimistic update with server state that predates
    // it, and the stop would visibly jump back to the tab it just left.
    mockWriting = 1;
    mount();

    act(() => socket().emitServer('order.assigned'));
    act(() => jest.advanceTimersByTime(REALTIME_REFRESH_DEBOUNCE_MS * 3));

    expect(invalidatedQueueKeys()).toHaveLength(0);
  });

  it('lands the deferred refetch once the write settles', () => {
    mockWriting = 1;
    const { rerender } = mount();

    act(() => socket().emitServer('order.assigned'));
    act(() => jest.advanceTimersByTime(REALTIME_REFRESH_DEBOUNCE_MS));
    expect(invalidatedQueueKeys()).toHaveLength(0);

    mockWriting = 0;
    rerender(
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          <Probe />
        </RealtimeProvider>
      </QueryClientProvider>,
    );
    act(() => jest.advanceTimersByTime(REALTIME_REFRESH_DEBOUNCE_MS));

    // Deferred, not dropped — the assignment is real and has to arrive.
    expect(invalidatedQueueKeys()).toHaveLength(1);
  });

  it('drops the socket when the phone is pocketed and takes it back on return', () => {
    // PRD §10: nothing on a backgrounded phone's battery. An open socket held
    // in a pocket all afternoon is exactly that.
    const listeners: ((status: string) => void)[] = [];
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event: string, handler: (status: never) => void) => {
        listeners.push(handler as (status: string) => void);
        return { remove: jest.fn() } as never;
      });

    mount();
    expect(socket().connectCalls).toBe(1);

    act(() => listeners.forEach((notify) => notify('background')));
    expect(socket().disconnectCalls).toBe(1);

    act(() => listeners.forEach((notify) => notify('active')));
    expect(socket().connectCalls).toBe(2);
  });

  it('closes the socket when the driver signs out', () => {
    const { rerender } = mount();
    const live = socket();

    mockSignedIn = false;
    rerender(
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          <Probe />
        </RealtimeProvider>
      </QueryClientProvider>,
    );

    expect(live.closed).toBe(true);
  });
});
