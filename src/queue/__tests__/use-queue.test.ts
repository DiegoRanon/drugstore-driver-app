/**
 * Splitting one queue payload into the four pages.
 *
 * The split is the only place the app decides what belongs on which screen, so
 * it is also the only place a closed delivery could wrongly land on a page
 * that renders addresses — and, since the lifecycle grew a return leg, the
 * only place an order the pharmacy is still owed could be filed as finished.
 *
 * Every payload here comes from `@/test-support/queue-fixtures`, which builds
 * complete rows with no `as` casts. The casts this file used to carry kept
 * compiling after the server added `to_return` and `totals`, and failed at
 * runtime instead.
 */
import { splitQueue } from '../use-queue';
import {
  activeStop,
  queue,
  returnStop,
  terminalStop,
  totals,
} from '@/test-support/queue-fixtures';

describe('splitQueue', () => {
  it('sends in_pharmacy to Ready and picked_up to On the way', () => {
    const slices = splitQueue(
      queue({
        stops: [
          activeStop({ id: 'a', status: 'in_pharmacy' }),
          activeStop({ id: 'b', status: 'picked_up' }),
          activeStop({ id: 'c', status: 'in_pharmacy' }),
        ],
      }),
    );

    expect(slices.ready.map((stop) => stop.id)).toEqual(['a', 'c']);
    expect(slices.onTheWay.map((stop) => stop.id)).toEqual(['b']);
  });

  it('files a returned order under À rapporter, not Done', () => {
    const slices = splitQueue(
      queue({
        to_return: [returnStop({ id: 'owed' })],
        closed: [terminalStop({ id: 'delivered', status: 'completed' })],
      }),
    );

    expect(slices.toHandBack.map((stop) => stop.id)).toEqual(['owed']);
    expect(slices.done.map((stop) => stop.id)).toEqual(['delivered']);
  });

  it('puts completed, handed back, and cancelled together under Done', () => {
    const slices = splitQueue(
      queue({
        closed: [
          terminalStop({ id: 'x', status: 'completed' }),
          terminalStop({ id: 'y', status: 'returned_to_pharmacy' }),
          terminalStop({ id: 'z', status: 'cancelled' }),
        ],
      }),
    );

    expect(slices.done.map((stop) => stop.id)).toEqual(['x', 'y', 'z']);
  });

  /*
    `to_return` and `closed` are the same schema server-side, and its `status`
    enum is the full closed set. Only the bucket says what a row means, so the
    split filters rather than trusting the array it arrived in — a mis-bucketed
    row becomes an omission instead of a card reading `returned_to_pharmacy_at`
    off something that has none.
  */
  it('drops a still-open return that arrived in the closed bucket', () => {
    const slices = splitQueue(
      queue({ closed: [returnStop({ id: 'misfiled' })] }),
    );

    expect(slices.done).toHaveLength(0);
  });

  it('drops a finished order that arrived in the hand-back bucket', () => {
    const slices = splitQueue(
      queue({ to_return: [terminalStop({ id: 'misfiled', status: 'completed' })] }),
    );

    expect(slices.toHandBack).toHaveLength(0);
  });

  it('keeps the server order instead of re-sorting', () => {
    // Priority first, then sequence — the order the server sends and the order
    // the pharmacist's dashboard shows. Re-sorting here would put the two
    // screens into disagreement (PRD §3.1).
    const slices = splitQueue(
      queue({
        stops: [
          activeStop({ id: 'third', status: 'picked_up', sequence_number: 3 }),
          activeStop({ id: 'first', status: 'picked_up', sequence_number: 1 }),
          activeStop({ id: 'second', status: 'picked_up', sequence_number: 2 }),
        ],
      }),
    );

    expect(slices.onTheWay.map((stop) => stop.id)).toEqual([
      'third',
      'first',
      'second',
    ]);
  });

  it('counts each tab for the badges', () => {
    const slices = splitQueue(
      queue({
        stops: [
          activeStop({ id: 'a', status: 'in_pharmacy' }),
          activeStop({ id: 'b', status: 'picked_up' }),
          activeStop({ id: 'c', status: 'picked_up' }),
        ],
        to_return: [returnStop({ id: 'd' })],
        closed: [
          terminalStop({ id: 'e', status: 'completed' }),
          terminalStop({ id: 'f', status: 'cancelled' }),
        ],
      }),
    );

    expect(slices.counts).toEqual({
      ready: 1,
      on_the_way: 2,
      to_hand_back: 1,
      done: 2,
    });
  });

  it('carries the totals and pharmacy through, for the counter banners', () => {
    const slices = splitQueue(
      queue({
        totals: totals({
          requires_payment_terminal: true,
          payment_stop_count: 2,
          amount_due_total: 61.25,
          packages_to_return: 3,
        }),
      }),
    );

    expect(slices.totals?.requires_payment_terminal).toBe(true);
    expect(slices.totals?.amount_due_total).toBe(61.25);
    expect(slices.pharmacy?.return_deadline).toBe('18:00:00');
  });

  /**
   * The one that matters most.
   *
   * `stops` is typed as the union, so nothing stops the server from putting a
   * closed row in it. If one reached Ready or On the way, those screens would
   * read `patient_name` off a payload that has no such key.
   */
  it('never lets a closed order reach a page that renders addresses', () => {
    const slices = splitQueue(
      queue({
        stops: [
          activeStop({ id: 'real', status: 'in_pharmacy' }),
          terminalStop({ id: 'sneaky', status: 'completed' }),
        ],
      }),
    );

    expect(slices.ready.map((stop) => stop.id)).toEqual(['real']);
    expect(slices.onTheWay).toHaveLength(0);
    for (const stop of [...slices.ready, ...slices.onTheWay]) {
      expect(stop.patient_name).toBeDefined();
    }
  });

  it('returns empty slices before the first response, so pages render an empty state', () => {
    const slices = splitQueue(undefined);

    expect(slices.ready).toEqual([]);
    expect(slices.onTheWay).toEqual([]);
    expect(slices.toHandBack).toEqual([]);
    expect(slices.done).toEqual([]);
    expect(slices.totals).toBeNull();
    expect(slices.counts).toEqual({
      ready: 0,
      on_the_way: 0,
      to_hand_back: 0,
      done: 0,
    });
  });
});
