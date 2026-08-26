import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { GlassPanel } from '@/components/glass/glass-panel';
import { useTheme } from '@/design/theme';
import { Radius, Space, Type } from '@/design/tokens';

/**
 * "À rapporter avant 18:00" — the one deadline in the driver's day.
 *
 * `pharmacy.return_deadline` is the pharmacy's closing arrangement, not a
 * server-enforced rule: nothing refuses a handover after it. That is exactly
 * why it has to be on screen. The workflow has the driver returning "avant une
 * certaine heure limite" and nobody chasing them if they do not.
 *
 * Past the hour it turns danger-coloured and changes wording rather than just
 * changing colour — PRD §7's encoding rule, and the difference between a
 * driver noticing at a glance and a colour-blind driver not noticing at all.
 */
export function DeadlineChip({
  deadline,
  packages,
  labels,
  now = new Date(),
}: {
  /** `HH:MM:SS` from the queue payload. Null when the org set none. */
  deadline: string | null;
  packages: number;
  labels: {
    before: (time: string) => string;
    passed: (time: string) => string;
    packages: (n: number) => string;
  };
  /** Injectable so the "past the deadline" branch is testable. */
  now?: Date;
}) {
  const theme = useTheme();
  if (!deadline) return null;

  // HH:MM is what a person reads; the seconds are an artifact of the column.
  const shown = deadline.slice(0, 5);
  const [hours, minutes] = shown.split(':').map(Number);
  const past =
    hours !== undefined &&
    minutes !== undefined &&
    (now.getHours() > hours || (now.getHours() === hours && now.getMinutes() > minutes));

  const color = past ? theme.palette.danger : theme.ink.secondary;

  return (
    <GlassPanel
      level="row"
      tint={past ? 'danger' : 'neutral'}
      radius={Radius.control}
      elevated={false}
      contentStyle={styles.row}>
      <Ionicons name={past ? 'alarm' : 'time-outline'} size={20} color={color} />
      <View style={styles.text}>
        <Text style={[styles.deadline, { color }]}>
          {past ? labels.passed(shown) : labels.before(shown)}
        </Text>
        {packages > 0 ? (
          <Text style={[styles.packages, { color: theme.ink.tertiary }]}>
            {labels.packages(packages)}
          </Text>
        ) : null}
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  text: { flex: 1 },
  deadline: { ...Type.body, fontWeight: '700' },
  packages: { ...Type.meta },
});
