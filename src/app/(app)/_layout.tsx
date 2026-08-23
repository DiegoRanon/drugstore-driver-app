import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QueueTabBar, type QueueTab } from '@/components/driver/queue-tab-bar';
import { Space } from '@/design/tokens';
import { useStrings } from '@/locale/locale-provider';
import { useQueueSlices } from '@/queue/use-queue';

/**
 * The three states of a driver's day, one route each.
 *
 * A real tab navigator rather than a segmented control over one screen: each
 * state keeps its own scroll position, the back button behaves, and a stop can
 * be linked to directly. The bar itself is the glass component from the design
 * system, driven here by navigation state instead of local state.
 */

/**
 * What the navigator hands a custom tab bar.
 *
 * Derived from `Tabs` rather than imported from `@react-navigation/bottom-tabs`
 * — that package is a transitive dependency of expo-router and is not resolvable
 * by name from here, so taking the type off the prop keeps it correct without a
 * deep import into someone else's build output.
 */
type GlassTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Route segment ⇄ the design system's tab key. */
const ROUTE_TO_TAB: Record<string, QueueTab> = {
  ready: 'ready',
  'on-the-way': 'on_the_way',
  done: 'done',
};

const TAB_TO_ROUTE: Record<QueueTab, string> = {
  ready: 'ready',
  on_the_way: 'on-the-way',
  done: 'done',
};

function GlassTabBar({ state, navigation }: GlassTabBarProps) {
  const insets = useSafeAreaInsets();
  const t = useStrings();

  // Counts come from the same cached queue the pages render, so the badge and
  // the list can never disagree — one request, one source of truth.
  const { slices } = useQueueSlices();

  const currentRoute = state.routes[state.index]?.name ?? 'ready';
  const active = ROUTE_TO_TAB[currentRoute] ?? 'ready';

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom || Space.md }]}>
      <QueueTabBar
        active={active}
        counts={slices.counts}
        labels={t.tabs}
        onChange={(tab) => {
          const target = TAB_TO_ROUTE[tab];
          // `navigate`, not `push`: tapping a tab returns to it, never stacks
          // a second copy of it.
          if (target !== currentRoute) navigation.navigate(target);
        }}
      />
    </View>
  );
}

export default function AppLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      /*
        Every scene here is transparent so the shared mesh shows through, which
        means an inactive scene left in the view hierarchy is not hidden — it
        shows *through* the active one, and the ghost text is patient names and
        addresses from another tab. Detaching is what keeps one screen's PII off
        another screen (PRD §8.1). It defaults to true only on Android, so iOS
        needs it said out loud.
      */
      detachInactiveScreens
      screenOptions={{
        headerShown: false,
        // The mesh lives behind the whole navigator; an opaque scene would
        // paint over it and the glass would have nothing to refract.
        sceneStyle: { backgroundColor: 'transparent' },
        // Belt and braces on native: a detached screen that is also frozen
        // cannot re-render a stale queue behind the one being read.
        freezeOnBlur: true,
      }}>
      <Tabs.Screen name="ready" />
      <Tabs.Screen name="on-the-way" />
      <Tabs.Screen name="done" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: Space.lg, paddingTop: Space.sm },
});
