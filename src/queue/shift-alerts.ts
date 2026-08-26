/**
 * Noticing that the day changed under the driver.
 *
 * The workflow this app serves has two moments where the pharmacy pushes work
 * at a driver who is not looking at their phone: the morning assignment, and
 * orders added mid-shift while the driver is already out. In both the pharmacy
 * expects the driver to be *told* — "le livreur reçoit une notification" — and
 * for the mid-shift case to decide for themselves when to swing back to the
 * counter (`domain_workflow.md`, §En route).
 *
 * There is no push channel on the server, so the poll is what we have. This
 * module is the part that turns a payload that is merely *different* into the
 * two facts a driver acts on: how many packages appeared at the counter, and
 * whether that happened while they already had a van full of deliveries.
 *
 * It is deliberately pure and holds nothing but order ids — no names, no
 * addresses. Alerts are counts, and a count is not PII (PRD §8.1).
 */
import type { QueueResponse } from '@/api/types';

export type ShiftAlertsState = {
  /** The day the baseline belongs to. A new day is a new run, not new orders. */
  readonly date: string | null;
  /**
   * Every stop id the driver has already been shown, active or closed.
   * `null` means no payload has arrived yet, which is the one state that must
   * never alert.
   */
  readonly seen: ReadonlySet<string> | null;
  /** Ids that appeared at the counter and the driver has not acknowledged. */
  readonly pending: ReadonlySet<string>;
};

export const INITIAL_SHIFT_ALERTS: ShiftAlertsState = {
  date: null,
  seen: null,
  pending: new Set(),
};

function idsOf(queue: QueueResponse): Set<string> {
  const ids = new Set<string>();
  for (const stop of queue.stops) ids.add(stop.id);
  // Closed orders count as seen too: an order that was delivered this morning
  // must not read as a fresh arrival if it ever reappears in a payload.
  for (const stop of queue.closed) ids.add(stop.id);
  return ids;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/**
 * Fold one queue payload into the alert state.
 *
 * The first payload — of the app's life, or of a new day — only establishes the
 * baseline. Alerting there would fire on every cold start, which is the fastest
 * way to teach a driver to ignore the banner.
 */
export function reduceShiftAlerts(
  state: ShiftAlertsState,
  queue: QueueResponse,
): ShiftAlertsState {
  const current = idsOf(queue);

  if (state.seen === null || state.date !== queue.date) {
    return { date: queue.date, seen: current, pending: new Set() };
  }

  const seen = new Set(state.seen);
  const pending = new Set<string>();

  /*
    Rebuilt from the payload rather than accumulated, so a package the driver
    has since taken in charge drops out on its own. Only orders still waiting
    at the counter can be "waiting at the counter".
  */
  for (const stop of queue.stops) {
    if (stop.status !== 'in_pharmacy') continue;
    if (state.pending.has(stop.id) || !seen.has(stop.id)) pending.add(stop.id);
  }

  for (const id of current) seen.add(id);

  // Identity is the signal to re-render. A quiet poll every 30 seconds must not
  // wake the two screens reading this.
  if (
    state.date === queue.date &&
    sameSet(seen, state.seen) &&
    sameSet(pending, state.pending)
  ) {
    return state;
  }

  return { date: queue.date, seen, pending };
}

/** The driver has read the banner. The ids stay `seen`, so they do not return. */
export function acknowledgeShiftAlerts(state: ShiftAlertsState): ShiftAlertsState {
  if (state.pending.size === 0) return state;
  return { ...state, pending: new Set() };
}
