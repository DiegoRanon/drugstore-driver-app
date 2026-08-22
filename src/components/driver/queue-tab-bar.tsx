import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassPanel } from '@/components/glass/glass-panel';
import { useTheme, type Theme } from '@/design/theme';
import { Radius, Space, TapTarget, Type } from '@/design/tokens';

/**
 * The three tabs of a driver's day (PRD §5.1), each with its count — the first
 * glance answers "how much day is left".
 *
 * Counts use the accent rather than the mockup's red: in this palette red means
 * money owed or a failed action, and a Ready count of 8 is neither. Reserving
 * the alarm colour for actual alarms is what keeps it legible at a glance.
 *
 * Floating, not docked: it sits above the list on the mesh so the glass has
 * something to refract, and it stays inside the thumb arc.
 */

export type QueueTab = 'ready' | 'on_the_way' | 'done';

const TABS: { key: QueueTab; icon: (color: string) => React.ReactNode }[] = [
  {
    key: 'ready',
    icon: (color) => <Ionicons name="file-tray-outline" size={22} color={color} />,
  },
  {
    key: 'on_the_way',
    icon: (color) => (
      <MaterialCommunityIcons name="truck-delivery-outline" size={22} color={color} />
    ),
  },
  {
    key: 'done',
    icon: (color) => <Ionicons name="checkmark-circle-outline" size={22} color={color} />,
  },
];

type QueueTabBarProps = {
  active: QueueTab;
  counts: Record<QueueTab, number>;
  labels: Record<QueueTab, string>;
  onChange: (tab: QueueTab) => void;
};

/**
 * A tab is in one of three states, and each needs three colours. Resolving
 * them in one place beats three nested ternaries at every usage site.
 */
function tabColors(theme: Theme, selected: boolean, onFill: boolean) {
  if (onFill) {
    return {
      content: theme.palette.onAccent,
      badgeFill: theme.palette.onAccent,
      badgeText: theme.palette.accent,
    };
  }
  if (selected) {
    return {
      content: theme.palette.accent,
      badgeFill: theme.palette.accent,
      badgeText: theme.palette.onAccent,
    };
  }
  return {
    content: theme.ink.tertiary,
    badgeFill: theme.tint.neutral.fill,
    badgeText: theme.ink.secondary,
  };
}

export function QueueTabBar({ active, counts, labels, onChange }: QueueTabBarProps) {
  const theme = useTheme();

  // Day fills the selected tab the way the reference does — a solid teal
  // block. Night leaves it open and tints the icon instead: a filled block on a
  // dark bar reads as a hole punched in the glass.
  const fillsSelected = theme.name === 'light';

  return (
    <GlassPanel level="chrome" radius={Radius.chip} androidBlur contentStyle={styles.bar}>
      {TABS.map((tab) => {
        const selected = tab.key === active;
        const onFill = selected && fillsSelected;
        const colors = tabColors(theme, selected, onFill);
        const count = counts[tab.key];

        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${labels[tab.key]}, ${count}`}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              onFill && { backgroundColor: theme.palette.accent },
              pressed && styles.pressed,
            ]}>
            <View>
              {tab.icon(colors.content)}
              {count > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.badgeFill }]}>
                  <Text style={[styles.badgeText, { color: colors.badgeText }]}>
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color: colors.content }]} numberOfLines={1}>
              {labels[tab.key]}
            </Text>
          </Pressable>
        );
      })}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
  },
  tab: {
    flex: 1,
    minHeight: TapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: Radius.chip,
  },
  label: { ...Type.chip, fontSize: 12 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...Type.chip, fontSize: 11 },
  pressed: { opacity: 0.7 },
});
