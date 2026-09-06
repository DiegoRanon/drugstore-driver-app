import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { GlassPanel } from '@/components/glass/glass-panel';
import { useTheme } from '@/design/theme';
import { Radius, Space, Type } from '@/design/tokens';
import { clock, distance, duration } from '@/lib/format';

/**
 * The one number a driver looks up for: what time they are done.
 *
 * Sits above the run rather than on a card, because it is the only figure on
 * this screen that is about the *day* rather than about a stop. A driver
 * deciding whether to take a break, or whether they will make the pharmacy's
 * return deadline, is reading this line and nothing else.
 *
 * The finish time leads and is the largest thing here. The remaining duration
 * is the supporting figure — "16:42" is what gets compared against a deadline,
 * "1 h 20" is what gets compared against how tired you are.
 *
 * WHEN IT SHOWS NOTHING
 *
 * A degraded estimate renders as absent, not as zero. The provider being down
 * means we do not know when the run finishes; "0 min" would read as "you are
 * finished", and a driver would believe it. Absence is the honest answer and
 * the list below is unaffected either way.
 */
export function RouteEtaBanner({
  summary,
  loading = false,
  locale,
  labels,
}: {
  summary: {
    finishTime: string;
    totalDurationSeconds: number;
    totalDistanceMeters: number;
    unestimatedCount: number;
  } | null;
  /** A refresh in flight over a previous estimate, not a first load. */
  loading?: boolean;
  locale: 'fr' | 'en';
  labels: {
    /** e.g. "Fin estimée" */
    finishBy: string;
    /** Pluralised by the caller: "2 arrêts sans estimation". */
    partial: (count: number) => string;
  };
}) {
  const theme = useTheme();

  if (!summary) return null;

  const finish = clock(summary.finishTime, locale);
  if (!finish) return null;

  const remaining = [
    duration(summary.totalDurationSeconds),
    distance(summary.totalDistanceMeters, locale),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <GlassPanel
      level="row"
      tint="accent"
      radius={Radius.control}
      elevated={false}
      contentStyle={styles.banner}>
      <Ionicons name="flag-outline" size={18} color={theme.palette.accent} />

      <View style={styles.text}>
        <Text style={[styles.label, { color: theme.ink.tertiary }]}>
          {labels.finishBy}
        </Text>
        <Text style={[styles.finish, { color: theme.ink.primary }]}>{finish}</Text>
        {remaining ? (
          <Text style={[styles.remaining, { color: theme.ink.secondary }]}>
            {remaining}
          </Text>
        ) : null}
        {/*
          Said out loud rather than left to be inferred from a shorter list:
          an estimate that silently covers four of six stops is worse than one
          that admits it, because the driver would plan around the smaller
          number without knowing.
        */}
        {summary.unestimatedCount > 0 ? (
          <Text style={[styles.partial, { color: theme.palette.caution }]}>
            {labels.partial(summary.unestimatedCount)}
          </Text>
        ) : null}
      </View>

      {loading ? <ActivityIndicator size="small" color={theme.ink.tertiary} /> : null}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
  },
  text: { flex: 1, gap: 1 },
  label: { ...Type.label, textTransform: 'uppercase' },
  finish: { ...Type.title },
  remaining: { ...Type.meta },
  partial: { ...Type.meta },
});
