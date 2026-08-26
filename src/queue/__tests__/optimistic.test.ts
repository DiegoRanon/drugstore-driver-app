/**
 * The cache, one tap ahead of the server.
 *
 * These reducers decide what a driver sees between tapping and the response
 * landing, which makes them the place two things are decided that look like UI
 * but are not:
 *
 * - **When the patient's details leave the device.** PRD §8.1 asks for
 *   eviction on transition, not on the next poll, and `closeStop` is where
 *   that actually happens.
 * - **Where a failed delivery goes.** Into `to_return`, never `closed` — the
 *   pharmacy is still owed the package.
 */
import {
  applyComplete,
  applyCoolerCheck,
  applyHandover,
  applyPayment,
  applyPickup,
  applyPriority,
  applyReturn,
  applySequence,
  sortStops,
} from '../optimistic';
import { isActiveStop } from '@/api/types';
import {
  activeStop,
  queue,
  returnStop,
  terminalStop,
  totals,
} from '@/test-support/queue-fixtures';

const PII_KEYS = ['patient_name', 'address', 'phone_number', 'authorized_recipient'];

describe('applyPickup', () => {
  it('moves the stop from Ready to On the way and stamps the clock', () => {
    const before = queue({ stops: [activeStop({ id: 'a', status: 'in_pharmacy' })] });
    const after = applyPickup(before, 'a');

    const stop = after.stops[0];
    expect(stop?.status).toBe('picked_up');
    expect(stop && isActiveStop(stop) ? stop.picked_up_at : null).not.toBeNull();
  });

  it('leaves the patient details alone — the delivery has not been attempted yet', () => {
    const before = queue({ stops: [activeStop({ id: 'a' })] });
    const stop = applyPickup(before, 'a').stops[0];

    expect(stop && isActiveStop(stop) ? stop.patient_name : null).toBe('Evelyn Harper');
  });
});

describe('applyComplete', () => {
  const before = queue({
    stops: [activeStop({ id: 'a', status: 'picked_up', amount_due: 42.5 })],
    totals: totals({
      stop_count: 1,
      payment_stop_count: 1,
      amount_due_total: 42.5,
      requires_payment_terminal: true,
    }),
  });

  it('moves the stop to Done', () => {
    const after = applyComplete(before, 'a');

    expect(after.stops).toHaveLength(0);
    expect(after.closed.map((stop) => stop.id)).toEqual(['a']);
    expect(after.closed[0]?.status).toBe('completed');
  });

  /**
   * The test this whole module exists for.
   *
   * The server strips these fields, but only on the *next* payload. Between
   * the tap and that payload the app is the only thing holding them, and a
   * spread-then-omit would leave an address behind on the day someone adds a
   * field and forgets the omit list.
   */
  it('drops patient_name, address, and phone_number from the cache immediately', () => {
    const after = applyComplete(before, 'a');
    const closed = after.closed[0]!;

    for (const key of PII_KEYS) {
      expect(Object.hasOwn(closed, key)).toBe(false);
    }
  });

  it('takes the money off the counter banner', () => {
    const after = applyComplete(before, 'a', { amount_collected: 42.5 });

    expect(after.totals.payment_stop_count).toBe(0);
    expect(after.totals.amount_due_total).toBe(0);
    expect(after.totals.requires_payment_terminal).toBe(false);
  });

  it('never lets the running total go negative on a partial collection', () => {
    const after = applyComplete(before, 'a', { amount_collected: 100 });

    expect(after.totals.amount_due_total).toBe(0);
  });
});

describe('applyReturn', () => {
  const before = queue({
    stops: [activeStop({ id: 'a', status: 'picked_up', package_count: 2 })],
    totals: totals({ stop_count: 1, packages_to_return: 0 }),
  });

  it('files the order under À rapporter, not Done', () => {
    const after = applyReturn(before, 'a', 'customer_absent');

    expect(after.to_return.map((stop) => stop.id)).toEqual(['a']);
    expect(after.closed).toHaveLength(0);
    expect(after.to_return[0]?.status).toBe('returned');
  });

  it('keeps the reason and the label codes, and drops the patient', () => {
    const after = applyReturn(before, 'a', 'wrong_address');
    const returned = after.to_return[0]!;

    expect(returned.failure_reason).toBe('wrong_address');
    expect(returned.packages).toHaveLength(1);
    for (const key of PII_KEYS) {
      expect(Object.hasOwn(returned, key)).toBe(false);
    }
  });

  it('adds the parcels to the count owed back at the counter', () => {
    const after = applyReturn(before, 'a', 'customer_absent');

    expect(after.totals.packages_to_return).toBe(2);
  });
});

describe('applyHandover', () => {
  const before = queue({
    to_return: [
      returnStop({ id: 'a', package_count: 1 }),
      returnStop({ id: 'b', package_count: 2 }),
      returnStop({ id: 'c', package_count: 1 }),
    ],
    totals: totals({ packages_to_return: 4 }),
  });

  it('moves one parcel back to the shelf', () => {
    const after = applyHandover(before, ['b']);

    expect(after.to_return.map((stop) => stop.id)).toEqual(['a', 'c']);
    expect(after.closed[0]?.status).toBe('returned_to_pharmacy');
    expect(after.totals.packages_to_return).toBe(2);
  });

  /*
    `POST /v1/driver/returns/handover` runs in one transaction, so a partial
    optimistic result could never match what the server does.
  */
  it('moves the whole stack at once', () => {
    const after = applyHandover(before, ['a', 'b', 'c']);

    expect(after.to_return).toHaveLength(0);
    expect(after.closed).toHaveLength(3);
    expect(after.totals.packages_to_return).toBe(0);
  });

  it('ignores an id that is not owed', () => {
    const after = applyHandover(before, ['nope']);

    expect(after.to_return).toHaveLength(3);
    expect(after.closed).toHaveLength(0);
  });
});

describe('applyPriority', () => {
  /**
   * The server sorts `is_priority DESC` ahead of `sequence_number`, so a stop
   * flagged at position 3 is at position 1 on the next payload. Reproducing
   * that here is the difference between the card moving under the driver's
   * thumb and it jumping on its own thirty seconds later.
   */
  it('reorders locally the way the server will', () => {
    const before = queue({
      stops: [
        activeStop({ id: 'a', status: 'picked_up', sequence_number: 1 }),
        activeStop({ id: 'b', status: 'picked_up', sequence_number: 2 }),
        activeStop({ id: 'c', status: 'picked_up', sequence_number: 3 }),
      ],
    });

    const after = applyPriority(before, 'c', true);

    expect(after.stops.map((stop) => stop.id)).toEqual(['c', 'a', 'b']);
    expect(after.totals.priority_count).toBe(1);
  });

  it('puts a stop back in sequence when the flag is cleared', () => {
    const before = queue({
      stops: [
        activeStop({ id: 'c', status: 'picked_up', sequence_number: 3, is_priority: true }),
        activeStop({ id: 'a', status: 'picked_up', sequence_number: 1 }),
      ],
    });

    const after = applyPriority(before, 'c', false);

    expect(after.stops.map((stop) => stop.id)).toEqual(['a', 'c']);
    expect(after.totals.priority_count).toBe(0);
  });
});

describe('applySequence', () => {
  it('numbers the list from one', () => {
    const before = queue({
      stops: [
        activeStop({ id: 'a', status: 'picked_up' }),
        activeStop({ id: 'b', status: 'picked_up' }),
      ],
    });

    const after = applySequence(before, ['b', 'a']);
    const numbers = after.stops.map((stop) =>
      isActiveStop(stop) ? stop.sequence_number : null,
    );

    expect(after.stops.map((stop) => stop.id)).toEqual(['b', 'a']);
    expect(numbers).toEqual([1, 2]);
  });

  /*
    The server nulls `sequence_number` on any active order missing from
    `ordered_order_ids`. Mirroring that here means the driver sees the cost of
    a partial save immediately rather than after a refetch — and the reorder
    sheet is built to never send one.
  */
  it('clears the sequence of a stop left out of the list', () => {
    const before = queue({
      stops: [
        activeStop({ id: 'a', status: 'picked_up', sequence_number: 1 }),
        activeStop({ id: 'b', status: 'picked_up', sequence_number: 2 }),
      ],
    });

    const after = applySequence(before, ['a']);
    const dropped = after.stops.find((stop) => stop.id === 'b');

    expect(dropped && isActiveStop(dropped) ? dropped.sequence_number : 0).toBeNull();
  });

  it('snaps a priority stop back to the front, exactly as the server will', () => {
    const before = queue({
      stops: [
        activeStop({ id: 'p', status: 'picked_up', is_priority: true }),
        activeStop({ id: 'a', status: 'picked_up' }),
      ],
    });

    // The driver drags the ordinary stop above the priority one.
    const after = applySequence(before, ['a', 'p']);

    expect(after.stops.map((stop) => stop.id)).toEqual(['p', 'a']);
  });
});

describe('applyCoolerCheck', () => {
  it('answers the QC question on a stop in either closed bucket', () => {
    const before = queue({
      to_return: [returnStop({ id: 'a', requires_cooler_bag: true })],
      closed: [terminalStop({ id: 'b', requires_cooler_bag: true })],
    });

    expect(applyCoolerCheck(before, 'a', true).to_return[0]?.cooler_bag_confirmed).toBe(
      true,
    );
    expect(applyCoolerCheck(before, 'b', false).closed[0]?.cooler_bag_confirmed).toBe(
      false,
    );
  });
});

describe('applyPayment', () => {
  it('marks a stop paid without moving it', () => {
    const before = queue({
      stops: [activeStop({ id: 'a', status: 'picked_up', amount_due: 12 })],
    });

    const stop = applyPayment(before, 'a').stops[0];

    expect(stop && isActiveStop(stop) ? stop.payment_collected : false).toBe(true);
    expect(stop && isActiveStop(stop) ? stop.payment_status : null).toBe('paid');
  });
});

describe('sortStops', () => {
  it('puts nulls last, so an unsequenced arrival does not jump the queue', () => {
    const sorted = sortStops([
      activeStop({ id: 'none', sequence_number: null }),
      activeStop({ id: 'two', sequence_number: 2 }),
      activeStop({ id: 'one', sequence_number: 1 }),
    ]);

    expect(sorted.map((stop) => stop.id)).toEqual(['one', 'two', 'none']);
  });

  it('is stable for stops the server gave the same position', () => {
    const sorted = sortStops([
      activeStop({ id: 'a', sequence_number: null }),
      activeStop({ id: 'b', sequence_number: null }),
      activeStop({ id: 'c', sequence_number: null }),
    ]);

    expect(sorted.map((stop) => stop.id)).toEqual(['a', 'b', 'c']);
  });
});
