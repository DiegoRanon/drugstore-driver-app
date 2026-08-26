import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryAction, SecondaryAction } from '@/components/driver/actions';
import { GlassPanel } from '@/components/glass/glass-panel';
import { MeshBackground } from '@/components/glass/mesh-background';
import type { ActiveStop, PackageType } from '@/api/types';
import { useTheme } from '@/design/theme';
import { MonoFont, Radius, Space, Type } from '@/design/tokens';
import { orderRef } from '@/lib/format';

/**
 * The label check at the counter.
 *
 * `domain_workflow.md` §Pendant prise en charge: *"le livreur prends les
 * commandes prête en vérifiant que les étiquettes correspondent aux commandes
 * qu'il a sur son application en collaborant avec l'employé."* This screen is
 * that check, and `confirmed_package_count` is its digital trace.
 *
 * **A mismatch never blocks.** The server accepts and logs a count that
 * disagrees with the order rather than refusing it, because the bags on the
 * counter are the truth and a driver standing there with an employee must not
 * be stuck behind a validation error. So the caution line here is information,
 * not a gate — the primary action stays enabled at any count, including zero.
 */

const PACKAGE_ICON: Record<PackageType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  bag: 'shopping-outline',
  cooler: 'snowflake',
  tote: 'basket-outline',
  envelope: 'email-outline',
};

export type PickupSheetLabels = {
  title: string;
  intro: string;
  packageTypes: Record<PackageType, string>;
  mismatch: (checked: number, expected: number) => string;
  confirm: (n: number) => string;
  cancel: string;
  progress: (done: number, total: number) => string;
};

export function PickupSheet({
  visible,
  stops,
  labels,
  busy = false,
  progress,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  stops: ActiveStop[];
  labels: PickupSheetLabels;
  busy?: boolean;
  /** `[done, total]` while a batch is draining. */
  progress?: [number, number];
  onCancel: () => void;
  /** One entry per order: the count the driver actually ticked. */
  onConfirm: (counts: Record<string, number>) => void;
}) {
  const theme = useTheme();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  const expected = useMemo(
    () => stops.reduce((sum, stop) => sum + stop.package_count, 0),
    [stops],
  );

  const countsByOrder = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const stop of stops) {
      counts[stop.id] = stop.packages.filter((parcel) => ticked.has(parcel.id)).length;
    }
    return counts;
  }, [stops, ticked]);

  function toggle(parcelId: string) {
    setTicked((previous) => {
      const next = new Set(previous);
      if (!next.delete(parcelId)) next.add(parcelId);
      return next;
    });
  }

  const mismatched = ticked.size !== expected;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} transparent>
      <MeshBackground>
        <View style={styles.root}>
          <View style={styles.heading}>
            <Text style={[styles.title, { color: theme.ink.primary }]}>{labels.title}</Text>
            <Text style={[styles.intro, { color: theme.ink.secondary }]}>{labels.intro}</Text>
          </View>

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {stops.map((stop) => (
              <GlassPanel
                key={stop.id}
                level="row"
                radius={Radius.card}
                contentStyle={styles.order}>
                <Text style={[styles.ref, { color: theme.ink.tertiary }]}>
                  {orderRef(stop.id)}
                </Text>
                <Text style={[styles.patient, { color: theme.ink.primary }]} numberOfLines={1}>
                  {stop.patient_name}
                </Text>

                {stop.packages.map((parcel) => {
                  const checked = ticked.has(parcel.id);
                  return (
                    <Pressable
                      key={parcel.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`${parcel.label_code}, ${labels.packageTypes[parcel.package_type]}`}
                      onPress={() => toggle(parcel.id)}
                      style={({ pressed }) => [
                        styles.parcel,
                        {
                          borderColor: checked
                            ? theme.palette.accent
                            : theme.tint.neutral.border,
                          backgroundColor: checked ? theme.tint.accent.fill : 'transparent',
                        },
                        pressed && styles.pressed,
                      ]}>
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={checked ? theme.palette.accent : theme.ink.tertiary}
                      />
                      <Text style={[styles.labelCode, { color: theme.ink.primary }]}>
                        {parcel.label_code}
                      </Text>
                      <MaterialCommunityIcons
                        name={PACKAGE_ICON[parcel.package_type]}
                        size={16}
                        color={theme.ink.tertiary}
                      />
                      <Text style={[styles.packageType, { color: theme.ink.tertiary }]}>
                        {labels.packageTypes[parcel.package_type]}
                      </Text>
                    </Pressable>
                  );
                })}
              </GlassPanel>
            ))}
          </ScrollView>

          <View style={styles.actions}>
            {mismatched ? (
              <Text style={[styles.mismatch, { color: theme.palette.caution }]}>
                {labels.mismatch(ticked.size, expected)}
              </Text>
            ) : null}
            {progress ? (
              <Text style={[styles.progress, { color: theme.ink.secondary }]}>
                {labels.progress(progress[0], progress[1])}
              </Text>
            ) : null}
            <PrimaryAction
              label={labels.confirm(stops.length)}
              loading={busy}
              onPress={() => onConfirm(countsByOrder)}
              icon={<Ionicons name="cube" size={20} color={theme.palette.onAccent} />}
            />
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
  intro: { ...Type.meta },
  list: { gap: Space.md, paddingBottom: Space.lg },
  order: { padding: Space.lg, gap: Space.sm },
  ref: { ...Type.chip, fontFamily: MonoFont, letterSpacing: 0.6 },
  patient: { ...Type.rowTitle },
  parcel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    minHeight: 52,
  },
  labelCode: { ...Type.body, fontFamily: MonoFont, letterSpacing: 0.8, flex: 1 },
  packageType: { ...Type.meta },
  actions: { paddingBottom: Space.xl, gap: Space.sm },
  mismatch: { ...Type.meta, textAlign: 'center' },
  progress: { ...Type.meta, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
