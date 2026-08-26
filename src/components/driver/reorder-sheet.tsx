import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryAction, SecondaryAction } from '@/components/driver/actions';
import { Banner } from '@/components/driver/chrome';
import { ReorderList } from '@/components/driver/reorder-list';
import { MeshBackground } from '@/components/glass/mesh-background';
import type { ActiveStop } from '@/api/types';
import { useTheme } from '@/design/theme';
import { Space, Type } from '@/design/tokens';
import { errorNotice } from '@/locale/error-message';
import { useStrings } from '@/locale/locale-provider';
import { useOptimize, useSequence } from '@/queue/mutations';
import { sortStops } from '@/queue/optimistic';
import { useQueueSlices } from '@/queue/use-queue';

/**
 * "Le livreur détermine manuellement l'itinéraire le plus rapide."
 *
 * Three things about `POST /v1/driver/queue/sequence` shape this screen, and
 * all three are easy to get wrong:
 *
 * 1. **It edits the whole day, not the van.** The server clears
 *    `sequence_number` on any active order missing from `ordered_order_ids`,
 *    so a sheet that listed only `picked_up` stops would silently unsequence
 *    everything still at the counter. Ready and On the way are one list here,
 *    even though the entry point is On the way.
 * 2. **Priority beats position.** The server sorts `is_priority DESC` ahead of
 *    `sequence_number`, so a stop dragged above a priority one comes back
 *    below it. `sortStops` — the same comparator the optimistic reducers use —
 *    is applied on every change, so the snap-back happens under the finger
 *    rather than a second later on screen.
 * 3. **The response is the whole queue**, so it is written straight into the
 *    cache. No invalidate, no second round trip.
 *
 * A full-screen modal rather than a route: the tab group underneath stays
 * mounted, which is what keeps the queue's cache entry alive under `gcTime: 0`.
 */
export function ReorderSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      {/*
        The body is mounted only while the sheet is open, so its working copy
        of the list is seeded once by `useState` and thrown away on close.
        The alternative — holding the list above and re-seeding it in an
        effect when `visible` flips — is a cascading render, and worse, an
        effect that also has to *not* re-run on every 30-second poll or it
        would fight the driver's dragging.
      */}
      {visible ? <ReorderBody onClose={onClose} /> : null}
    </Modal>
  );
}

function ReorderBody({ onClose }: { onClose: () => void }) {
  const { slices } = useQueueSlices();
  const t = useStrings();
  const theme = useTheme();

  const sequence = useSequence();
  const optimize = useOptimize();

  /*
    Ready first, then the van — the server's own bucket order, and the order
    the day actually happens in. Seeded once on open: an order the pharmacy
    adds while the sheet is up would otherwise land mid-drag, and one added
    before it opened is picked up on the next open.
  */
  const [ordered, setOrdered] = useState<ActiveStop[]>(() =>
    sortStops([...slices.ready, ...slices.onTheWay]),
  );

  const notice = sequence.error ? errorNotice(sequence.error, t) : null;

  function save() {
    sequence.mutate(
      { orderedIds: ordered.map((stop) => stop.id) },
      { onSuccess: onClose },
    );
  }

  return (
    <MeshBackground>
        <View style={styles.root}>
          <View style={styles.heading}>
            <Text style={[styles.title, { color: theme.ink.primary }]}>
              {t.reorderTitle}
            </Text>
            <Text style={[styles.hint, { color: theme.ink.secondary }]}>{t.reorderHint}</Text>
          </View>

          {notice ? (
            <Banner tone="danger" icon="alert-circle-outline" message={notice.message} />
          ) : null}
          {optimize.data?.degraded ? (
            <Banner tone="caution" icon="git-branch-outline" message={t.degraded} />
          ) : null}

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            <ReorderList
              stops={ordered}
              labels={{ priority: t.priority, moveUp: t.moveUp, moveDown: t.moveDown }}
              onChange={(next) => setOrdered(sortStops(next))}
            />
          </ScrollView>

          <View style={styles.actions}>
            <PrimaryAction
              label={t.saveOrder}
              loading={sequence.isPending}
              disabled={ordered.length === 0}
              onPress={save}
              icon={
                <Ionicons name="checkmark-circle" size={20} color={theme.palette.onAccent} />
              }
            />
            {/*
              Secondary, not primary. The optimizer is a suggestion; the driver
              knows the territory, and the workflow puts them in charge of the
              order.
            */}
            <SecondaryAction
              label={t.optimize}
              disabled={optimize.isPending || sequence.isPending}
              onPress={() => optimize.mutate({})}
              icon={<Ionicons name="git-branch" size={18} color={theme.ink.primary} />}
            />
            <SecondaryAction
              label={t.cancel}
              disabled={sequence.isPending}
              onPress={onClose}
            />
          </View>
        </View>
    </MeshBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Space.xxl, paddingHorizontal: Space.lg, gap: Space.md },
  heading: { gap: 4 },
  title: { ...Type.display, fontSize: 26 },
  hint: { ...Type.meta },
  list: { paddingVertical: Space.md },
  actions: { paddingBottom: Space.xl, gap: Space.sm },
});
