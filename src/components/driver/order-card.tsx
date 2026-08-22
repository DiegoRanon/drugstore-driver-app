import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  CoolerBadge,
  DelayChip,
  MoneyBadge,
  OutcomePill,
  SelectBox,
  SequenceBadge,
  WindowChip,
} from '@/components/driver/badges';
import { GlassPanel } from '@/components/glass/glass-panel';
import type { ActiveStop, ClosedStop } from '@/api/types';
import { useTheme } from '@/design/theme';
import { MonoFont, Radius, Space, Type } from '@/design/tokens';
import { clock, elapsedLabel, orderRef } from '@/lib/format';

/**
 * The card is scanned, not read (PRD §7).
 *
 * Modelled on the Mobilus card, minus two things it shows and we cannot: there
 * is no straight-line distance and no per-stop ETA, because the API exposes no
 * coordinates for a stop and the optimizer returns sequence only. The freed
 * real estate goes to the window chip and the delay counter, which are the two
 * signals we do have and which a driver triages by.
 */

type OrderCardProps = {
  stop: ActiveStop;
  locale: 'fr' | 'en';
  labels: {
    cooler: string;
    /** Screen-reader prefix, e.g. "Delivery for". */
    accessibilityPrefix: string;
  };
  selectable?: boolean;
  selected?: boolean;
  onPress?: () => void;
  onToggleSelect?: () => void;
};

export function OrderCard({
  stop,
  locale,
  labels,
  selectable = false,
  selected = false,
  onPress,
  onToggleSelect,
}: OrderCardProps) {
  const theme = useTheme();
  const delay = elapsedLabel(stop.picked_up_at);
  const owes = stop.amount_due !== null && stop.amount_due > 0;

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
          {!selectable && stop.sequence_number !== null ? (
            <View style={styles.lead}>
              <SequenceBadge value={stop.sequence_number} active={stop.sequence_number === 1} />
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
            {owes ? (
              <MoneyBadge
                amount={stop.amount_due ?? 0}
                locale={locale}
                collected={stop.payment_collected}
              />
            ) : null}
            {stop.requires_cooler_bag ? <CoolerBadge label={labels.cooler} /> : null}
            {delay ? <DelayChip label={delay} /> : null}
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
 * There is deliberately no patient name, address, or phone here — the server
 * strips them from terminal orders and the app renders what remains (PRD §8.1).
 * The order reference is what the driver reads back at the counter.
 */
export function ClosedOrderCard({
  stop,
  locale,
  labels,
  onPress,
}: {
  stop: ClosedStop;
  locale: 'fr' | 'en';
  labels: {
    completed: string;
    returned: string;
    cancelled: string;
    coolerPending: string;
    returnToPharmacy: string;
  };
  onPress?: () => void;
}) {
  const theme = useTheme();
  const outcome = labels[stop.status];
  const at = clock(stop.completed_at ?? stop.returned_at, locale);
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
        <View style={styles.badges}>
          {at ? <DelayChip label={at} /> : null}
          {stop.status === 'returned' ? (
            <Text style={[styles.returnNote, { color: theme.palette.caution }]}>
              {labels.returnToPharmacy}
            </Text>
          ) : null}
        </View>
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
  returnNote: { ...Type.meta },
  coolerPending: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coolerPendingText: { ...Type.meta },
});
