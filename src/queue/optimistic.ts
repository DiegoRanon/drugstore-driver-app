/**
 * What the queue looks like the instant a driver taps, before the server
 * answers.
 *
 * Pure functions over one `QueueResponse`, so every one of them is testable
 * without a network, a cache, or a component. `mutations.ts` is the only
 * caller; it snapshots, applies one of these, and restores the snapshot if the
 * write fails.
 *
 * Two rules run through all of them:
 *
 * 1. **Closing a stop drops its PII.** `closeStop` builds the closed row by
 *    naming the keys that survive, so `patient_name`, `address`,
 *    `phone_number`, and `authorized_recipient` leave the cache at the tap
 *    rather than on the next poll. PRD §8.1 asks for eviction on transition;
 *    this is where it actually happens.
 * 2. **Buckets are re-sorted the way the server sorts them.** A stop that
 *    would land in a different position after the next refetch has to land
 *    there now, or the list visibly rearranges itself a second later.
 */
import {
  isActiveStop,
  type ActiveStop,
  type ClosedStop,
  type FailureReason,
  type QueueResponse,
  type ReturnStop,
  type TerminalStop,
} from '@/api/types';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The server's ordering for `stops`: `is_priority DESC, sequence_number ASC
 * NULLS LAST, created_at ASC`.
 *
 * The driver payload carries no `created_at`, so the array position the server
 * sent stands in for it — which is correct, because that position *was* the
 * server's `created_at` order.
 */
export function sortStops(stops: ActiveStop[]): ActiveStop[] {
  return stops
    .map((stop, index) => ({ stop, index }))
    .sort((a, b) => {
      if (a.stop.is_priority !== b.stop.is_priority) {
        return a.stop.is_priority ? -1 : 1;
      }
      const left = a.stop.sequence_number;
      const right = b.stop.sequence_number;
      if (left !== right) {
        if (left === null) return 1;
        if (right === null) return -1;
        return left - right;
      }
      return a.index - b.index;
    })
    .map(({ stop }) => stop);
}

type ClosePatch = {
  status: ClosedStop['status'];
  failure_reason?: FailureReason | null;
  completed_at?: string | null;
  returned_at?: string | null;
};

/**
 * Turn an active stop into the closed row the server would send back.
 *
 * The keys are listed rather than spread-and-deleted on purpose. A spread with
 * an omit list is one forgotten field away from leaving an address in the
 * cache, and the `ClosedStop` type would not catch it — excess properties only
 * error on a literal, which this then would not be.
 */
function closeStop(stop: ActiveStop, patch: ClosePatch): ClosedStop {
  return {
    id: stop.id,
    status: patch.status,
    delivery_date: stop.delivery_date,
    failure_reason: patch.failure_reason ?? null,
    requires_cooler_bag: stop.requires_cooler_bag,
    cooler_bag_confirmed: null,
    packages: stop.packages,
    package_count: stop.package_count,
    picked_up_at: stop.picked_up_at,
    completed_at: patch.completed_at ?? null,
    returned_at: patch.returned_at ?? null,
    returned_to_pharmacy_at: null,
  };
}

function withStops(queue: QueueResponse, stops: QueueResponse['stops']): QueueResponse {
  return { ...queue, stops };
}

/** `stops` is the union type, so pulling an active row out needs a narrowing. */
function findActive(queue: QueueResponse, id: string): ActiveStop | undefined {
  for (const stop of queue.stops) {
    if (stop.id === id && isActiveStop(stop)) return stop;
  }
  return undefined;
}

/**
 * Split `stops` into the branch that can be reordered and everything else.
 *
 * In practice the server only ever puts active rows in `stops`, but the
 * *schema* is the union, and a reducer that assumed otherwise would drop rows
 * on the day that stops being true.
 */
function partitionStops(queue: QueueResponse): {
  active: ActiveStop[];
  rest: QueueResponse['stops'];
} {
  const active: ActiveStop[] = [];
  const rest: QueueResponse['stops'] = [];
  for (const stop of queue.stops) {
    if (isActiveStop(stop)) active.push(stop);
    else rest.push(stop);
  }
  return { active, rest };
}

function withoutStop(queue: QueueResponse, id: string): QueueResponse['stops'] {
  return queue.stops.filter((stop) => stop.id !== id);
}

/* -------------------------------------------------------------------------- */
/* The verbs                                                                  */
/* -------------------------------------------------------------------------- */

/** Ready → On the way. Stays in `stops`; only the status and the clock move. */
export function applyPickup(queue: QueueResponse, id: string): QueueResponse {
  const now = new Date().toISOString();
  const stops = queue.stops.map((stop) =>
    stop.id === id && isActiveStop(stop)
      ? { ...stop, status: 'picked_up' as const, picked_up_at: now }
      : stop,
  );
  return withStops(queue, stops);
}

/**
 * On the way → Done, and the patient's details leave the device.
 *
 * `payment` is folded in so the Done card can show the collection without
 * waiting for a refetch, and `totals` drops the stop from the amount still to
 * collect — a driver who has just been paid should not still see the money
 * owed on the counter banner.
 */
export function applyComplete(
  queue: QueueResponse,
  id: string,
  paid?: { amount_collected: number },
): QueueResponse {
  const stop = findActive(queue, id);
  if (!stop) return queue;

  const closed = closeStop(stop, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  });

  return {
    ...queue,
    stops: withoutStop(queue, id),
    closed: [closed, ...queue.closed],
    totals: settleTotals(queue, stop, paid?.amount_collected),
  };
}

/**
 * On the way → À rapporter. Not Done.
 *
 * The package is in the van and the pharmacy is owed a handover, so this lands
 * in `to_return` and bumps `packages_to_return`. Putting it in `closed` would
 * be the exact bug the server's four separate status sets exist to prevent.
 */
export function applyReturn(
  queue: QueueResponse,
  id: string,
  reason: FailureReason,
): QueueResponse {
  const stop = findActive(queue, id);
  if (!stop) return queue;

  const returned = closeStop(stop, {
    status: 'returned',
    failure_reason: reason,
    returned_at: new Date().toISOString(),
  }) as ReturnStop;

  return {
    ...queue,
    stops: withoutStop(queue, id),
    to_return: [...queue.to_return, returned],
    totals: {
      ...settleTotals(queue, stop),
      packages_to_return: queue.totals.packages_to_return + stop.package_count,
    },
  };
}

/** À rapporter → Done. Accepts a batch because the endpoint is all-or-nothing. */
export function applyHandover(queue: QueueResponse, ids: string[]): QueueResponse {
  const wanted = new Set(ids);
  const now = new Date().toISOString();

  const handed: TerminalStop[] = [];
  const staying: ClosedStop[] = [];
  let packages = 0;

  for (const stop of queue.to_return) {
    if (!wanted.has(stop.id)) {
      staying.push(stop);
      continue;
    }
    packages += stop.package_count;
    handed.push({
      ...stop,
      status: 'returned_to_pharmacy',
      returned_to_pharmacy_at: now,
    });
  }

  return {
    ...queue,
    to_return: staying,
    closed: [...handed, ...queue.closed],
    totals: {
      ...queue.totals,
      packages_to_return: Math.max(0, queue.totals.packages_to_return - packages),
    },
  };
}

/**
 * The employee said this one goes first.
 *
 * Re-sorts immediately, because the server will: priority beats
 * `sequence_number` in its comparator, so without this the card jumps to the
 * top on the next poll instead of on the tap.
 */
export function applyPriority(
  queue: QueueResponse,
  id: string,
  isPriority: boolean,
): QueueResponse {
  const stops = queue.stops.map((stop) =>
    stop.id === id && isActiveStop(stop)
      ? { ...stop, is_priority: isPriority }
      : stop,
  );

  const { active, rest } = partitionStops(withStops(queue, stops));

  return {
    ...queue,
    stops: [...sortStops(active), ...rest],
    totals: {
      ...queue.totals,
      priority_count: active.filter((stop) => stop.is_priority).length,
    },
  };
}

/**
 * The driver's hand-picked order.
 *
 * Numbers every id in the list from 1, clears the sequence of anything not in
 * it — matching what the server does — then applies the server's comparator,
 * which is what makes a stop dragged above a priority one snap back *here*,
 * silently, rather than a second later on screen.
 */
export function applySequence(queue: QueueResponse, orderedIds: string[]): QueueResponse {
  const position = new Map(orderedIds.map((id, index) => [id, index + 1]));
  const { active, rest } = partitionStops(queue);

  const sequenced = active.map((stop) => ({
    ...stop,
    sequence_number: position.get(stop.id) ?? null,
  }));

  return { ...queue, stops: [...sortStops(sequenced), ...rest] };
}

/** The QC answer. Only ever reaches a row that is already closed. */
export function applyCoolerCheck(
  queue: QueueResponse,
  id: string,
  confirmed: boolean,
): QueueResponse {
  const mark = <T extends ClosedStop>(stop: T): T =>
    stop.id === id ? { ...stop, cooler_bag_confirmed: confirmed } : stop;

  return {
    ...queue,
    to_return: queue.to_return.map(mark),
    closed: queue.closed.map(mark),
  };
}

/** A collection recorded after the fact, against an order already completed. */
export function applyPayment(queue: QueueResponse, id: string): QueueResponse {
  const stops = queue.stops.map((stop) =>
    stop.id === id && isActiveStop(stop)
      ? { ...stop, payment_collected: true, payment_status: 'paid' as const }
      : stop,
  );
  return withStops(queue, stops);
}

/* -------------------------------------------------------------------------- */

/**
 * Take a stop out of the "still to collect" totals.
 *
 * Rounded to cents because the running total is built from floats, and a
 * driver reading "0.009999 $ to collect" on the counter banner would be
 * reasonable to distrust the whole screen.
 */
function settleTotals(
  queue: QueueResponse,
  stop: ActiveStop,
  collected?: number,
): QueueResponse['totals'] {
  const owed =
    !stop.payment_collected &&
    stop.payment_status === 'unpaid' &&
    stop.amount_due !== null &&
    stop.amount_due > 0;

  if (!owed) {
    return { ...queue.totals, stop_count: Math.max(0, queue.totals.stop_count - 1) };
  }

  const remainingStops = Math.max(0, queue.totals.payment_stop_count - 1);
  const remainingAmount =
    Math.round((queue.totals.amount_due_total - (collected ?? stop.amount_due ?? 0)) * 100) /
    100;

  return {
    ...queue.totals,
    stop_count: Math.max(0, queue.totals.stop_count - 1),
    payment_stop_count: remainingStops,
    amount_due_total: Math.max(0, remainingAmount),
    requires_payment_terminal: remainingStops > 0,
  };
}
