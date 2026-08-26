import Ionicons from '@expo/vector-icons/Ionicons';
import type { UseQueryResult } from '@tanstack/react-query';
import { router, useIsFocused } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader, Banner, EmptyState } from '@/components/driver/chrome';
import { NotificationBell } from '@/components/driver/notification-bell';
import { SecondaryAction } from '@/components/driver/actions';
import { useSession } from '@/auth/session-provider';
import { useTheme } from '@/design/theme';
import { Space, Type } from '@/design/tokens';
import { errorNotice } from '@/locale/error-message';
import { useStrings } from '@/locale/locale-provider';
import type { QueueResponse } from '@/api/types';

/**
 * The frame the four queue pages share.
 *
 * Ready, On the way, À rapporter, and Done differ only in which slice of the
 * payload they render and what "empty" means for them — the header, the
 * refresh behaviour, the error handling, and the loading state are identical,
 * and duplicating them four times is how they drift apart.
 */
export function QueueScreen<T>({
  query,
  items,
  keyExtractor,
  renderItem,
  emptyIcon,
  emptyTitle,
  emptyBody,
  banner,
  headerAction,
  footer,
}: {
  query: UseQueryResult<QueueResponse, Error>;
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactElement;
  emptyIcon: keyof typeof Ionicons.glyphMap;
  emptyTitle: string;
  emptyBody: string;
  /**
   * A page's own notice, rendered below the shared ones. Ready and On the way
   * say different things about the same arrival, so the message is composed by
   * the page rather than derived here.
   */
  banner?: React.ReactNode;
  /** Extra chrome beside the bell. The bell itself is rendered here. */
  headerAction?: React.ReactNode;
  /**
   * A batch action bar, pinned above the tab bar rather than scrolled with
   * the list: the driver reaches it with a thumb while reading the top of the
   * list, which is the whole point of "take these eight in charge".
   */
  footer?: React.ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const t = useStrings();
  const { state, signOut } = useSession();

  /**
   * Only the tab being looked at draws anything.
   *
   * Every scene in this navigator is transparent so the shared mesh shows
   * through — which means an inactive scene is not hidden behind the active
   * one, it shows *through* it. With patient names and addresses on two of the
   * three tabs, that ghosting is a PII leak between screens, not a cosmetic
   * bug (PRD §8.1).
   *
   * `detachInactiveScreens` is the platform answer and it is set on the
   * navigator, but it runs through `react-native-screens` and does nothing on
   * web. This is the part that holds everywhere.
   */
  const isFocused = useIsFocused();

  const pharmacyName =
    query.data?.pharmacy.name ??
    (state.status === 'signed-in' ? state.profile?.organization.name : undefined) ??
    t.pharmacy;

  function confirmSignOut() {
    Alert.alert(t.signOutConfirmTitle, t.signOutConfirmBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.signOut, style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  // A first load with nothing to show yet. A refetch over existing data stays
  // silent — the list is still correct, and a spinner over a readable queue is
  // just noise on a phone in a moving van.
  const showSpinner = query.isPending && items.length === 0;
  const notice = query.error ? errorNotice(query.error, t) : null;

  if (!isFocused) return <View style={styles.root} />;

  return (
    <View style={[styles.root, { paddingTop: insets.top + Space.sm }]}>
      <View style={styles.chrome}>
        <AppHeader
          title={pharmacyName}
          subtitle={query.data?.date}
          settingsLabel={t.signOut}
          onSettings={confirmSignOut}
          /*
            The bell lives here rather than on each page so all four tabs get
            it from one place — and it badges from `unread_notifications` on
            the queue payload, which means the count costs no extra request.
            The feed itself is only fetched when the screen opens.
          */
          trailing={
            <>
              {headerAction}
              <NotificationBell
                unread={query.data?.unread_notifications ?? 0}
                label={t.notifications}
                onPress={() => router.push('/notifications')}
              />
            </>
          }
        />

        {notice ? (
          <Banner
            tone="danger"
            icon="cloud-offline-outline"
            message={notice.message}
            action={
              <SecondaryAction
                label={t.retry}
                onPress={() => void query.refetch()}
                style={styles.retry}
              />
            }
          />
        ) : null}

        {/*
          The server answers with the previous sequence and `degraded: true`
          rather than failing when the optimizer is unreachable, so this is a
          note on a working screen, never an error state (PRD §5.4).
        */}
        {query.data?.degraded ? (
          <Banner tone="caution" icon="git-branch-outline" message={t.degraded} />
        ) : null}

        {banner}
      </View>

      {showSpinner ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.palette.accent} />
          <Text style={[styles.loadingText, { color: theme.ink.tertiary }]}>
            {t.loadingQueue}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={({ item, index }) => renderItem(item, index)}
          contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty]}
          ItemSeparatorComponent={Separator}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={theme.ink.secondary}
              colors={[theme.palette.accent]}
            />
          }
          ListEmptyComponent={
            <EmptyState icon={emptyIcon} title={emptyTitle} body={emptyBody} />
          }
        />
      )}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  chrome: { paddingHorizontal: Space.lg, gap: Space.md },
  list: { paddingHorizontal: Space.lg, paddingTop: Space.md, paddingBottom: Space.xxl },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  separator: { height: Space.md },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.md },
  loadingText: { ...Type.meta },
  retry: { flex: 0 },
  footer: { paddingHorizontal: Space.lg, paddingBottom: Space.sm, gap: Space.sm },
});
