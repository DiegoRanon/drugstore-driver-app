import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SecondaryAction } from '@/components/driver/actions';
import { CoolerBadge, DelayChip, SelectBox } from '@/components/driver/badges';
import { GlassPanel } from '@/components/glass/glass-panel';
import type { FailureReason, PackageType, ReturnStop } from '@/api/types';
import { useTheme } from '@/design/theme';
import { MonoFont, Radius, Space, Type } from '@/design/tokens';
import { clock, orderRef } from '@/lib/format';

/**
 * One undelivered package, waiting in the van for the counter.
 *
 * The label codes are the point of this card. Everything identifying the
 * patient is gone — a failed attempt is over, so the server strips
 * `patient_name`, `address`, and `phone_number` even though the order is not
 * terminal (`privacy-rules.md` §1) — and what survives is exactly what the
 * driver needs to match parcels against the employee's list. Deliberate, not
 * an accident of the serializer.
 */

const PACKAGE_ICON: Record<PackageType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  bag: 'shopping-outline',
  cooler: 'snowflake',
  tote: 'basket-outline',
  envelope: 'email-outline',
};

type ReturnCardProps = {
  stop: ReturnStop;
  locale: 'fr' | 'en';
  labels: {
    reasons: Record<FailureReason, string>;
    cooler: string;
    handedBack: string;
  };
  /** Present while the counter is being worked through in bulk. */
  selectable?: boolean;
  selected?: boolean;
  busy?: boolean;
  onToggleSelect?: () => void;
  onHandOver?: () => void;
};

export function ReturnCard({
  stop,
  locale,
  labels,
  selectable = false,
  selected = false,
  busy = false,
  onToggleSelect,
  onHandOver,
}: ReturnCardProps) {
  const theme = useTheme();
  const at = clock(stop.returned_at, locale);
  const reason = stop.failure_reason ? labels.reasons[stop.failure_reason] : null;

  return (
    <Pressable
      accessibilityRole={selectable ? 'checkbox' : 'button'}
      accessibilityLabel={`${orderRef(stop.id)}${reason ? `, ${reason}` : ''}`}
      accessibilityState={selectable ? { checked: selected, selected } : undefined}
      onPress={selectable ? onToggleSelect : undefined}
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
          <Text style={[styles.ref, { color: theme.ink.primary }]}>{orderRef(stop.id)}</Text>
          {at ? <DelayChip label={at} /> : null}
        </View>

        {reason ? (
          <View style={styles.reasonRow}>
            <Ionicons name="alert-circle-outline" size={15} color={theme.palette.caution} />
            <Text style={[styles.reason, { color: theme.palette.caution }]}>{reason}</Text>
          </View>
        ) : null}

        {/*
          One row per parcel rather than a count: the driver reads these out to
          the employee, and a count of three does not tell you which three.
        */}
        <View style={styles.labelCodes}>
          {stop.packages.map((parcel) => (
            <View
              key={parcel.id}
              style={[styles.labelChip, { borderColor: theme.tint.neutral.border }]}>
              <MaterialCommunityIcons
                name={PACKAGE_ICON[parcel.package_type]}
                size={14}
                color={theme.ink.tertiary}
              />
              <Text style={[styles.labelCode, { color: theme.ink.primary }]}>
                {parcel.label_code}
              </Text>
            </View>
          ))}
        </View>

        {stop.requires_cooler_bag ? (
          <View style={styles.badges}>
            <CoolerBadge label={labels.cooler} />
          </View>
        ) : null}

        {!selectable && onHandOver ? (
          <SecondaryAction
            label={labels.handedBack}
            disabled={busy}
            onPress={onHandOver}
            icon={
              <Ionicons name="checkmark-done" size={18} color={theme.palette.accent} />
            }
          />
        ) : null}
      </GlassPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: Space.lg, gap: Space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  lead: { paddingTop: 2 },
  ref: { ...Type.body, fontFamily: MonoFont, letterSpacing: 0.8, flex: 1 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reason: { ...Type.meta },
  labelCodes: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  labelCode: { ...Type.chip, fontFamily: MonoFont, letterSpacing: 0.8 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, flexWrap: 'wrap' },
});
