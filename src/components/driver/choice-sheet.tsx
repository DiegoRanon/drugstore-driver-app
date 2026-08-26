import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryAction, SecondaryAction } from '@/components/driver/actions';
import { GlassPanel } from '@/components/glass/glass-panel';
import { MeshBackground } from '@/components/glass/mesh-background';
import { useTheme } from '@/design/theme';
import { Radius, Space, TapTarget, Type } from '@/design/tokens';

/**
 * Pick one reason from a closed set, optionally say why in your own words.
 *
 * Both places a driver has to justify something have exactly this shape — the
 * return reason and the payment exception — and both write into a 500-char
 * admin-only note that the driver will never see again. One component, so the
 * character cap and the "confirm is disabled until something is chosen" rule
 * are stated once.
 *
 * `lead` is what makes the payment-exception case honest: the workflow has the
 * driver *phone the pharmacy and be told what to do*, so that sheet leads with
 * a call button and the options below it record the answer. They are not a
 * decision the app invites the driver to make alone.
 */

export type Choice<T extends string> = { value: T; label: string };

const NOTE_MAX = 500;

export function ChoiceSheet<T extends string>({
  visible,
  title,
  hint,
  lead,
  choices,
  initial,
  busy = false,
  destructive = false,
  labels,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  hint?: string;
  /** Rendered above the options — the "call the pharmacy" action. */
  lead?: React.ReactNode;
  choices: readonly Choice<T>[];
  initial?: T;
  busy?: boolean;
  destructive?: boolean;
  labels: { note: string; remaining: (n: number) => string; confirm: string; cancel: string };
  onCancel: () => void;
  onConfirm: (choice: T, note?: string) => void;
}) {
  const theme = useTheme();
  const [chosen, setChosen] = useState<T | undefined>(initial);
  const [note, setNote] = useState('');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} transparent>
      <MeshBackground>
        <View style={styles.root}>
          <View style={styles.heading}>
            <Text style={[styles.title, { color: theme.ink.primary }]}>{title}</Text>
            {hint ? (
              <Text style={[styles.hint, { color: theme.ink.secondary }]}>{hint}</Text>
            ) : null}
          </View>

          {lead}

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {choices.map((choice) => {
              const active = chosen === choice.value;
              return (
                <Pressable
                  key={choice.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={choice.label}
                  onPress={() => setChosen(choice.value)}
                  style={({ pressed }) => [
                    styles.choice,
                    {
                      borderColor: active ? theme.palette.accent : theme.tint.neutral.border,
                      backgroundColor: active ? theme.tint.accent.fill : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={active ? theme.palette.accent : theme.ink.tertiary}
                  />
                  <Text style={[styles.choiceText, { color: theme.ink.primary }]}>
                    {choice.label}
                  </Text>
                </Pressable>
              );
            })}

            <GlassPanel
              level="row"
              radius={Radius.control}
              elevated={false}
              contentStyle={styles.field}>
              <Text style={[styles.label, { color: theme.ink.tertiary }]}>{labels.note}</Text>
              <TextInput
                accessibilityLabel={labels.note}
                value={note}
                onChangeText={(next) => setNote(next.slice(0, NOTE_MAX))}
                multiline
                maxLength={NOTE_MAX}
                style={[styles.input, { color: theme.ink.primary }]}
              />
              <Text style={[styles.remaining, { color: theme.ink.tertiary }]}>
                {labels.remaining(NOTE_MAX - note.length)}
              </Text>
            </GlassPanel>
          </ScrollView>

          <View style={styles.actions}>
            {destructive ? (
              <SecondaryAction
                tone="danger"
                label={labels.confirm}
                disabled={!chosen || busy}
                onPress={() => chosen && onConfirm(chosen, note.trim() || undefined)}
                icon={<Ionicons name="arrow-undo" size={18} color={theme.palette.danger} />}
              />
            ) : (
              <PrimaryAction
                label={labels.confirm}
                loading={busy}
                disabled={!chosen}
                onPress={() => chosen && onConfirm(chosen, note.trim() || undefined)}
              />
            )}
            <SecondaryAction label={labels.cancel} disabled={busy} onPress={onCancel} />
          </View>
        </View>
      </MeshBackground>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Space.xxl, paddingHorizontal: Space.lg, gap: Space.lg },
  heading: { gap: 4 },
  title: { ...Type.display, fontSize: 26 },
  hint: { ...Type.meta },
  list: { gap: Space.sm, paddingBottom: Space.lg },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: TapTarget + 4,
    borderWidth: 1.5,
    borderRadius: Radius.control,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  choiceText: { ...Type.body, flex: 1 },
  field: { paddingHorizontal: Space.md, paddingVertical: Space.md, gap: 4 },
  label: { ...Type.label, textTransform: 'uppercase' },
  input: { ...Type.body, minHeight: 72, padding: 0, textAlignVertical: 'top' },
  remaining: { ...Type.meta, textAlign: 'right' },
  actions: { paddingBottom: Space.xl, gap: Space.sm },
  pressed: { opacity: 0.72 },
});
