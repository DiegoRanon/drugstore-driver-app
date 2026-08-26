import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { PriorityBadge, SequenceBadge } from '@/components/driver/badges';
import { GlassPanel } from '@/components/glass/glass-panel';
import type { ActiveStop } from '@/api/types';
import { useTheme } from '@/design/theme';
import { Radius, Space, TapTarget, Type } from '@/design/tokens';

/**
 * Drag to reorder, on the two animation libraries the project already has.
 *
 * No new dependency, deliberately. `react-native-gesture-handler` and
 * `react-native-reanimated` ship in Expo Go's prebuilt set at exactly the
 * versions here; every drag-list package on npm is still catching up to
 * Reanimated 4 / RN 0.86, and a bundle that will not open in Expo Go costs
 * more than the hundred lines below.
 *
 * The rows are a fixed height by design, which is what makes the maths a
 * single `round(y / ROW_HEIGHT)` rather than a layout measurement pass.
 *
 * Chevrons sit beside the grip because a screen reader cannot drag. They are
 * not a fallback for a broken gesture — they are the accessible path, and PRD
 * §7 makes one-handed operation a requirement, not a nicety.
 */

export const ROW_HEIGHT = 72;
const GAP = Space.sm;
const STRIDE = ROW_HEIGHT + GAP;

export function ReorderList({
  stops,
  labels,
  onChange,
}: {
  stops: ActiveStop[];
  labels: { priority: string; moveUp: string; moveDown: string };
  onChange: (ordered: ActiveStop[]) => void;
}) {
  const move = useCallback(
    (from: number, to: number) => {
      const clamped = Math.max(0, Math.min(stops.length - 1, to));
      if (clamped === from) return;
      const next = [...stops];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(clamped, 0, moved);
      onChange(next);
    },
    [stops, onChange],
  );

  return (
    <View style={styles.list}>
      {stops.map((stop, index) => (
        <Row
          key={stop.id}
          stop={stop}
          index={index}
          count={stops.length}
          labels={labels}
          onMove={move}
        />
      ))}
    </View>
  );
}

function Row({
  stop,
  index,
  count,
  labels,
  onMove,
}: {
  stop: ActiveStop;
  index: number;
  count: number;
  labels: { priority: string; moveUp: string; moveDown: string };
  onMove: (from: number, to: number) => void;
}) {
  const theme = useTheme();
  const offset = useSharedValue(0);
  const dragging = useSharedValue(false);

  const pan = Gesture.Pan()
    .activateAfterLongPress(180)
    .onStart(() => {
      dragging.value = true;
    })
    .onUpdate((event) => {
      offset.value = event.translationY;
    })
    .onEnd((event) => {
      const target = index + Math.round(event.translationY / STRIDE);
      // Snap home before the reorder lands: the array change re-renders this
      // row at its new position, and a lingering offset would double the move.
      offset.value = 0;
      dragging.value = false;
      if (target !== index) runOnJS(onMove)(index, target);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }, { scale: dragging.value ? 1.03 : 1 }],
    zIndex: dragging.value ? 10 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style}>
        <GlassPanel level="row" radius={Radius.card} contentStyle={styles.row}>
          <SequenceBadge value={index + 1} active={index === 0} />

          <View style={styles.text}>
            <Text style={[styles.name, { color: theme.ink.primary }]} numberOfLines={1}>
              {stop.patient_name}
            </Text>
            <Text style={[styles.address, { color: theme.ink.tertiary }]} numberOfLines={1}>
              {stop.address}
            </Text>
          </View>

          {stop.is_priority ? <PriorityBadge label={labels.priority} /> : null}

          <View style={styles.chevrons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${labels.moveUp}: ${stop.patient_name}`}
              disabled={index === 0}
              onPress={() => onMove(index, index - 1)}
              hitSlop={6}
              style={styles.chevron}>
              <Ionicons
                name="chevron-up"
                size={20}
                color={index === 0 ? theme.tint.neutral.border : theme.ink.secondary}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${labels.moveDown}: ${stop.patient_name}`}
              disabled={index === count - 1}
              onPress={() => onMove(index, index + 1)}
              hitSlop={6}
              style={styles.chevron}>
              <Ionicons
                name="chevron-down"
                size={20}
                color={
                  index === count - 1 ? theme.tint.neutral.border : theme.ink.secondary
                }
              />
            </Pressable>
          </View>

          <Ionicons name="reorder-three" size={24} color={theme.ink.tertiary} />
        </GlassPanel>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  list: { gap: GAP },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
  },
  text: { flex: 1, gap: 2 },
  name: { ...Type.rowTitle, fontSize: 16 },
  address: { ...Type.meta },
  chevrons: { justifyContent: 'center' },
  chevron: { height: TapTarget / 2, justifyContent: 'center' },
});
