import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  CoolerBadge,
  DelayChip,
  MoneyBadge,
  OutcomePill,
  PackageBadge,
  PriorityBadge,
  SelectBox,
  SequenceBadge,
  TravelChip,
  WindowChip,
} from '@/components/driver/badges';
import { GlassPanel } from '@/components/glass/glass-panel';
import type {
  ActiveStop,
  Estimate,
  EtaStop,
  TerminalStatus,
  TerminalStop,
} from '@/api/types';
import { useTheme } from '@/design/theme';
import { MonoFont, Radius, Space, Type } from '@/design/tokens';
import { clock, distance, duration, elapsedLabel, orderRef, timeRange } from '@/lib/format';

/**
 * The card is scanned, not read (PRD §7).
 *
 * Modelled on the Mobilus card. Distance and travel time appear when the
 * route optimizer measured them — an active stop now carries coordinates, so
 * both are real numbers off the solved route rather than straight-line guesses
 * — and are simply absent otherwise, because an invented kilometre reading is
 * one a driver would turn the wheel on.
 *
 * The window chip and the delay counter still carry the triage weight, since
 * they are present on every card and the estimates are not.
 */

type OrderCardProps = {
  stop: ActiveStop;
  locale: 'fr' | 'en';
  /** Travel from the previous stop, when the optimizer could measure it. */
  estimate?: Estimate;
  /**
   * This stop's slice of the traffic-aware run estimate: how long the drive
   * to it takes, and what time the driver gets there.
   *
   * Deliberately separate from `estimate`: that one is a leg length measured
   * during an optimize call, this is the live chain the driver is actually
   * on — re-measured every time a stop leaves the run.
   */
  eta?: EtaStop | null;
  /**
   * The number badge to show, when it should differ from `stop.sequence_number`.
   *
   * The server's number is the route's absolute position and is only rewritten
   * by another optimize or manual-sequence call — neither of which fires just
   * because a driver finished a stop. Left alone, a completed #1 leaves the
   * remaining cards reading 2, 3, 4… forever, which reads as broken even
   * though the route itself is untouched. The caller instead recomputes a
   * gap-free position from the stops still on screen and passes it here; the
   * server's own number is never mutated to get it.
   */
  position?: number | null;
  labels: {
    cooler: string;
    priority: string;
    /** Pluralised by the caller; "colis" is invariant in French. */
    packages: string;
    /** Screen-reader prefix, e.g. "Delivery for". */
    accessibilityPrefix: string;
    /** Formats the predicted arrival, e.g. "Arrivée ~14:20". */
    arriveAt?: (time: string) => string;
  };
  selectable?: boolean;
  selected?: boolean;
  onPress?: () => void;
  onToggleSelect?: () => void;
};

export function OrderCard({
  stop,
  locale,
  estimate,
  eta,
  position,
  labels,
  selectable = false,
  selected = false,
  onPress,
  onToggleSelect,
}: OrderCardProps) {
  const theme = useTheme();
  const delay = elapsedLabel(stop.picked_up_at);
  const owes = stop.amount_due !== null && stop.amount_due > 0;
  // Falls back to the server's own number so screens that never recompute a
  // gap-free position (Ready, the design gallery) render exactly as before.
  const displayPosition = position !== undefined ? position : stop.sequence_number;

  /*
    Distance and time are one chip, not two: they answer the same question and
    two chips would push the badges that only appear when something is *wrong*
    — money owed, cooler bag — onto a second line.
  */
  const travel = [
    distance(estimate?.distance_meters ?? null, locale),
    duration(estimate?.duration_seconds ?? null),
  ]
    .filter(Boolean)
    .join(' · ');

  /*
    The promised interval wins over the single promised time when both exist:
    it is the more specific commitment, and it is what the optimizer routed to.
  */
  const promised =
    timeRange(stop.requested_time_start, stop.requested_time_end) ??
    stop.requested_delivery_time;

  const arrivalClock = eta ? clock(eta.arrival_time, locale) : null;
  const arrival =
    arrivalClock && labels.arriveAt ? labels.arriveAt(arrivalClock) : arrivalClock;

  /*
    How long the drive to *this* stop takes, from the live run estimate.

    It takes the slot the "in the van for 4 h 24" counter used to hold. That
    counter is the same number on every card of a run picked up together, so
    it told a driver scanning the list nothing about which stop to think about
    next; the leg duration differs per card and is the thing they are actually
    deciding on. The elapsed counter stays as the fallback for a stop with no
    estimate, where it is still the only timing signal there is.
  */
  const legDuration = eta ? duration(eta.duration_seconds) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${labels.accessibilityPrefix} ${stop.patient_name}, ${stop.address}`}
      accessibilityState={selectable ? { checked: selected, selected } : undefined}
      onPress={selectable ? onToggleSelect : onPress}
      onLongPress={selectable ? undefined : onToggleSelect}>
      <GlassPanel
        level={selected ? 'active' : 'row'}
        radius={Radius.card}
        contentStyle={styles.card}>
        <View style={styles.header}>
          {selectable ? (
            <View style={styles.lead}>
              <SelectBox selected={selected} />
            </View>
          ) : null}
          {!selectable && displayPosition !== null ? (
            <View style={styles.lead}>
              <SequenceBadge value={displayPosition} active={displayPosition === 1} />
            </View>
          ) : null}

          <View style={styles.headerText}>
            <Text style={[styles.name, { color: theme.ink.primary }]} numberOfLines={1}>
              {stop.patient_name}
            </Text>
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={14} color={theme.ink.tertiary} />
              <Text style={[styles.address, { color: theme.ink.secondary }]} numberOfLines={1}>
                {stop.address}
              </Text>
            </View>
          </View>

          <WindowChip window={stop.delivery_window} locale={locale} />
        </View>

        <View style={styles.footer}>
          <View style={styles.badges}>
            {stop.is_priority ? <PriorityBadge label={labels.priority} /> : null}
            {/*
              Finer than the AM/PM window when the pharmacy set one. It sits
              beside the window rather than replacing it: the chip is the
              most-scanned thing on the card (PRD §5.2) and a driver reading a
              bare "14:30" has lost the half-day it belongs to.
            */}
            {promised ? <DelayChip label={promised} /> : null}
            {/*
              The predicted arrival outranks the raw leg length when both are
              present: "arrive around 14:20" is what a driver checks against
              the window promised to the patient, whereas "8 min" only says
              how far the last stop was.
            */}
            {arrival ? (
              <TravelChip label={arrival} />
            ) : travel ? (
              <TravelChip label={travel} />
            ) : null}
            {owes ? (
              <MoneyBadge
                amount={stop.amount_due ?? 0}
                locale={locale}
                collected={stop.payment_collected}
              />
            ) : null}
            {stop.requires_cooler_bag ? <CoolerBadge label={labels.cooler} /> : null}
            {stop.package_count > 1 ? (
              <PackageBadge count={stop.package_count} label={labels.packages} />
            ) : null}
            {legDuration ? (
              <DelayChip label={legDuration} />
            ) : delay ? (
              <DelayChip label={delay} />
            ) : null}
          </View>
          <Text style={[styles.ref, { color: theme.ink.tertiary }]}>{orderRef(stop.id)}</Text>
        </View>
      </GlassPanel>
    </Pressable>
  );
}

/**
 * A finished delivery on the Done tab.
 *
 * Typed `TerminalStop`, not `ClosedStop`: a `returned` order is also closed —
 * PII-stripped, no patient name to render — but it is *not* finished, because
 * the pharmacy has not taken the package back yet. It belongs on the À
 * rapporter tab, and the type is what keeps it off this one.
 *
 * There is deliberately no patient name, address, or phone here. The server
 * strips them the moment the delivery attempt ends and the app renders what
 * remains (PRD §8.1). The order reference and the label codes are what the
 * driver reads back at the counter.
 */
export function ClosedOrderCard({
  stop,
  locale,
  labels,
  onPress,
}: {
  stop: TerminalStop;
  locale: 'fr' | 'en';
  labels: Record<TerminalStatus, string> & { coolerPending: string };
  onPress?: () => void;
}) {
  const theme = useTheme();
  const outcome = labels[stop.status];
  // Whichever way it ended. `returned_to_pharmacy_at` is the newest of the
  // three and has to be read first, or a handed-back parcel shows the time of
  // the failed attempt instead of the time it got back on the shelf.
  const at = clock(
    stop.returned_to_pharmacy_at ?? stop.completed_at ?? stop.returned_at,
    locale,
  );
  const coolerPending = stop.requires_cooler_bag && stop.cooler_bag_confirmed === null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${outcome} ${orderRef(stop.id)}`}
      onPress={onPress}>
      <GlassPanel level="row" radius={Radius.card} contentStyle={styles.closedCard}>
        <View style={styles.closedHeader}>
          <Text style={[styles.closedRef, { color: theme.ink.primary }]}>{orderRef(stop.id)}</Text>
          <OutcomePill status={stop.status} label={outcome} />
        </View>
        <View style={styles.badges}>{at ? <DelayChip label={at} /> : null}</View>
        {coolerPending ? (
          <View style={styles.coolerPending}>
            <Ionicons name="alert-circle-outline" size={15} color={theme.palette.cooler} />
            <Text style={[styles.coolerPendingText, { color: theme.palette.cooler }]}>
              {labels.coolerPending}
            </Text>
          </View>
        ) : null}
      </GlassPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: Space.lg, gap: Space.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
  lead: { paddingTop: 2 },
  headerText: { flex: 1, gap: 3 },
  name: { ...Type.rowTitle },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address: { ...Type.meta, flex: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  ref: { ...Type.chip, fontFamily: MonoFont, letterSpacing: 0.6 },
  closedCard: { padding: Space.lg, gap: Space.md },
  closedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closedRef: { ...Type.body, fontFamily: MonoFont, letterSpacing: 0.8 },
  coolerPending: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coolerPendingText: { ...Type.meta },
});
