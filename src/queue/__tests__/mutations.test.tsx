/**
 * The online-first write contract.
 *
 * There is no outbox (PRD §6 is deferred), so what stands between a driver in
 * a parking garage and a lost delivery is exactly two things, and both are
 * asserted here:
 *
 * 1. **An `Idempotency-Key` on every write**, so a retry replays rather than
 *    double-writes. The server registers that plugin only inside the driver
 *    scope; these are the only calls in the API that get it.
 * 2. **A snapshot restore on failure**, so a refusal leaves the screen exactly
 *    as it was rather than half-applied.
 *
 * Every case mounts `useQueue()` alongside the mutation, exactly as the app
 * does — `GlassTabBar` calls `useQueueSlices()` for the whole tab group's
 * lifetime. That is not scene-setting: under `gcTime: 0` a cache entry with no
 * observer is collected on the next tick, taking any optimistic update with
 * it. A test that seeded the cache and fired a mutation with nothing watching
 * would fail, and so would the app.
 */

/** In-memory Keychain — `getValidAccessToken` reads the session before every call. */
const mockSecureStoreData = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStoreData.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStoreData.get(key) ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStoreData.delete(key);
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { QueueResponse } from '@/api/types';
import { createQueryClient } from '@/queue/query-client';
import { queueQueryKey, useQueue } from '@/queue/use-queue';
import {
  useBatchHandover,
  useComplete,
  usePickup,
  useReturn,
  useSequence,
} from '@/queue/mutations';
import { FakeServer } from '@/test-support/fake-server';
import {
  activeStop,
  queue,
  returnStop,
  terminalStop,
  totals,
} from '@/test-support/queue-fixtures';

const server = new FakeServer();
const KEY = queueQueryKey();

function Wrapper({
  client,
  children,
}: {
  client: QueryClient;
  children: React.ReactNode;
}) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Mount a mutation the way a screen does: with the queue observed above it.
 *
 * Returns once the first payload has landed, so the optimistic reducers have
 * something to reduce.
 */
async function mountWithQueue<T>(initial: QueueResponse, useMutationHook: () => T) {
  server.on('GET', '/v1/driver/queue', () => ({ body: initial }));

  const client = createQueryClient();
  const view = renderHook(
    () => ({ queue: useQueue(), mutation: useMutationHook() }),
    {
      wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper>,
    },
  );

  await waitFor(() => expect(view.result.current.queue.data).toBeDefined());
  return { client, view };
}

function cached(client: QueryClient): QueueResponse | undefined {
  return client.getQueryData<QueueResponse>(KEY);
}

beforeEach(() => {
  mockSecureStoreData.clear();
  mockSecureStoreData.set(
    'driver.session.v1',
    JSON.stringify({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 10 * 60_000,
    }),
  );
  server.requests.length = 0;
  server.install();
});

afterEach(() => {
  server.restore();
});

describe('optimistic writes', () => {
  it('moves the card before the server answers', async () => {
    let release: (() => void) | undefined;
    const landed = new Promise<void>((resolve) => {
      release = resolve;
    });

    server.on('POST', '/v1/driver/orders/a/pickup', async () => {
      await landed;
      return { body: { id: 'a', status: 'picked_up' } };
    });

    const { client, view } = await mountWithQueue(
      queue({ stops: [activeStop({ id: 'a', status: 'in_pharmacy' })] }),
      usePickup,
    );

    try {
      act(() => {
        view.result.current.mutation.mutate({ id: 'a' });
      });

      await waitFor(() => expect(cached(client)?.stops[0]?.status).toBe('picked_up'));
    } finally {
      // Always release, or a failing assertion above leaves the handler — and
      // Jest's worker — waiting on a promise nothing will ever resolve.
      release?.();
    }

    await waitFor(() => expect(view.result.current.mutation.isPending).toBe(false));
  });

  /**
   * The rollback, and the reason `onError` restores a snapshot rather than
   * computing an inverse: the driver's screen has to end up exactly where it
   * started, totals included, whatever else was in flight.
   */
  it('puts everything back when the server refuses', async () => {
    server.on('POST', '/v1/driver/orders/a/complete', () => ({
      status: 409,
      body: {
        error: { code: 'ORDER_ALREADY_TERMINAL', message: 'gone', details: {} },
      },
    }));

    const { client, view } = await mountWithQueue(
      queue({
        stops: [activeStop({ id: 'a', status: 'picked_up', amount_due: 42.5 })],
        totals: totals({ stop_count: 1, payment_stop_count: 1, amount_due_total: 42.5 }),
      }),
      useComplete,
    );

    await act(async () => {
      await view.result.current.mutation
        .mutateAsync({ id: 'a' })
        .catch(() => undefined);
    });

    const after = cached(client);
    expect(after?.stops).toHaveLength(1);
    expect(after?.closed).toHaveLength(0);
    expect(after?.totals.amount_due_total).toBe(42.5);
  });

  /**
   * `gcTime: 0` is a privacy rule with a sharp edge, and this is the property
   * the app depends on: the tab bar's observer keeps the entry alive across
   * any number of screens mounting and unmounting underneath it.
   *
   * The corollary is a rule no test can enforce: never fire a queue mutation
   * from something that outlives the navigator.
   */
  it('survives the screen that made it unmounting', async () => {
    server.on('POST', '/v1/driver/orders/a/pickup', () => ({
      body: { id: 'a', status: 'picked_up' },
    }));
    server.on('GET', '/v1/driver/queue', () => ({
      body: queue({ stops: [activeStop({ id: 'a', status: 'in_pharmacy' })] }),
    }));

    const client = createQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Wrapper client={client}>{children}</Wrapper>
    );

    // The tab bar: mounted once, never unmounted.
    const bar = renderHook(() => useQueue(), { wrapper });
    await waitFor(() => expect(bar.result.current.data).toBeDefined());

    // A screen that fires a write and then goes away.
    const screen = renderHook(() => usePickup(), { wrapper });
    await act(async () => {
      await screen.result.current.mutateAsync({ id: 'a' });
    });
    screen.unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(cached(client)).toBeDefined();
    bar.unmount();
  });
});

describe('the idempotency contract', () => {
  it('sends an Idempotency-Key on pickup', async () => {
    server.on('POST', '/v1/driver/orders/a/pickup', () => ({ body: { id: 'a' } }));

    const { view } = await mountWithQueue(
      queue({ stops: [activeStop({ id: 'a', status: 'in_pharmacy' })] }),
      usePickup,
    );

    await act(async () => {
      await view.result.current.mutation.mutateAsync({ id: 'a' });
    });

    const sent = server.callsTo('POST', '/v1/driver/orders/a/pickup')[0];
    expect(sent?.headers['idempotency-key']).toBeTruthy();
    expect(sent?.headers['idempotency-key']?.length).toBeLessThanOrEqual(255);
  });

  it('sends an Idempotency-Key on complete', async () => {
    server.on('POST', '/v1/driver/orders/a/complete', () => ({ body: { id: 'a' } }));

    const { view } = await mountWithQueue(
      queue({ stops: [activeStop({ id: 'a', status: 'picked_up' })] }),
      useComplete,
    );

    await act(async () => {
      await view.result.current.mutation.mutateAsync({ id: 'a' });
    });

    expect(
      server.callsTo('POST', '/v1/driver/orders/a/complete')[0]?.headers[
        'idempotency-key'
      ],
    ).toBeTruthy();
  });

  it('sends an Idempotency-Key on return, with the reason the server requires', async () => {
    server.on('POST', '/v1/driver/orders/a/return', () => ({ body: { id: 'a' } }));

    const { view } = await mountWithQueue(
      queue({ stops: [activeStop({ id: 'a', status: 'picked_up' })] }),
      useReturn,
    );

    await act(async () => {
      await view.result.current.mutation.mutateAsync({
        id: 'a',
        body: { reason: 'customer_absent' },
      });
    });

    const sent = server.callsTo('POST', '/v1/driver/orders/a/return')[0];
    expect(sent?.headers['idempotency-key']).toBeTruthy();
    expect(sent?.body).toEqual({ reason: 'customer_absent' });
  });

  /*
    The spec marks the pickup body required and Zod preprocesses null into
    `{}`, but sending no body omits `content-type` — a different request, and a
    different idempotency fingerprint.
  */
  it('sends {} rather than nothing when a pickup carries no count', async () => {
    server.on('POST', '/v1/driver/orders/a/pickup', () => ({ body: { id: 'a' } }));

    const { view } = await mountWithQueue(
      queue({ stops: [activeStop({ id: 'a', status: 'in_pharmacy' })] }),
      usePickup,
    );

    await act(async () => {
      await view.result.current.mutation.mutateAsync({ id: 'a' });
    });

    const sent = server.callsTo('POST', '/v1/driver/orders/a/pickup')[0];
    expect(sent?.rawBody).toBe('{}');
    expect(sent?.headers['content-type']).toBe('application/json');
  });

  it('carries the label-check count when the driver ticked one', async () => {
    server.on('POST', '/v1/driver/orders/a/pickup', () => ({ body: { id: 'a' } }));

    const { view } = await mountWithQueue(
      queue({ stops: [activeStop({ id: 'a', status: 'in_pharmacy' })] }),
      usePickup,
    );

    await act(async () => {
      await view.result.current.mutation.mutateAsync({
        id: 'a',
        confirmedPackageCount: 3,
      });
    });

    expect(server.callsTo('POST', '/v1/driver/orders/a/pickup')[0]?.body).toEqual({
      confirmed_package_count: 3,
    });
  });

  it('never sends payment and payment_exception together', async () => {
    server.on('POST', '/v1/driver/orders/a/complete', () => ({ body: { id: 'a' } }));

    const { view } = await mountWithQueue(
      queue({ stops: [activeStop({ id: 'a', status: 'picked_up' })] }),
      useComplete,
    );

    await act(async () => {
      await view.result.current.mutation.mutateAsync({
        id: 'a',
        outcome: { kind: 'exception', exception: 'waived_by_pharmacy', note: 'ok' },
      });
    });

    const body = server.callsTo('POST', '/v1/driver/orders/a/complete')[0]?.body as Record<
      string,
      unknown
    >;
    expect(body.payment_exception).toBe('waived_by_pharmacy');
    expect(body.payment_exception_note).toBe('ok');
    expect('payment' in body).toBe(false);
  });

  it('sends the payment inline, so the transition and the collection are one write', async () => {
    server.on('POST', '/v1/driver/orders/a/complete', () => ({ body: { id: 'a' } }));

    const { view } = await mountWithQueue(
      queue({ stops: [activeStop({ id: 'a', status: 'picked_up', amount_due: 42.5 })] }),
      useComplete,
    );

    await act(async () => {
      await view.result.current.mutation.mutateAsync({
        id: 'a',
        outcome: {
          kind: 'paid',
          payment: { payment_method: 'cash', amount_collected: 42.5 },
        },
      });
    });

    expect(server.callsTo('POST', '/v1/driver/orders/a/complete')[0]?.body).toEqual({
      payment: { payment_method: 'cash', amount_collected: 42.5 },
    });
    // Never `/payment` then `/complete` — that is two writes and a window
    // where one landed and the other did not.
    expect(server.callsTo('POST', '/v1/driver/orders/a/payment')).toHaveLength(0);
  });
});

describe('the sequence endpoint', () => {
  /*
    It answers with the whole queue, so writing the response straight into the
    cache is both cheaper and more correct than invalidating — the payload
    already is the refetch.
  */
  it('writes its response into the cache instead of refetching', async () => {
    const answered = queue({
      stops: [activeStop({ id: 'b', status: 'picked_up', sequence_number: 1 })],
    });
    server.on('POST', '/v1/driver/queue/sequence', () => ({ body: answered }));

    const { client, view } = await mountWithQueue(
      queue({
        stops: [
          activeStop({ id: 'a', status: 'picked_up', sequence_number: 1 }),
          activeStop({ id: 'b', status: 'picked_up', sequence_number: 2 }),
        ],
      }),
      useSequence,
    );

    const readsBefore = server.callsTo('GET', '/v1/driver/queue').length;

    await act(async () => {
      await view.result.current.mutation.mutateAsync({ orderedIds: ['b', 'a'] });
    });

    expect(cached(client)?.stops.map((stop) => stop.id)).toEqual(['b']);
    expect(server.callsTo('GET', '/v1/driver/queue')).toHaveLength(readsBefore);
  });

  it('sends every id it was given, because the server nulls the ones it is not', async () => {
    server.on('POST', '/v1/driver/queue/sequence', () => ({ body: queue() }));

    const { view } = await mountWithQueue(
      queue({
        stops: [
          activeStop({ id: 'a', status: 'in_pharmacy' }),
          activeStop({ id: 'b', status: 'picked_up' }),
        ],
      }),
      useSequence,
    );

    await act(async () => {
      await view.result.current.mutation.mutateAsync({ orderedIds: ['b', 'a'] });
    });

    expect(
      (server.callsTo('POST', '/v1/driver/queue/sequence')[0]?.body as Record<
        string,
        unknown
      >).ordered_order_ids,
    ).toEqual(['b', 'a']);
  });
});

describe('batch handover', () => {
  it('moves the whole stack at once', async () => {
    /*
      The fake server keeps state here rather than replaying one fixture,
      because `onSettled` invalidates and the refetch is what the driver
      finally sees. A GET that kept answering with the pre-handover day would
      make this assert the opposite of what the app does.
    */
    let state = queue({
      to_return: [returnStop({ id: 'a' }), returnStop({ id: 'b' })],
      totals: totals({ packages_to_return: 2 }),
    });

    server.on('POST', '/v1/driver/returns/handover', () => {
      state = queue({ closed: [terminalStop({ id: 'a' }), terminalStop({ id: 'b' })] });
      return { body: { handed_over: [], count: 2 } };
    });

    const { client, view } = await mountWithQueue(state, useBatchHandover);
    server.on('GET', '/v1/driver/queue', () => ({ body: state }));

    await act(async () => {
      await view.result.current.mutation.mutateAsync({ ids: ['a', 'b'] });
    });

    expect(server.callsTo('POST', '/v1/driver/returns/handover')[0]?.body).toEqual({
      order_ids: ['a', 'b'],
    });
    await waitFor(() => expect(cached(client)?.to_return).toHaveLength(0));
  });

  it('rolls the whole stack back when the transaction fails', async () => {
    server.on('POST', '/v1/driver/returns/handover', () => ({
      status: 409,
      body: {
        error: { code: 'ORDER_INVALID_TRANSITION', message: 'no', details: {} },
      },
    }));

    const { client, view } = await mountWithQueue(
      queue({
        to_return: [returnStop({ id: 'a' }), returnStop({ id: 'b' })],
        totals: totals({ packages_to_return: 2 }),
      }),
      useBatchHandover,
    );

    await act(async () => {
      await view.result.current.mutation
        .mutateAsync({ ids: ['a', 'b'] })
        .catch(() => undefined);
    });

    const after = cached(client);
    expect(after?.to_return).toHaveLength(2);
    expect(after?.closed).toHaveLength(0);
    expect(after?.totals.packages_to_return).toBe(2);
  });
});
