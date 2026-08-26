import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconAction, SecondaryAction } from '@/components/driver/actions';
import { Banner, EmptyState } from '@/components/driver/chrome';
import { NotificationRow } from '@/components/driver/notification-row';
import { useTheme } from '@/design/theme';
import { Space, Type } from '@/design/tokens';
import { errorNotice } from '@/locale/error-message';
import { useStrings } from '@/locale/locale-provider';
import { useMarkNotificationsRead, useNotifications } from '@/queue/use-notifications';

/**
 * The feed.
 *
 * A pushed Stack screen rather than a fifth tab: it is a destination the
 * driver visits and leaves, it should cover the tab bar, and adding it to the
 * `Tabs` navigator with `href: null` would force `ROUTE_TO_TAB` to answer for
 * a route that is not a tab.
 *
 * Because it is pushed rather than replacing, the tab group underneath stays
 * mounted — which matters more than it looks: `GlassTabBar` holds the only
 * long-lived observer on the queue query, and under `gcTime: 0` an optimistic
 * write made just before opening this screen would be collected without it.
 */
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const t = useStrings();

  const query = useNotifications();
  const markRead = useMarkNotificationsRead();

  const notifications = query.data?.data ?? [];
  const unread = query.data?.unread_count ?? 0;
  const notice = query.error ? errorNotice(query.error, t) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + Space.sm }]}>
      <View style={styles.chrome}>
        <View style={styles.header}>
          <IconAction
            icon={<Ionicons name="chevron-back" size={22} color={theme.ink.primary} />}
            label={t.cancel}
            onPress={() => router.back()}
          />
          <Text style={[styles.title, { color: theme.ink.primary }]}>
            {t.notifications}
          </Text>
        </View>

        {notice ? (
          <Banner tone="danger" icon="cloud-offline-outline" message={notice.message} />
        ) : null}

        {unread > 0 ? (
          <SecondaryAction
            label={t.markAllRead}
            disabled={markRead.isPending}
            onPress={() => markRead.mutate({})}
            icon={
              <Ionicons name="checkmark-done" size={18} color={theme.palette.accent} />
            }
          />
        ) : null}
      </View>

      {query.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.palette.accent} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationRow
              notification={item}
              labels={t.notificationTypes}
              /*
                Tapping marks this one read and goes back to the run. It does
                not deep-link to the order: a driver-scoped read of a single
                order does not exist server-side, so the only honest target is
                the tab the order is already on.
              */
              onPress={() => {
                if (item.read_at === null) markRead.mutate({ ids: [item.id] });
                router.back();
              }}
            />
          )}
          contentContainerStyle={[
            styles.list,
            notifications.length === 0 && styles.listEmpty,
          ]}
          ItemSeparatorComponent={Separator}
          showsVerticalScrollIndicator={false}
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-off-outline"
              title={t.notificationsEmptyTitle}
              body={t.notificationsEmptyBody}
            />
          }
        />
      )}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  chrome: { paddingHorizontal: Space.lg, gap: Space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  title: { ...Type.display, fontSize: 24 },
  list: { paddingHorizontal: Space.lg, paddingTop: Space.md, paddingBottom: Space.xxl },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  separator: { height: Space.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
