/**
 * Noticing new work without crying wolf.
 *
 * There is no push channel, so a 30-second poll is the only way a driver finds
 * out that the pharmacy added an order mid-shift. That makes two failure modes
 * expensive in opposite directions: staying silent means a package sits at the
 * counter all afternoon, and alerting on anything that merely *looks* new — a
 * cold start, a pull-to-refresh, a new day — teaches the driver to ignore the
 * banner, which is the same as staying silent.
 */
import {
  INITIAL_SHIFT_ALERTS,
  acknowledgeShiftAlerts,
  reduceShiftAlerts,
} from '../shift-alerts';
import type { QueueResponse } from '@/api/types';

type Stop = QueueResponse['stops'][number];

function stop(id: string, status: 'in_pharmacy' | 'picked_up' = 'in_pharmacy'): Stop {
  return {
    id,
    status,
    sequence_number: null,
    delivery_date: '2026-08-23',
    delivery_window: 'AM',
    patient_name: 'Evelyn Harper',
    address: '4210 Willow Creek Dr',
    phone_number: '+15145550142',
    amount_due: null,
    payment_status: 'unpaid',
    payment_collected: false,
    requires_cooler_bag: false,
    picked_up_at: null,
  } as Stop;
}

function closed(id: string): QueueResponse['closed'][number] {
  return {
    id,
    status: 'completed',
    delivery_date: '2026-08-23',
    picked_up_at: null,
    completed_at: null,
    returned_at: null,
    requires_cooler_bag: false,
    cooler_bag_confirmed: null,
  } as QueueResponse['closed'][number];
}

function queue(stops: Stop[], rest: Partial<QueueResponse> = {}): QueueResponse {
  return {
    date: '2026-08-23',
    pharmacy: { name: 'Pharmacie Saint-Laurent', phone: null },
    stops,
    closed: [],
    ...rest,
  } as QueueResponse;
}

/** Ids waiting at the counter that the driver has not acknowledged. */
function pending(state: { pending: ReadonlySet<string> }): string[] {
  return [...state.pending].sort();
}

describe('the first payload', () => {
  it('is a baseline, not an alert — a cold start must be silent', () => {
    const state = reduceShiftAlerts(
      INITIAL_SHIFT_ALERTS,
      queue([stop('a'), stop('b'), stop('c')]),
    );

    expect(pending(state)).toEqual([]);
  });

  it(`counts today's finished deliveries as seen too`, () => {
    // Otherwise an order that was delivered this morning reads as a fresh
    // arrival the first time it turns up in `stops` rather than `closed`.
    let state = reduceShiftAlerts(
      INITIAL_SHIFT_ALERTS,
      queue([], { closed: [closed('done-1')] }),
    );
    state = reduceShiftAlerts(state, queue([stop('done-1')], { closed: [] }));

    expect(pending(state)).toEqual([]);
  });
});

describe('an order added after the baseline', () => {
  it('is raised when it is waiting at the counter', () => {
    let state = reduceShiftAlerts(INITIAL_SHIFT_ALERTS, queue([stop('a')]));
    state = reduceShiftAlerts(state, queue([stop('a'), stop('late')]));

    expect(pending(state)).toEqual(['late']);
  });

  it('is not raised when it arrives already in the van', () => {
    // Only a package the driver has to physically collect is worth a trip
    // back to the pharmacy.
    let state = reduceShiftAlerts(INITIAL_SHIFT_ALERTS, queue([stop('a')]));
    state = reduceShiftAlerts(state, queue([stop('a'), stop('moved', 'picked_up')]));

    expect(pending(state)).toEqual([]);
  });

  it('stops being raised once the driver takes it in charge', () => {
    let state = reduceShiftAlerts(INITIAL_SHIFT_ALERTS, queue([stop('a')]));
    state = reduceShiftAlerts(state, queue([stop('a'), stop('late')]));
    expect(pending(state)).toEqual(['late']);

    state = reduceShiftAlerts(state, queue([stop('a'), stop('late', 'picked_up')]));
    expect(pending(state)).toEqual([]);
  });

  it('keeps being raised across polls until it is acknowledged', () => {
    let state = reduceShiftAlerts(INITIAL_SHIFT_ALERTS, queue([stop('a')]));
    state = reduceShiftAlerts(state, queue([stop('a'), stop('late')]));
    // Three more identical polls — a banner that vanishes on its own is worse
    // than no banner.
    state = reduceShiftAlerts(state, queue([stop('a'), stop('late')]));
    state = reduceShiftAlerts(state, queue([stop('a'), stop('late')]));

    expect(pending(state)).toEqual(['late']);
  });
});

describe('acknowledging', () => {
  it('clears the banner', () => {
    let state = reduceShiftAlerts(INITIAL_SHIFT_ALERTS, queue([stop('a')]));
    state = reduceShiftAlerts(state, queue([stop('a'), stop('late')]));

    expect(pending(acknowledgeShiftAlerts(state))).toEqual([]);
  });

  it('does not let the same order come back on the next poll', () => {
    let state = reduceShiftAlerts(INITIAL_SHIFT_ALERTS, queue([stop('a')]));
    state = reduceShiftAlerts(state, queue([stop('a'), stop('late')]));
    state = acknowledgeShiftAlerts(state);
    state = reduceShiftAlerts(state, queue([stop('a'), stop('late')]));

    expect(pending(state)).toEqual([]);
  });

  it('still raises the next arrival', () => {
    let state = reduceShiftAlerts(INITIAL_SHIFT_ALERTS, queue([stop('a')]));
    state = reduceShiftAlerts(state, queue([stop('a'), stop('late')]));
    state = acknowledgeShiftAlerts(state);
    state = reduceShiftAlerts(state, queue([stop('a'), stop('late'), stop('later')]));

    expect(pending(state)).toEqual(['later']);
  });

  it('is a no-op when there is nothing to acknowledge', () => {
    const state = reduceShiftAlerts(INITIAL_SHIFT_ALERTS, queue([stop('a')]));

    expect(acknowledgeShiftAlerts(state)).toBe(state);
  });
});

describe('a new day', () => {
  it('re-seeds silently instead of alerting on every order', () => {
    // Yesterday's baseline says nothing about today's run, and firing an alert
    // for all fifteen of tomorrow's orders is the same as firing none.
    let state = reduceShiftAlerts(INITIAL_SHIFT_ALERTS, queue([stop('a'), stop('b')]));
    state = reduceShiftAlerts(
      state,
      queue([stop('x'), stop('y')], { date: '2026-08-24' }),
    );

    expect(pending(state)).toEqual([]);
    expect(state.date).toBe('2026-08-24');
  });
});

describe('an unchanged poll', () => {
  it('returns the very same state, so the screens do not re-render', () => {
    // Thirty seconds is 120 renders an hour of two transparent, blurred glass
    // screens on a phone that is also running navigation.
    const first = reduceShiftAlerts(INITIAL_SHIFT_ALERTS, queue([stop('a')]));
    const second = reduceShiftAlerts(first, queue([stop('a')]));

    expect(second).toBe(first);
  });
});
