import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { GlassPanel } from '@/components/glass/glass-panel';
import { useTheme } from '@/design/theme';
import { PrimaryActionHeight, Radius, Space, TapTarget, Type } from '@/design/tokens';

/**
 * Doorstep actions.
 *
 * Sized for a driver holding a package in the rain (PRD §7): full width, in the
 * thumb zone, ≥48dp everywhere and 60dp for the one-tap verbs. Labels wrap to a
 * second line rather than truncate, because "Retourner la commande" is 60%
 * longer than "Return order" and a clipped verb on a terminal action is how
 * mis-taps happen.
 */

type ActionProps = {
  label: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

/** The single most important control on screen. One per view, at most. */
export function PrimaryAction({
  label,
  onPress,
  icon,
  disabled,
  loading,
  style,
  accessibilityHint,
}: ActionProps) {
  const theme = useTheme();
  const inert = disabled || loading;

  // Night gets a gradient across the cyan, which reads as lit glass. Day is a
  // flat deep teal: a gradient on a solid button under sunlight just looks
  // smudged, and the reference is flat.
  const fill =
    theme.name === 'dark'
      ? ([theme.palette.accentBright, theme.palette.accent, theme.palette.accentDim] as const)
      : ([theme.palette.accent, theme.palette.accent] as const);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { borderColor: theme.palette.accent },
        theme.shadow,
        pressed && styles.pressed,
        inert && styles.inert,
        style,
      ]}>
      <LinearGradient
        colors={[...fill]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.actionRow}>
        {loading ? <ActivityIndicator color={theme.palette.onAccent} /> : icon}
        <Text style={[styles.primaryText, { color: theme.palette.onAccent }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** Glass counterpart: Return Order, Cancel, secondary paths. */
export function SecondaryAction({
  label,
  onPress,
  icon,
  disabled,
  tone = 'neutral',
  style,
  accessibilityHint,
}: ActionProps & { tone?: 'neutral' | 'danger' }) {
  const theme = useTheme();
  const color = tone === 'danger' ? theme.palette.danger : theme.ink.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryPress, pressed && styles.pressed, style]}>
      <GlassPanel
        level="raised"
        tint={tone === 'danger' ? 'danger' : undefined}
        radius={Radius.control}
        androidBlur
        contentStyle={[styles.actionRow, styles.secondaryContent]}>
        {icon}
        <Text style={[styles.secondaryText, { color }]} numberOfLines={2}>
          {label}
        </Text>
      </GlassPanel>
    </Pressable>
  );
}

/**
 * The Contact / Navigate pair from the active-stop card. Equal width so neither
 * reads as the default — calling and navigating are both routine.
 */
export function ActionPair({ children }: { children: React.ReactNode }) {
  return <View style={styles.pair}>{children}</View>;
}

/** Small glass control: toolbar buttons, the settings gear, tab affordances. */
export function IconAction({
  icon,
  label,
  onPress,
  style,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.icon,
        { backgroundColor: theme.tint.neutral.fill, borderColor: theme.tint.neutral.border },
        pressed && styles.pressed,
        style,
      ]}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    minHeight: PrimaryActionHeight,
    borderRadius: Radius.control,
    overflow: 'hidden',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primaryText: { ...Type.action, flexShrink: 1 },
  secondaryPress: { flex: 1 },
  secondaryContent: { minHeight: TapTarget + 4, paddingHorizontal: Space.lg },
  secondaryText: { ...Type.action, flexShrink: 1 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  pair: { flexDirection: 'row', gap: Space.md },
  icon: {
    width: TapTarget,
    height: TapTarget,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  inert: { opacity: 0.45 },
});
