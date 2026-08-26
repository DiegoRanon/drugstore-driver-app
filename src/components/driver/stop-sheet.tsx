import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionPair, PrimaryAction, SecondaryAction } from '@/components/driver/actions';
import { Chip, WindowChip } from '@/components/driver/badges';
import { GlassPanel } from '@/components/glass/glass-panel';
import type { DriverTransition } from '@/api/transitions';
import type { ActiveStop } from '@/api/types';
import { useTheme } from '@/design/theme';
import { Radius, Space, Type } from '@/design/tokens';
import { DELIVERY_WINDOWS } from '@/lib/delivery-windows';
import { money } from '@/lib/format';

/**
 * The detail sheet — everything about one stop, and the action for its state.
 *
 * `transitions` is a prop rather than a status switch inside this component,
 * and the source of that prop is `src/api/transitions.ts`. It used to say the
 * array came from the server; that was never true of a driver payload and is
 * now demonstrably not — `available_transitions` exists only on the admin
 * `orderResponse`. The app mirrors `stateMachine.ts` in that one file, and the
 * live-API suite walks a real order through every state to keep the mirror
 * honest. This component stays dumb either way.
 *
 * The reference mockup opens with a map preview; there is none here because the
 * API exposes no coordinates for a stop. The address is the hero instead, set
 * large enough to read from a dashboard mount.
 */

export type StopTransition = DriverTransition;

type StopSheetProps = {
  stop: ActiveStop;
  locale: 'fr' | 'en';
  transitions: readonly StopTransition[];
  labels: {
    status: string;
    client: string;
    callClient: string;
    callPharmacy: string;
    window: string;
    amountDue: string;
    paymentAtDoor: string;
    cooler: string;
    pickup: string;
    delivered: string;
    returnOrder: string;
    handover: string;
  };
  busy?: StopTransition | null;
  onDismiss?: () => void;
  onCallClient?: () => void;
  onCallPharmacy?: () => void;
  onTransition?: (transition: StopTransition) => void;
};

export function StopSheet({
  stop,
  locale,
  transitions,
  labels,
  busy,
  onDismiss,
  onCallClient,
  onCallPharmacy,
  onTransition,
}: StopSheetProps) {
  const theme = useTheme();
  const [street, ...rest] = stop.address.split(',');
  const window = DELIVERY_WINDOWS[stop.delivery_window];
  const owes = stop.amount_due !== null && stop.amount_due > 0 && !stop.payment_collected;

  const sheet = (
    <GlassPanel level="raised" radius={Radius.sheet} androidBlur contentStyle={styles.sheet}>
      <View style={[styles.grabber, { backgroundColor: theme.tint.neutral.border }]} />

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        bounces={false}>
        <View style={styles.statusRow}>
          <Chip
            tint="accent"
            color={theme.palette.accent}
            icon={<Ionicons name="ellipse" size={9} color={theme.palette.accent} />}
            label={labels.status}
          />
          {stop.requires_cooler_bag ? (
            <Chip
              tint="cooler"
              color={theme.palette.cooler}
              icon={
                <MaterialCommunityIcons name="snowflake" size={14} color={theme.palette.cooler} />
              }
              label={labels.cooler}
            />
          ) : null}
        </View>

        <View style={styles.addressBlock}>
          <Text style={[styles.street, { color: theme.ink.primary }]}>{street?.trim()}</Text>
          {rest.length > 0 ? (
            <Text style={[styles.rest, { color: theme.ink.secondary }]}>
              {rest.join(',').trim()}
            </Text>
          ) : null}
          <Text style={[styles.client, { color: theme.ink.tertiary }]}>
            {labels.client} {stop.patient_name}
          </Text>
        </View>

        <ActionPair>
          <SecondaryAction
            label={labels.callClient}
            onPress={onCallClient}
            icon={<Ionicons name="call" size={18} color={theme.palette.accent} />}
          />
          <SecondaryAction
            label={labels.callPharmacy}
            onPress={onCallPharmacy}
            icon={<Ionicons name="business-outline" size={18} color={theme.ink.primary} />}
          />
        </ActionPair>

        <GlassPanel
          level="row"
          radius={Radius.control}
          elevated={false}
          contentStyle={styles.infoRow}>
          <Ionicons name="time-outline" size={20} color={theme.palette.accent} />
          <View style={styles.infoText}>
            <Text style={[styles.infoLabel, { color: theme.ink.tertiary }]}>{labels.window}</Text>
            <Text style={[styles.infoValue, { color: theme.ink.primary }]}>
              {window.start} – {window.end}
            </Text>
          </View>
          <WindowChip window={stop.delivery_window} locale={locale} />
        </GlassPanel>

        {owes ? (
          <GlassPanel
            level="row"
            tint="danger"
            radius={Radius.control}
            elevated={false}
            contentStyle={styles.dueRow}>
            <Ionicons name="alert-circle" size={20} color={theme.palette.danger} />
            <View style={styles.infoText}>
              <Text style={[styles.dueValue, { color: theme.palette.danger }]}>
                {labels.amountDue} {money(stop.amount_due ?? 0, locale)}
              </Text>
              <Text style={[styles.dueNote, { color: theme.palette.danger }]}>
                {labels.paymentAtDoor}
              </Text>
            </View>
          </GlassPanel>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        {transitions.includes('pickup') ? (
          <PrimaryAction
            label={labels.pickup}
            loading={busy === 'pickup'}
            onPress={() => onTransition?.('pickup')}
            icon={<Ionicons name="cube-outline" size={20} color={theme.palette.onAccent} />}
          />
        ) : null}
        {transitions.includes('complete') ? (
          <PrimaryAction
            label={labels.delivered}
            loading={busy === 'complete'}
            onPress={() => onTransition?.('complete')}
            icon={<Ionicons name="checkmark-circle" size={20} color={theme.palette.onAccent} />}
          />
        ) : null}
        {transitions.includes('handover') ? (
          <PrimaryAction
            label={labels.handover}
            loading={busy === 'handover'}
            onPress={() => onTransition?.('handover')}
            icon={
              <Ionicons name="checkmark-done" size={20} color={theme.palette.onAccent} />
            }
          />
        ) : null}
        {transitions.includes('return') ? (
          <SecondaryAction
            tone="danger"
            label={labels.returnOrder}
            onPress={() => onTransition?.('return')}
            icon={<Ionicons name="arrow-undo" size={18} color={theme.palette.danger} />}
          />
        ) : null}
      </View>
    </GlassPanel>
  );

  /*
    Rendered bare when no dismiss handler is given, so the design gallery and
    the component tests can mount it directly without a modal host.
  */
  if (!onDismiss) return sheet;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} accessibilityLabel="" onPress={onDismiss} />
      <View style={styles.host}>{sheet}</View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  host: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    paddingTop: Space.md,
    paddingBottom: Space.xl,
    paddingHorizontal: Space.xl,
    gap: Space.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    marginBottom: Space.sm,
  },
  body: { gap: Space.lg },
  statusRow: { flexDirection: 'row', gap: Space.sm, flexWrap: 'wrap' },
  addressBlock: { gap: 2 },
  street: { ...Type.display },
  rest: { ...Type.body, fontSize: 17 },
  client: { ...Type.meta, marginTop: 6 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  infoText: { flex: 1 },
  infoLabel: { ...Type.label, textTransform: 'uppercase' },
  infoValue: { ...Type.body, fontWeight: '700' },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  dueValue: { ...Type.body, fontWeight: '700', fontSize: 18 },
  dueNote: { ...Type.meta, opacity: 0.85 },
  actions: { gap: Space.md },
});
