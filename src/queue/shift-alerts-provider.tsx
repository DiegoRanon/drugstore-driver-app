/**
 * One diff engine for the whole tab group.
 *
 * Ready and On the way are separate component trees, and the same arrival has
 * to say two different things on them — "you have new packages" on one, "there
 * are packages waiting for you back at the pharmacy" on the other. Running the
 * diff in each screen would mean two baselines that drift apart the moment one
 * tab is detached, so the state lives above both and each screen reads the
 * slice it needs.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  INITIAL_SHIFT_ALERTS,
  acknowledgeShiftAlerts,
  reduceShiftAlerts,
  type ShiftAlertsState,
} from '@/queue/shift-alerts';
import { useQueueSlices } from '@/queue/use-queue';

export type ShiftAlerts = {
  /** Packages that appeared at the counter since the driver last acknowledged. */
  newAtPharmacy: number;
  /**
   * True when those arrived while the driver already has packages in the van —
   * the workflow's "repasser par la pharmacie à sa discrétion". It states the
   * fact; the driver decides when.
   */
  shouldReturn: boolean;
  acknowledge: () => void;
};

/**
 * A screen mounted outside the provider shows no banner rather than crashing.
 * These alerts are an enhancement on a working queue, never a correctness gate.
 */
const NO_ALERTS: ShiftAlerts = {
  newAtPharmacy: 0,
  shouldReturn: false,
  acknowledge: () => {},
};

const ShiftAlertsContext = createContext<ShiftAlerts>(NO_ALERTS);

export function ShiftAlertsProvider({ children }: { children: React.ReactNode }) {
  const { query, slices } = useQueueSlices();
  const [state, setState] = useState<ShiftAlertsState>(INITIAL_SHIFT_ALERTS);

  const queue = query.data;

  useEffect(() => {
    if (!queue) return;
    setState((previous) => reduceShiftAlerts(previous, queue));
  }, [queue]);

  const acknowledge = useCallback(() => setState(acknowledgeShiftAlerts), []);

  const value = useMemo<ShiftAlerts>(
    () => ({
      newAtPharmacy: state.pending.size,
      shouldReturn: state.pending.size > 0 && slices.onTheWay.length > 0,
      acknowledge,
    }),
    [state.pending, slices.onTheWay.length, acknowledge],
  );

  return <ShiftAlertsContext.Provider value={value}>{children}</ShiftAlertsContext.Provider>;
}

export function useShiftAlerts(): ShiftAlerts {
  return useContext(ShiftAlertsContext);
}
