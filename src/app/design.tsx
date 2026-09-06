import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconAction, PrimaryAction, SecondaryAction } from '@/components/driver/actions';
import { AppHeader, Banner, EmptyState, SectionHeader } from '@/components/driver/chrome';
import {
  GlassField,
  InviteCodeField,
  LocaleToggle,
  SegmentedControl,
  ThemeToggle,
} from '@/components/driver/inputs';
import { NextStopCard } from '@/components/driver/next-stop-card';
import { ClosedOrderCard, OrderCard } from '@/components/driver/order-card';
import { QueueTabBar, type QueueTab } from '@/components/driver/queue-tab-bar';
import { StopSheet } from '@/components/driver/stop-sheet';
import { GlassPanel } from '@/components/glass/glass-panel';
import { ReturnCard } from '@/components/driver/return-card';
import { DeadlineChip } from '@/components/driver/deadline-chip';
import {
  ON_THE_WAY_STOPS,
  PHARMACY,
  READY_STOPS,
  RETURN_STOPS,
  TERMINAL_STOPS,
} from '@/design/fixtures';
import { STRINGS } from '@/locale/strings';
import { useTheme, useThemeMode } from '@/design/theme';
import { Radius, Space, Type } from '@/design/tokens';

/**
 * Design gallery — every driver surface, in every state, on mock data.
 *
 * A development route, not a product screen: it exists so the visual language
 * can be reviewed and regression-checked in one scroll before any of it is
 * wired to the API. It goes away once the real screens land.
 *
 * The FR/EN switch at the top is as much the point of the exercise as the
 * colours are — French labels run 15-30% longer, and a one-tap action that
 * truncates in French is a broken button (PRD 5.11).
 */
export default function DesignGallery() {
  const [locale, setLocale] = useState<'fr' | 'en'>('fr');
  const [tab, setTab] = useState<QueueTab>('ready');
  const [selected, setSelected] = useState<string[]>(() =>
    READY_STOPS[0] ? [READY_STOPS[0].id] : [],
  );
  const [authMode, setAuthMode] = useState<'signIn' | 'invite'>('signIn');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('K7M4');
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { mode, setMode } = useThemeMode();
  const t = STRINGS[locale];

  const counts = useMemo(
    () => ({
      ready: READY_STOPS.length,
      on_the_way: ON_THE_WAY_STOPS.length,
      to_hand_back: RETURN_STOPS.length,
      done: TERMINAL_STOPS.length,
    }),
    [],
  );

  const cardLabels = {
    cooler: t.cooler,
    priority: t.priority,
    packages: t.packages,
    accessibilityPrefix: t.accessibilityPrefix,
  };
  const closedLabels = {
    completed: t.completed,
    returned_to_pharmacy: t.returned_to_pharmacy,
    cancelled: t.cancelled,
    coolerPending: t.coolerPending,
  };

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const hero = ON_THE_WAY_STOPS[0];
  const rest = ON_THE_WAY_STOPS.slice(1);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Space.md, paddingBottom: insets.bottom + 140 },
        ]}
        showsVerticalScrollIndicator={false}>
        <AppHeader
          title={PHARMACY.name}
          subtitle={t.pharmacy}
          settingsLabel={t.settings}
          onSettings={() => {}}
        />

        <View style={styles.controlRow}>
          <LocaleToggle locale={locale} onChange={setLocale} />
          <ThemeToggle
            mode={mode}
            onChange={setMode}
            labels={{ dark: t.themeDark, light: t.themeLight }}
          />
        </View>

        <Caption color={theme.palette.accentDim} text="1 - Sign in / invite code" />
        <GlassPanel level="raised" radius={Radius.sheet} androidBlur contentStyle={styles.authCard}>
          <View style={styles.authBrand}>
            <View style={[styles.authMark, { backgroundColor: theme.palette.accent }]}>
              <Ionicons name="medkit" size={26} color={theme.palette.onAccent} />
            </View>
            <Text style={[styles.authTagline, { color: theme.ink.secondary }]}>{t.tagline}</Text>
          </View>
          <SegmentedControl
            value={authMode}
            onChange={setAuthMode}
            options={[
              { key: 'signIn' as const, label: t.signIn },
              { key: 'invite' as const, label: t.inviteCode },
            ]}
          />
          {authMode === 'signIn' ? (
            <>
              <GlassField
                label={t.driverId}
                value={email}
                onChangeText={setEmail}
                placeholder={t.emailPlaceholder}
                keyboardType="email-address"
                autoComplete="email"
                icon="mail-outline"
              />
              <GlassField
                label={t.password}
                value=""
                onChangeText={() => {}}
                secureTextEntry
                autoComplete="password"
                icon="lock-closed-outline"
              />
              <PrimaryAction label={t.signIn} />
            </>
          ) : (
            <>
              <InviteCodeField
                label={t.codeLabel}
                value={code}
                onChangeText={setCode}
                pasteLabel={t.paste}
              />
              <PrimaryAction label={t.inviteCode} />
            </>
          )}
        </GlassPanel>

        <Caption color={theme.palette.accentDim} text="2 - Ready tab, batch pickup" />
        <SectionHeader
          label={t.tabs.ready}
          trailing={
            <Text style={[styles.trailing, { color: theme.palette.accent }]}>
              {t.selected(selected.length)}
            </Text>
          }
        />
        {READY_STOPS.map((stop) => (
          <OrderCard
            key={stop.id}
            stop={stop}
            locale={locale}
            labels={cardLabels}
            selectable
            selected={selected.includes(stop.id)}
            onToggleSelect={() => toggle(stop.id)}
          />
        ))}
        <PrimaryAction
          label={`${t.takeCharge} (${selected.length})`}
          icon={<Ionicons name="cube-outline" size={20} color={theme.palette.onAccent} />}
        />

        <Caption color={theme.palette.accentDim} text="3 - On the way, active route" />
        <Banner tone="caution" icon="git-branch-outline" message={t.degraded} />
        {hero ? (
          <NextStopCard
            stop={hero}
            locale={locale}
            labels={{
              nextStop: t.nextStop,
              collect: t.collect,
              cooler: t.cooler,
              contact: t.contact,
              navigate: t.navigate,
            }}
          />
        ) : null}
        <SectionHeader
          label={t.upcoming}
          trailing={
            <IconAction
              label={t.optimize}
              icon={<Ionicons name="shuffle" size={18} color={theme.palette.accent} />}
            />
          }
        />
        {rest.map((stop) => (
          <OrderCard key={stop.id} stop={stop} locale={locale} labels={cardLabels} />
        ))}

        <Caption color={theme.palette.accentDim} text="4 - Stop detail, actions from server transitions" />
        {hero ? (
          <StopSheet
            stop={hero}
            locale={locale}
            transitions={['complete', 'return']}
            labels={{
              status: t.statusOnTheWay,
              client: t.client,
              callClient: t.callClient,
              callPharmacy: t.callPharmacy,
              navigate: t.navigate,
              window: t.window,
              promisedWindow: t.promisedWindow,
              amountDue: t.amountDue,
              paymentAtDoor: t.paymentAtDoor,
              cooler: t.cooler,
              pickup: t.takeCharge,
              delivered: t.delivered,
              returnOrder: t.returnOrder,
              handover: t.handedBack,
            }}
          />
        ) : null}

        <Caption
          color={theme.palette.accentDim}
          text="5 - A rapporter, the return leg. Label codes survive the PII strip"
        />
        <DeadlineChip
          deadline={PHARMACY.return_deadline}
          packages={RETURN_STOPS.reduce((n, stop) => n + stop.package_count, 0)}
          labels={{
            before: t.returnBefore,
            passed: t.returnDeadlinePassed,
            packages: t.packagesToReturn,
          }}
        />
        {RETURN_STOPS.map((stop) => (
          <ReturnCard
            key={stop.id}
            stop={stop}
            locale={locale}
            labels={{
              reasons: t.failureReasons,
              cooler: t.cooler,
              handedBack: t.handedBack,
            }}
          />
        ))}

        <Caption color={theme.palette.accentDim} text="6 - Done tab, no patient data by construction" />
        {TERMINAL_STOPS.map((stop) => (
          <ClosedOrderCard key={stop.id} stop={stop} locale={locale} labels={closedLabels} />
        ))}

        <Caption color={theme.palette.accentDim} text="7 - States" />
        <Banner tone="danger" icon="cloud-offline-outline" message={t.offline} />
        <EmptyState icon="file-tray-outline" title={t.emptyTitle} body={t.emptyBody} />
        <PrimaryAction label={t.delivered} loading />
        <PrimaryAction label={t.delivered} disabled />
        <SecondaryAction tone="danger" label={t.returnOrder} />
      </ScrollView>

      <View style={[styles.tabBar, { paddingBottom: insets.bottom + Space.sm }]}>
        <QueueTabBar active={tab} counts={counts} labels={t.tabs} onChange={setTab} />
      </View>
    </View>
  );
}

/** Gallery-only divider, so a reviewer can name what they are looking at. */
function Caption({ text, color }: { text: string; color: string }) {
  return <Text style={[styles.caption, { color }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Space.lg, gap: Space.md },
  controlRow: { flexDirection: 'row', gap: Space.sm, alignSelf: 'flex-start' },
  caption: {
    ...Type.label,
    textTransform: 'uppercase',
    marginTop: Space.xl,
  },
  trailing: { ...Type.meta },
  authCard: { padding: Space.xl, gap: Space.lg },
  authBrand: { alignItems: 'center', gap: Space.md },
  authMark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authTagline: { ...Type.meta },
  tabBar: {
    position: 'absolute',
    left: Space.lg,
    right: Space.lg,
    bottom: 0,
    paddingTop: Space.sm,
  },
});
