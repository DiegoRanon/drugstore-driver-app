import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryAction, SecondaryAction } from '@/components/driver/actions';
import { GlassPanel } from '@/components/glass/glass-panel';
import { MeshBackground } from '@/components/glass/mesh-background';
import type { PaymentMethod, PaymentTaken } from '@/api/types';
import { useTheme } from '@/design/theme';
import { Radius, Space, TapTarget, Type } from '@/design/tokens';
import { money } from '@/lib/format';

/**
 * The one guard on the Delivered tap.
 *
 * No digital payments happen here. The driver carries a physical POS terminal
 * or takes cash; this records the outcome, and that record is what the
 * pharmacy reconciles against at the end of the shift.
 *
 * The amount is pre-filled with what is owed because that is the case in
 * nearly every delivery — the common path is one tap on Cash or Card and then
 * confirm. A partial collection is possible and is not an error; the server
 * reports `matches_amount_due` and the pharmacy sorts it out.
 *
 * The third action is the workflow's scénario A tail: *"Si le client n'a pas
 * la possibilité de payer, le livreur doit appeler la pharmacie et demander
 * quoi faire."* It is deliberately not styled as a shortcut past the payment.
 */
export function PaymentSheet({
  visible,
  amountDue,
  locale,
  busy = false,
  labels,
  onCancel,
  onCannotPay,
  onConfirm,
}: {
  visible: boolean;
  amountDue: number;
  locale: 'fr' | 'en';
  busy?: boolean;
  labels: {
    amountDue: string;
    amountCollected: string;
    cash: string;
    card: string;
    confirm: string;
    cannotPay: string;
    cancel: string;
  };
  onCancel: () => void;
  onCannotPay: () => void;
  onConfirm: (payment: PaymentTaken) => void;
}) {
  const theme = useTheme();
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [amount, setAmount] = useState(String(amountDue));

  const parsed = Number(amount.replace(',', '.'));
  const valid = Number.isFinite(parsed) && parsed >= 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} transparent>
      <MeshBackground>
        <View style={styles.root}>
          <View style={styles.amountBlock}>
            <Text style={[styles.label, { color: theme.ink.tertiary }]}>
              {labels.amountDue}
            </Text>
            <Text style={[styles.amount, { color: theme.palette.money }]}>
              {money(amountDue, locale)}
            </Text>
          </View>

          <View style={styles.methods}>
            {(['cash', 'card'] as const).map((option) => {
              const active = method === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={labels[option]}
                  onPress={() => setMethod(option)}
                  style={({ pressed }) => [
                    styles.method,
                    {
                      borderColor: active ? theme.palette.accent : theme.tint.neutral.border,
                      backgroundColor: active ? theme.tint.accent.fill : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Ionicons
                    name={option === 'cash' ? 'cash-outline' : 'card-outline'}
                    size={24}
                    color={active ? theme.palette.accent : theme.ink.secondary}
                  />
                  <Text
                    style={[
                      styles.methodText,
                      { color: active ? theme.palette.accent : theme.ink.primary },
                    ]}>
                    {labels[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <GlassPanel
            level="row"
            radius={Radius.control}
            elevated={false}
            contentStyle={styles.field}>
            <Text style={[styles.label, { color: theme.ink.tertiary }]}>
              {labels.amountCollected}
            </Text>
            <TextInput
              accessibilityLabel={labels.amountCollected}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              selectTextOnFocus
              style={[styles.input, { color: theme.ink.primary }]}
            />
          </GlassPanel>

          <View style={styles.actions}>
            <PrimaryAction
              label={labels.confirm}
              loading={busy}
              disabled={!valid}
              onPress={() =>
                onConfirm({ payment_method: method, amount_collected: parsed })
              }
              icon={
                <Ionicons name="checkmark-circle" size={20} color={theme.palette.onAccent} />
              }
            />
            <SecondaryAction
              tone="danger"
              label={labels.cannotPay}
              disabled={busy}
              onPress={onCannotPay}
              icon={<Ionicons name="call" size={18} color={theme.palette.danger} />}
            />
            <SecondaryAction label={labels.cancel} disabled={busy} onPress={onCancel} />
          </View>
        </View>
      </MeshBackground>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Space.lg,
    paddingBottom: Space.xl,
    gap: Space.lg,
  },
  amountBlock: { alignItems: 'center', gap: 4 },
  label: { ...Type.label, textTransform: 'uppercase' },
  amount: { ...Type.display, fontSize: 44 },
  methods: { flexDirection: 'row', gap: Space.md },
  method: {
    flex: 1,
    minHeight: TapTarget + 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: Radius.control,
    paddingVertical: Space.md,
  },
  methodText: { ...Type.action },
  field: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: 2,
  },
  input: { ...Type.display, fontSize: 28, padding: 0 },
  actions: { gap: Space.sm },
  pressed: { opacity: 0.72 },
});
