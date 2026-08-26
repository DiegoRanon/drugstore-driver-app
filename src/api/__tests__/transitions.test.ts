/**
 * The mirror of the server's state machine.
 *
 * `available_transitions` is on the admin `orderResponse` only — no driver
 * payload carries it — so the app has to hold this table itself. That makes
 * drift the risk, and these cases are the cheap half of guarding against it:
 * they pin the table against `drugstore-server/docs/delivery-workflow.md`.
 * The expensive half is `live-server-transitions.test.ts`, which walks a real
 * order through every state.
 */
import { allows, driverTransitions } from '../transitions';

describe('driverTransitions', () => {
  it('offers pickup, and only pickup, at the counter', () => {
    expect(driverTransitions('in_pharmacy')).toEqual(['pickup']);
  });

  it('offers complete and return once the package is in the van', () => {
    expect([...driverTransitions('picked_up')].sort()).toEqual(['complete', 'return']);
  });

  /*
    The case the whole return leg exists for. `returned` is not terminal — the
    pharmacy has not taken the package back — so exactly one thing can still
    happen to it, and if this ever answers `[]` the order becomes unreachable
    from the app and the parcel lives in the van forever.
  */
  it('offers handover, and only handover, on a failed delivery', () => {
    expect(driverTransitions('returned')).toEqual(['handover']);
  });

  it.each(['completed', 'returned_to_pharmacy', 'cancelled'] as const)(
    'offers nothing on %s — a second attempt is a new order, never a reopened one',
    (status) => {
      expect(driverTransitions(status)).toEqual([]);
    },
  );

  it('never offers an admin verb', () => {
    const everything = (
      [
        'in_pharmacy',
        'picked_up',
        'returned',
        'completed',
        'returned_to_pharmacy',
        'cancelled',
      ] as const
    ).flatMap((status) => [...driverTransitions(status)]);

    expect(everything).not.toContain('mark_ready');
    expect(everything).not.toContain('cancel');
  });
});

describe('allows', () => {
  it('agrees with the table', () => {
    expect(allows('picked_up', 'complete')).toBe(true);
    expect(allows('picked_up', 'handover')).toBe(false);
    expect(allows('returned', 'handover')).toBe(true);
    expect(allows('completed', 'complete')).toBe(false);
  });
});
