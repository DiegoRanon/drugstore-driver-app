import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Radius, TapTarget, Type } from '@/design/tokens';

/**
 * The way into the feed, badged from `unread_notifications` on the queue
 * payload.
 *
 * The count rides on a request the app already makes every thirty seconds, so
 * the badge is free; the feed itself is fetched only when the screen opens.
 * A second poll against `GET /v1/driver/notifications` to render a number the
 * queue already returned would double the request budget for nothing.
 */
export function NotificationBell({
  unread,
  label,
  onPress,
}: {
  unread: number;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `${label}, ${unread}` : label}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.tint.neutral.fill, borderColor: theme.tint.neutral.border },
        pressed && styles.pressed,
      ]}>
      <Ionicons
        name={unread > 0 ? 'notifications' : 'notifications-outline'}
        size={20}
        color={unread > 0 ? theme.palette.accent : theme.ink.primary}
      />
      {unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.palette.accent }]}>
          <Text style={[styles.badgeText, { color: theme.palette.onAccent }]}>
            {unread > 99 ? '99+' : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: TapTarget,
    height: TapTarget,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...Type.chip, fontSize: 10 },
  pressed: { opacity: 0.72 },
});
