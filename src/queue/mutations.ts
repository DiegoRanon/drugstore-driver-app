/**
 * Every write a driver can make, applied to the screen before the server
 * answers and rolled back if it disagrees.
 *
 * Online-first, not offline-first: there is no outbox yet (PRD §6 is
 * deferred). What stands in for it is the pair the server was built for —
 * an `Idempotency-Key` on every call, so a retry can never double-write, and
 * a snapshot restore, so a failure leaves the screen exactly as it was. A
 * failed write surfaces inline and the driver taps again; the second tap gets
 * a fresh key, which is correct, because the first may have a 4xx cached
 * against it.
 *
 * `retry: false` on mutations is the default from `query-client.ts` and is
 * deliberate here. Retrying a decided answer — a conflict, a forbidden order —
 * only burns battery, and the one 4xx worth retrying
 * (`IDEMPOTENCY_REQUEST_IN_FLIGHT`) is the driver's to decide on, because it
 * means their own earlier tap is still running.
 */
import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

import {
  collectPayment,
  completeOrder,
  coolerCheck,
  handoverOrder,
  handoverReturns,
  optimizeQueue,
  pickupOrder,
  returnOrder,
  sequenceQueue,
  setOrderPriority,
  type CompleteOutcome,
} from '@/api/client';
import type {
  BatchHandoverResponse,
  FailureReason,
  MutatedStop,
  OptimizeBody,
  OptimizeResponse,
  PaymentBody,
  PaymentResponse,
  QueueResponse,
  ReturnBody,
} from '@/api/types';
import {
  applyComplete,
  applyCoolerCheck,
  applyHandover,
  applyPayment,
  applyPickup,
  applyPriority,
  applyReturn,
  applySequence,
} from '@/queue/optimistic';
import { QUEUE_MUTATION_KEY, queueQueryKey } from '@/queue/use-queue';

type Ctx = { previous: QueueResponse | undefined };

/**
 * The shape every verb below shares.
 *
 * `apply` is a pure reducer from `optimistic.ts`; nothing here knows what any
 * particular verb means. Keeping the cache surgery in one place is what makes
 * "a failed write leaves no trace" a property of the module rather than a
 * thing each hook has to remember.
 */
function useQueueMutation<TVars, TData>(options: {
  mutationFn: (vars: TVars) => Promise<TData>;
  apply: (queue: QueueResponse, vars: TVars) => QueueResponse;
  /**
   * For the two endpoints that answer with the whole queue. Writing their
   * response straight into the cache is both cheaper and more correct than
   * invalidating — the payload already *is* the refetch.
   */
  replaceWith?: (data: TData) => QueueResponse;
  date?: string;
}): UseMutationResult<TData, Error, TVars, Ctx> {
  const client = useQueryClient();
  const key = queueQueryKey(options.date);

  return useMutation<TData, Error, TVars, Ctx>({
    mutationKey: QUEUE_MUTATION_KEY,
    mutationFn: options.mutationFn,

    async onMutate(vars) {
      // A poll already in flight would land after the optimistic write and
      // undo it. `useQueue` handles the one that would *start* during the
      // window by suspending its interval on `useIsMutating`.
      await client.cancelQueries({ queryKey: key });

      const previous = client.getQueryData<QueueResponse>(key);
      if (previous) client.setQueryData(key, options.apply(previous, vars));
      return { previous };
    },

    onError(_error, _vars, context) {
      // Exactly what was there before, not a recomputed inverse: the driver's
      // screen has to end up where it started even if two writes overlapped.
      if (context?.previous) client.setQueryData(key, context.previous);
    },

    onSuccess(data) {
      if (options.replaceWith) client.setQueryData(key, options.replaceWith(data));
    },

    onSettled() {
      if (!options.replaceWith) void client.invalidateQueries({ queryKey: key });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* At the counter                                                             */
/* -------------------------------------------------------------------------- */

export function usePickup(
  date?: string,
): UseMutationResult<MutatedStop, Error, { id: string; confirmedPackageCount?: number }, Ctx> {
  return useQueueMutation({
    date,
    mutationFn: ({ id, confirmedPackageCount }) => pickupOrder(id, confirmedPackageCount),
    apply: (queue, { id }) => applyPickup(queue, id),
  });
}

export function useSetPriority(
  date?: string,
): UseMutationResult<MutatedStop, Error, { id: string; isPriority: boolean }, Ctx> {
  return useQueueMutation({
    date,
    mutationFn: ({ id, isPriority }) => setOrderPriority(id, isPriority),
    apply: (queue, { id, isPriority }) => applyPriority(queue, id, isPriority),
  });
}

/* -------------------------------------------------------------------------- */
/* At the door                                                                */
/* -------------------------------------------------------------------------- */

export function useComplete(
  date?: string,
): UseMutationResult<MutatedStop, Error, { id: string; outcome?: CompleteOutcome }, Ctx> {
  return useQueueMutation({
    date,
    mutationFn: ({ id, outcome }) => completeOrder(id, outcome),
    apply: (queue, { id, outcome }) =>
      applyComplete(
        queue,
        id,
        outcome?.kind === 'paid'
          ? { amount_collected: outcome.payment.amount_collected }
          : undefined,
      ),
  });
}

export function useReturn(
  date?: string,
): UseMutationResult<MutatedStop, Error, { id: string; body: ReturnBody }, Ctx> {
  return useQueueMutation({
    date,
    mutationFn: ({ id, body }) => returnOrder(id, body),
    apply: (queue, { id, body }) =>
      applyReturn(queue, id, body.reason as FailureReason),
  });
}

/**
 * The QC answer, and the one verb here that is **not** optimistic.
 *
 * `cooler-check` is only valid once the order is terminal. Firing it against
 * an optimistic `completed` that the server has not written yet returns
 * `409 ORDER_INVALID_TRANSITION`, so this has to wait for its predecessor to
 * resolve. There is nothing to apply early anyway — the prompt appears after
 * the card has already moved.
 */
export function useCoolerCheck(
  date?: string,
): UseMutationResult<MutatedStop, Error, { id: string; confirmed: boolean }, Ctx> {
  return useQueueMutation({
    date,
    mutationFn: ({ id, confirmed }) => coolerCheck(id, { confirmed }),
    apply: (queue, { id, confirmed }) => applyCoolerCheck(queue, id, confirmed),
  });
}

/** The terminal that only went through after the delivery was marked done. */
export function usePayment(
  date?: string,
): UseMutationResult<PaymentResponse, Error, { id: string; body: PaymentBody }, Ctx> {
  return useQueueMutation({
    date,
    mutationFn: ({ id, body }) => collectPayment(id, body),
    apply: (queue, { id }) => applyPayment(queue, id),
  });
}

/* -------------------------------------------------------------------------- */
/* Back at the pharmacy                                                       */
/* -------------------------------------------------------------------------- */

export function useHandover(
  date?: string,
): UseMutationResult<MutatedStop, Error, { id: string }, Ctx> {
  return useQueueMutation({
    date,
    mutationFn: ({ id }) => handoverOrder(id),
    apply: (queue, { id }) => applyHandover(queue, [id]),
  });
}

/**
 * The whole stack. One transaction server-side, so the optimistic update moves
 * all N or — on failure — rolls every one of them back.
 */
export function useBatchHandover(
  date?: string,
): UseMutationResult<BatchHandoverResponse, Error, { ids: string[] }, Ctx> {
  return useQueueMutation({
    date,
    mutationFn: ({ ids }) => handoverReturns({ order_ids: ids }),
    apply: (queue, { ids }) => applyHandover(queue, ids),
  });
}

/* -------------------------------------------------------------------------- */
/* The route                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `orderedIds` must be **every** active stop, Ready and On the way alike. The
 * server nulls `sequence_number` on any active order left out, so a partial
 * list silently unsequences the rest of the day.
 */
export function useSequence(
  date?: string,
): UseMutationResult<QueueResponse, Error, { orderedIds: string[] }, Ctx> {
  return useQueueMutation({
    date,
    mutationFn: ({ orderedIds }) => sequenceQueue({ date, ordered_order_ids: orderedIds }),
    apply: (queue, { orderedIds }) => applySequence(queue, orderedIds),
    replaceWith: (data) => data,
  });
}

export function useOptimize(
  date?: string,
): UseMutationResult<OptimizeResponse, Error, OptimizeBody, Ctx> {
  return useQueueMutation({
    date,
    mutationFn: (body) => optimizeQueue({ ...body, date }),
    // Nothing to predict — the whole point of the call is the order the
    // optimizer picks, and guessing it would mean two visible reorders.
    apply: (queue) => queue,
    replaceWith: (data) => data,
  });
}

/** Escape hatch for callers outside a component (tests, mostly). */
export function invalidateQueue(client: QueryClient, date?: string): Promise<void> {
  return client.invalidateQueries({ queryKey: queueQueryKey(date) });
}
