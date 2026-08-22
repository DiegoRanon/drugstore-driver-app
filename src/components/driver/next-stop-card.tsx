import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';

import { ActionPair, PrimaryAction, SecondaryAction } from '@/components/driver/actions';
import { DelayChip, SequenceBadge, WindowChip } from '@/components/driver/badges';
import { GlassPanel } from '@/components/glass/glass-panel';
import type { ActiveStop } from '@/api/types';
import { useTheme, type TintName } from '@/design/theme';
import { Radius, Space, Type } from '@/design/tokens';
import { elapsedLabel, money } from '@/lib/format';

/**
 * The hero card: the stop the driver is heading to right now.
 *
 * Two deliberate departures from the reference mockup, both forced by what the
 * platform is:
 *
 * - **No ETA / "on time" pill.** The optimizer returns `sequence_number` only —
 *   no leg durations — so an ETA here would be invented. The delivery window
 *   and the delay counter are shown instead; they are real.
 * - **No signature or prescription line.** Single-tap PoD is the headline
 *   simplification over Mobilus (PRD §5.6), and the API carries no medical,
 *   pharmaceutical, or prescription data by design. The alert slot that held
 *   "Signature required" holds the exceptions we do have: money to collect at
 *   the door, and the cooler bag.
 */

type Exception = {
  icon: React.ReactNode;
  text: string;
  color: string;
  tint: Extract<TintName, 'danger' | 'cooler'>;
};

type NextStopCardProps = {
  stop: ActiveStop;
  locale: 'fr' | 'en';
  labels: {
    nextStop: string;
    collect: string;
    cooler: string;
    contact: string;
    navigate: string;
  };
  onContact?: () => void;
  onNavigate?: () => void;
};

export function NextStopCard({ stop, locale, labels, onContact, onNavigate }: NextStopCardProps) {
  const theme = useTheme();
  const delay = elapsedLabel(stop.picked_up_at);
  const exceptions: Exception[] = [];

  if (stop.amount_due !== null && stop.amount_due > 0 && !stop.payment_collected) {
    exceptions.push({
      icon: <Ionicons name="alert-circle" size={18} color={theme.palette.danger} />,
      text: `${labels.collect} ${money(stop.amount_due, locale)}`,
      color: theme.palette.danger,
      tint: 'danger',
    });
  }
  if (stop.requires_cooler_bag) {
    exceptions.push({
      icon: <MaterialCommunityIcons name="snowflake" size={18} color={theme.palette.cooler} />,
      text: labels.cooler,
      color: theme.palette.cooler,
      tint: 'cooler',
    });
  }

  return (
    <GlassPanel level="raised" radius={Radius.sheet} androidBlur contentStyle={styles.card}>
      <View style={styles.header}>
        {stop.sequence_number !== null ? (
          <SequenceBadge value={stop.sequence_number} active />
        ) : null}
        <View style={styles.headerText}>
          <Text style={[styles.label, { color: theme.palette.accent }]}>{labels.nextStop}</Text>
          <Text style={[styles.name, { color: theme.ink.primary }]} numberOfLines={2}>
            {stop.patient_name}
          </Text>
        </View>
        <View style={styles.headerMeta}>
          <WindowChip window={stop.delivery_window} locale={locale} />
          {delay ? <DelayChip label={delay} /> : null}
        </View>
      </View>

      <View style={styles.addressRow}>
        <Ionicons name="location-outline" size={18} color={theme.ink.secondary} />
        <Text style={[styles.address, { color: theme.ink.secondary }]}>{stop.address}</Text>
      </View>

      {exceptions.map((exception) => (
        <GlassPanel
          key={exception.text}
          level="row"
          tint={exception.tint}
          radius={Radius.control}
          elevated={false}
          contentStyle={styles.exception}>
          {exception.icon}
          <Text style={[styles.exceptionText, { color: exception.color }]}>{exception.text}</Text>
        </GlassPanel>
      ))}

      {/*
        Navigate carries the accent fill and Contact does not. Both are routine,
        but only one is what the driver does *next* on nearly every stop, and an
        equal pair makes them read the address twice to decide.
      */}
      <ActionPair>
        <SecondaryAction
          label={labels.contact}
          onPress={onContact}
          style={styles.pairAction}
          icon={<Ionicons name="call" size={18} color={theme.ink.primary} />}
        />
        <PrimaryAction
          label={labels.navigate}
          onPress={onNavigate}
          style={styles.pairAction}
          icon={<Ionicons name="navigate" size={18} color={theme.palette.onAccent} />}
        />
      </ActionPair>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  card: { padding: Space.xl, gap: Space.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
  headerText: { flex: 1, gap: 2 },
  headerMeta: { alignItems: 'flex-end', gap: 6 },
  label: { ...Type.label, textTransform: 'uppercase' },
  name: { ...Type.title },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.sm },
  address: { ...Type.body, flex: 1 },
  exception: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  exceptionText: { ...Type.body, fontWeight: '700', flex: 1 },
  /** Equal height across the mixed primary/secondary pair. */
  pairAction: { flex: 1, minHeight: 52 },
});
