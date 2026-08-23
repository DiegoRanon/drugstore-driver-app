/**
 * Splitting one queue payload into the three pages.
 *
 * The split is the only place the app decides what belongs on which screen, so
 * it is also the only place a completed delivery could wrongly land on a page
 * that renders addresses.
 */
import { splitQueue } from '../use-queue';
import type { QueueResponse } from '@/api/types';

function activeStop(overrides: Partial<QueueResponse['stops'][number]> = {}) {
  return {
    id: 'active-1',
    status: 'in_pharmacy',
    sequence_number: null,
    delivery_date: '2026-08-22',
    delivery_window: 'AM',
    patient_name: 'Evelyn Harper',
    address: '4210 Willow Creek Dr',
    phone_number: '+15145550142',
    amount_due: null,
    payment_status: 'unpaid',
    payment_collected: false,
    requires_cooler_bag: false,
    picked_up_at: null,
    ...overrides,
  } as QueueResponse['stops'][number];
}

function closedStop(id: string, status: 'completed' | 'returned' | 'cancelled') {
  return {
    id,
    status,
    delivery_date: '2026-08-22',
    picked_up_at: null,
    completed_at: null,
    returned_at: null,
    requires_cooler_bag: false,
    cooler_bag_confirmed: null,
  } as QueueResponse['closed'][number];
}

function queue(overrides: Partial<QueueResponse> = {}): QueueResponse {
  return {
    date: '2026-08-22',
    pharmacy: { name: 'Pharmacie Saint-Laurent', phone: null },
    stops: [],
    closed: [],
    ...overrides,
  } as QueueResponse;
}

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

    expect(slices.ready.map((s) => s.id)).toEqual(['a', 'c']);
    expect(slices.onTheWay.map((s) => s.id)).toEqual(['b']);
  });

  it('puts completed, returned, and cancelled together under Done', () => {
    const slices = splitQueue(
      queue({
        closed: [
          closedStop('x', 'completed'),
          closedStop('y', 'returned'),
          closedStop('z', 'cancelled'),
        ],
      }),
    );

    // Cancelled is terminal too — a driver needs to see it disappear from
    // their run, not wonder where it went.
    expect(slices.done.map((s) => s.id)).toEqual(['x', 'y', 'z']);
    expect(slices.counts.done).toBe(3);
  });

  it('keeps the server order instead of re-sorting', () => {
    // Sequence numbers deliberately out of ascending order: the server decided
    // this, and re-sorting would put the driver's screen and the pharmacist's
    // dashboard into disagreement (PRD §3.1).
    const slices = splitQueue(
      queue({
        stops: [
          activeStop({ id: 'third', sequence_number: 7 }),
          activeStop({ id: 'first', sequence_number: 2 }),
          activeStop({ id: 'second', sequence_number: 5 }),
        ],
      }),
    );

    expect(slices.ready.map((s) => s.id)).toEqual(['third', 'first', 'second']);
  });

  it('counts each tab for the badges', () => {
    const slices = splitQueue(
      queue({
        stops: [
          activeStop({ id: 'a', status: 'in_pharmacy' }),
          activeStop({ id: 'b', status: 'in_pharmacy' }),
          activeStop({ id: 'c', status: 'picked_up' }),
        ],
        closed: [closedStop('x', 'completed'), closedStop('y', 'returned')],
      }),
    );

    expect(slices.counts).toEqual({ ready: 2, on_the_way: 1, done: 2 });
  });

  it('never lets a terminal order reach a page that renders addresses', () => {
    // The server puts terminal orders in `closed`, but the `stops` array is
    // typed as the union and nothing stops it carrying one. If that happens it
    // must fall out of both active slices rather than be rendered as a stop
    // with a missing address.
    const slices = splitQueue(
      queue({
        stops: [
          activeStop({ id: 'live' }),
          closedStop('sneaky', 'completed') as QueueResponse['stops'][number],
        ],
      }),
    );

    expect(slices.ready.map((s) => s.id)).toEqual(['live']);
    expect(slices.onTheWay).toHaveLength(0);
  });

  it('returns empty slices before the first response, so pages render an empty state', () => {
    const slices = splitQueue(undefined);

    expect(slices.ready).toHaveLength(0);
    expect(slices.counts).toEqual({ ready: 0, on_the_way: 0, done: 0 });
  });
});
