import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { GlassPanel } from '@/components/glass/glass-panel';
import { useTheme, type Theme, type TintName } from '@/design/theme';
import { Radius, Type } from '@/design/tokens';
import { windowLabel, type DeliveryWindow } from '@/lib/delivery-windows';
import { money } from '@/lib/format';

/**
 * Status encoding rule (PRD §7): colour **plus** text or icon, never colour
 * alone. Every chip below carries a glyph or a word that survives in greyscale,
 * because a colour-blind driver misreading a `$` badge costs the pharmacy money.
 */

type ChipProps = {
  label: string;
  tint?: TintName;
  color?: string;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Chip({ label, tint = 'neutral', color, icon, style }: ChipProps) {
  const theme = useTheme();
  return (
    <GlassPanel
      level="row"
      tint={tint}
      radius={Radius.chip}
      elevated={false}
      style={style}
      contentStyle={styles.chipContent}>
      {icon}
      <Text style={[styles.chipText, { color: color ?? theme.ink.primary }]} numberOfLines={1}>
        {label}
      </Text>
    </GlassPanel>
  );
}

/**
 * AM / PM with the organization's window times spelled out beside it.
 *
 * Solid rather than tinted: the window is the most-scanned thing on a card, and
 * each theme fills it the way that reads fastest against its own field.
 */
export function WindowChip({
  window,
  locale,
}: {
  window: DeliveryWindow;
  locale: 'fr' | 'en';
}) {
  const theme = useTheme();
  const skin = theme.windowChip[window];
  return (
    <View style={[styles.solidChip, { backgroundColor: skin.fill }]}>
      <Text style={[styles.chipText, { color: skin.text }]} numberOfLines={1}>
        {windowLabel(window, locale)}
      </Text>
    </View>
  );
}

/**
 * Money to collect at the door — the strongest signal on a card (PRD §5.2),
 * because forgetting to collect is the costliest driver error.
 */
export function MoneyBadge({
  amount,
  locale,
  collected = false,
}: {
  amount: number;
  locale: 'fr' | 'en';
  collected?: boolean;
}) {
  const theme = useTheme();
  const color = collected ? theme.ink.tertiary : theme.palette.money;
  return (
    <Chip
      tint={collected ? 'neutral' : 'money'}
      color={color}
      icon={
        <Ionicons name={collected ? 'checkmark-circle' : 'cash'} size={14} color={color} />
      }
      label={money(amount, locale)}
    />
  );
}

/** Grab the bag at pickup, not at the door. */
export function CoolerBadge({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Chip
      tint="cooler"
      color={theme.palette.cooler}
      icon={<MaterialCommunityIcons name="snowflake" size={14} color={theme.palette.cooler} />}
      label={label}
    />
  );
}

/** Time in the current status, matching Mobilus's delay counter. */
export function DelayChip({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Chip
      color={theme.ink.tertiary}
      icon={<Ionicons name="time-outline" size={14} color={theme.ink.tertiary} />}
      label={label}
    />
  );
}

/** Position in the server-assigned route. Never a client-side sort (PRD §3.1). */
export function SequenceBadge({ value, active = false }: { value: number; active?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.sequence,
        {
          backgroundColor: active ? theme.palette.accent : theme.tint.neutral.fill,
          borderColor: active ? theme.palette.accent : theme.tint.neutral.border,
        },
      ]}>
      <Text
        style={[
          styles.sequenceText,
          { color: active ? theme.palette.onAccent : theme.ink.secondary },
        ]}>
        {value}
      </Text>
    </View>
  );
}

/** Multi-select control for taking a batch of packages in charge (PRD §5.3). */
export function SelectBox({ selected }: { selected: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.checkbox,
        {
          backgroundColor: selected ? theme.palette.accent : 'transparent',
          borderColor: selected ? theme.palette.accent : theme.tint.neutral.border,
        },
      ]}>
      {selected ? <Ionicons name="checkmark" size={17} color={theme.palette.onAccent} /> : null}
    </View>
  );
}

const OUTCOME = {
  completed: {
    tint: 'money',
    icon: 'checkmark-circle',
    color: (theme: Theme) => theme.palette.money,
  },
  returned: {
    tint: 'caution',
    icon: 'arrow-undo-circle',
    color: (theme: Theme) => theme.palette.caution,
  },
  cancelled: {
    tint: 'neutral',
    icon: 'close-circle',
    color: (theme: Theme) => theme.ink.tertiary,
  },
} as const;

/** Outcome of a closed delivery, on the Done tab. */
export function OutcomePill({
  status,
  label,
}: {
  status: keyof typeof OUTCOME;
  label: string;
}) {
  const theme = useTheme();
  const outcome = OUTCOME[status];
  const color = outcome.color(theme);
  return (
    <Chip
      tint={outcome.tint}
      color={color}
      icon={<Ionicons name={outcome.icon} size={14} color={color} />}
      label={label}
    />
  );
}

const styles = StyleSheet.create({
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { ...Type.chip },
  solidChip: {
    borderRadius: Radius.chip,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sequence: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sequenceText: { ...Type.chip, fontSize: 15 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
