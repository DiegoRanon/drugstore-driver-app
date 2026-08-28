import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { IconAction } from '@/components/driver/actions';
import { GlassPanel } from '@/components/glass/glass-panel';
import { useTheme, type TintName } from '@/design/theme';
import { Radius, Space, Type } from '@/design/tokens';

/**
 * Header, section titles, banners, empty states — the quiet furniture.
 *
 * The brand line shows the **pharmacy's own name** from `/v1/auth/me`, not a
 * product wordmark. A driver belongs to exactly one organization (PRD §1), and
 * seeing their pharmacy at the top is how they confirm at a glance that they
 * are signed into the right account.
 */

export function AppHeader({
  title,
  subtitle,
  onSettings,
  settingsLabel,
  settingsIcon = 'settings-outline',
  trailing,
}: {
  title: string;
  subtitle?: string;
  onSettings?: () => void;
  settingsLabel: string;
  /** The glyph is the whole affordance here, so it names the action it runs. */
  settingsIcon?: keyof typeof Ionicons.glyphMap;
  trailing?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <View style={[styles.mark, { backgroundColor: theme.palette.accent }]}>
          <Ionicons name="medkit" size={20} color={theme.palette.onAccent} />
        </View>
        <View style={styles.brandText}>
          <Text style={[styles.title, { color: theme.ink.primary }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.ink.tertiary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {trailing}
      {onSettings ? (
        <IconAction
          label={settingsLabel}
          onPress={onSettings}
          icon={<Ionicons name={settingsIcon} size={20} color={theme.ink.secondary} />}
        />
      ) : null}
    </View>
  );
}

export function SectionHeader({ label, trailing }: { label: string; trailing?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: theme.ink.tertiary }]}>{label}</Text>
      {trailing}
    </View>
  );
}

/**
 * Exceptions the driver cannot miss but must not be blocked by: a route that
 * could not be optimized, writes still waiting to sync, no connectivity.
 *
 * Quiet by construction — the whole offline design goal is that degraded feels
 * identical to normal (PRD §6.4), so this is a band, never a modal.
 */
export function Banner({
  tone,
  icon,
  message,
  action,
}: {
  tone: Extract<TintName, 'caution' | 'accent' | 'danger' | 'neutral'>;
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
  action?: React.ReactNode;
}) {
  const theme = useTheme();
  const COLORS = {
    caution: theme.palette.caution,
    danger: theme.palette.danger,
    accent: theme.palette.accent,
    neutral: theme.ink.secondary,
  };
  const color = COLORS[tone];
  return (
    <GlassPanel
      level="row"
      tint={tone}
      radius={Radius.control}
      elevated={false}
      contentStyle={styles.banner}>
      <Ionicons name={icon} size={17} color={color} />
      <Text style={[styles.bannerText, { color }]}>{message}</Text>
      {action}
    </GlassPanel>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View
        style={[
          styles.emptyIcon,
          {
            backgroundColor: theme.tint.neutral.fill,
            borderColor: theme.tint.neutral.border,
          },
        ]}>
        <Ionicons name={icon} size={30} color={theme.ink.tertiary} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.ink.secondary }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: theme.ink.tertiary }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Space.md, flex: 1 },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { flex: 1 },
  title: { ...Type.body, fontWeight: '700', fontSize: 18 },
  subtitle: { ...Type.meta },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.sm,
  },
  sectionLabel: { ...Type.label, textTransform: 'uppercase' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  bannerText: { ...Type.meta, fontWeight: '600', flex: 1 },
  empty: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xxl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: Space.sm,
  },
  emptyTitle: { ...Type.body, fontWeight: '700' },
  emptyBody: { ...Type.meta, textAlign: 'center', maxWidth: 260 },
});
