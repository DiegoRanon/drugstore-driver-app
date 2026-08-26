import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassPanel } from '@/components/glass/glass-panel';
import type { Notification, NotificationType } from '@/api/types';
import { useTheme, type Theme } from '@/design/theme';
import { MonoFont, Radius, Space, Type } from '@/design/tokens';
import { elapsedLabel, orderRef } from '@/lib/format';

/**
 * One line of the feed.
 *
 * Counts and order references only — never a patient name. A banner or a feed
 * row sits on screen while the phone is on a dashboard mount in a parked van,
 * which is the one place PII is most visible and least controlled (PRD §8.1).
 * The server helps here by not sending any: a notification carries a type, an
 * order id, and two timestamps.
 */

const ICON = {
  order_assigned: { name: 'person-add', tone: (t: Theme) => t.palette.accent },
  order_ready: { name: 'file-tray-full', tone: (t: Theme) => t.palette.money },
  order_unassigned: { name: 'person-remove', tone: (t: Theme) => t.ink.tertiary },
  order_cancelled: { name: 'close-circle', tone: (t: Theme) => t.palette.caution },
} as const satisfies Record<
  NotificationType,
  { name: keyof typeof Ionicons.glyphMap; tone: (theme: Theme) => string }
>;

export function NotificationRow({
  notification,
  labels,
  onPress,
}: {
  notification: Notification;
  labels: Record<NotificationType, string>;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const icon = ICON[notification.type];
  const color = icon.tone(theme);
  const unread = notification.read_at === null;
  const when = elapsedLabel(notification.created_at);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={labels[notification.type]}
      accessibilityState={{ selected: unread }}
      onPress={onPress}>
      <GlassPanel
        level={unread ? 'active' : 'row'}
        radius={Radius.card}
        contentStyle={styles.row}>
        <Ionicons name={icon.name} size={22} color={color} />

        <View style={styles.text}>
          <Text style={[styles.title, { color: theme.ink.primary }]}>
            {labels[notification.type]}
          </Text>
          <View style={styles.meta}>
            {notification.order_id ? (
              <Text style={[styles.ref, { color: theme.ink.tertiary }]}>
                {orderRef(notification.order_id)}
              </Text>
            ) : null}
            {when ? (
              <Text style={[styles.when, { color: theme.ink.tertiary }]}>{when}</Text>
            ) : null}
          </View>
        </View>

        {unread ? (
          <View style={[styles.dot, { backgroundColor: theme.palette.accent }]} />
        ) : null}
      </GlassPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.lg,
  },
  text: { flex: 1, gap: 3 },
  title: { ...Type.body },
  meta: { flexDirection: 'row', gap: Space.sm },
  ref: { ...Type.chip, fontFamily: MonoFont, letterSpacing: 0.6 },
  when: { ...Type.meta },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
