/**
 * What a driver may do to an order in a given state.
 *
 * This mirrors `medibus-server/src/modules/orders/stateMachine.ts`, and it
 * lives in `src/api/` rather than in a component because it is *contract* —
 * the same kind of thing as a request body — not presentation.
 *
 * The app has to own this table. `available_transitions` exists on the server
 * but only on the admin `orderResponse`; no driver payload carries it, so
 * there is nothing to render buttons from. The mirror is the cost of that, and
 * `src/api/__tests__/live-server-transitions.test.ts` is what stops it
 * drifting: it walks a real order through every state and asserts that each
 * transition this table offers succeeds and each one it withholds is refused.
 *
 * `mark_ready` and `cancel` are absent because they are admin verbs. So is
 * `scheduled`, which no driver can ever observe — the repository excludes
 * those rows, so a pre-assigned order answers 404 rather than 409, and there
 * is no state for a client to render.
 */
import type { StopStatus } from './types';

export type DriverTransition = 'pickup' | 'complete' | 'return' | 'handover';

const BY_STATUS = {
  in_pharmacy: ['pickup'],
  picked_up: ['complete', 'return'],
  /*
    Not terminal. The delivery failed and the package is in the van, so the
    driver still owes the pharmacy a handover — which is the whole reason
    `returned` sits outside both TERMINAL_STATUSES and ACTIVE_STATUSES on the
    server.
  */
  returned: ['handover'],
  completed: [],
  returned_to_pharmacy: [],
  cancelled: [],
} as const satisfies Record<StopStatus, readonly DriverTransition[]>;

/**
 * `satisfies Record<StopStatus, …>` above is load-bearing: a status the server
 * adds fails the build here, rather than falling through to `undefined` and
 * rendering a stop with no actions at all.
 */
export function driverTransitions(status: StopStatus): readonly DriverTransition[] {
  return BY_STATUS[status];
}

export function allows(status: StopStatus, transition: DriverTransition): boolean {
  return (BY_STATUS[status] as readonly DriverTransition[]).includes(transition);
}
