import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { ActionPair, PrimaryAction, SecondaryAction } from '@/components/driver/actions';
import { GlassPanel } from '@/components/glass/glass-panel';
import { useTheme } from '@/design/theme';
import { Radius, Space, Type } from '@/design/tokens';

/**
 * "Avez-vous récupéré le sac réfrigérant ?"
 *
 * Three answers matter to the pharmacy's exceptions report and all three have
 * to survive: yes, no, and **never asked**. The last one is not a third value
 * sent to the server — it is *not calling the endpoint at all*, which leaves
 * `cooler_bag_confirmed` null. So "Plus tard" simply dismisses, and the
 * unanswered check stays badged on the card so the driver can answer from the
 * van before end of day.
 *
 * Never a gate. It is a QC record, and a driver with the next delivery already
 * waiting must be able to walk away from it.
 */
export function CoolerPrompt({
  visible,
  labels,
  busy = false,
  onAnswer,
  onDismiss,
}: {
  visible: boolean;
  labels: { question: string; yes: string; no: string; later: string };
  busy?: boolean;
  onAnswer: (confirmed: boolean) => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onDismiss} transparent>
      <View style={styles.backdrop}>
        <GlassPanel
          level="raised"
          radius={Radius.sheet}
          androidBlur
          contentStyle={styles.card}>
          <MaterialCommunityIcons
            name="snowflake"
            size={36}
            color={theme.palette.cooler}
          />
          <Text style={[styles.question, { color: theme.ink.primary }]}>
            {labels.question}
          </Text>
          <ActionPair>
            <SecondaryAction
              label={labels.no}
              disabled={busy}
              onPress={() => onAnswer(false)}
            />
            <PrimaryAction
              label={labels.yes}
              loading={busy}
              onPress={() => onAnswer(true)}
              style={styles.yes}
            />
          </ActionPair>
          <SecondaryAction label={labels.later} disabled={busy} onPress={onDismiss} />
        </GlassPanel>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: { padding: Space.xl, gap: Space.lg, alignItems: 'center' },
  question: { ...Type.rowTitle, textAlign: 'center' },
  yes: { flex: 1 },
});
