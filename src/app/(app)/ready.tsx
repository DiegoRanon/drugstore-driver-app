import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryAction, SecondaryAction } from '@/components/driver/actions';
import { Banner } from '@/components/driver/chrome';
import { OrderCard } from '@/components/driver/order-card';
import { PickupSheet } from '@/components/driver/pickup-sheet';
import { QueueScreen } from '@/components/driver/queue-screen';
import { ShiftAlertBanner } from '@/components/driver/shift-alert-banner';
import { useTheme } from '@/design/theme';
import { Space } from '@/design/tokens';
import { money } from '@/lib/format';
import { errorNotice } from '@/locale/error-message';
import { useLocale, useStrings } from '@/locale/locale-provider';
import { usePickup } from '@/queue/mutations';
import { useQueueSlices } from '@/queue/use-queue';

/**
 * Ready — packages waiting at the counter (`in_pharmacy`).
 *
 * The whole screen is shaped by one fact from `domain_workflow.md`: the driver
 * is standing at the counter with an employee, holding a phone in one hand and
 * bags in the other. So pickup is a batch — tick the ones on the counter,
 * check the labels once, confirm once — and not fifteen round trips the driver
 * has to watch.
 *
 * A failure on one order never blocks the rest. `Promise.allSettled`, not
 * `Promise.all`: an order the admin reassigned thirty seconds ago answers 404
 * or 409, and that must cost the driver one card, not the whole batch.
 */
export default function ReadyScreen() {
  const { query, slices } = useQueueSlices();
  const { locale } = useLocale();
  const t = useStrings();
  const theme = useTheme();

  const pickup = usePickup();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<[number, number] | undefined>();
  const [batchError, setBatchError] = useState<Error | null>(null);

  const stops = slices.ready;
  const chosen = useMemo(
    () => stops.filter((stop) => selected.has(stop.id)),
    [stops, selected],
  );

  const toggle = useCallback((id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  async function takeInCharge(counts: Record<string, number>) {
    setBatchError(null);
    setProgress([0, chosen.length]);

    let done = 0;
    const results = await Promise.allSettled(
      chosen.map(async (stop) => {
        try {
          return await pickup.mutateAsync({
            id: stop.id,
            confirmedPackageCount: counts[stop.id],
          });
        } finally {
          done += 1;
          setProgress([done, chosen.length]);
        }
      }),
    );

    /*
      One message for the batch rather than one per card. The driver is holding
      bags; what they need to know is that something did not go through, and
      the cards still sitting in Ready are what say which.
    */
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      setBatchError(
        failure.reason instanceof Error
          ? failure.reason
          : new Error(String(failure.reason)),
      );
    }

    setProgress(undefined);
    setChecking(false);
    setSelected(new Set());
  }

  const notice = batchError ? errorNotice(batchError, t) : null;
  const totals = slices.totals;

  return (
    <>
      <QueueScreen
        query={query}
        items={stops}
        keyExtractor={(stop) => stop.id}
        banner={
          <>
            <ShiftAlertBanner variant="assigned" />
            {/*
              "Le livreur ramasse le terminal de paiement si des commandes
              requièrent une récolte de paiement." The server already worked
              out whether that is true for the day; this only has to say so
              while the driver is still in the building.
            */}
            {totals?.requires_payment_terminal ? (
              <Banner
                tone="caution"
                icon="card-outline"
                message={t.takeTerminal(
                  totals.payment_stop_count,
                  money(totals.amount_due_total, locale),
                )}
              />
            ) : null}
            {notice ? (
              <Banner tone="danger" icon="alert-circle-outline" message={notice.message} />
            ) : null}
          </>
        }
        renderItem={(stop) => (
          <OrderCard
            stop={stop}
            locale={locale}
            selectable
            selected={selected.has(stop.id)}
            onToggleSelect={() => toggle(stop.id)}
            labels={{
              cooler: t.cooler,
              priority: t.priority,
              packages: t.packages,
              accessibilityPrefix: t.accessibilityPrefix,
            }}
          />
        )}
        footer={
          stops.length > 0 ? (
            <View style={styles.footer}>
              <PrimaryAction
                label={t.takeChargeCount(chosen.length)}
                disabled={chosen.length === 0 || pickup.isPending}
                loading={pickup.isPending}
                onPress={() => setChecking(true)}
                icon={<Ionicons name="cube" size={20} color={theme.palette.onAccent} />}
              />
              {selected.size < stops.length ? (
                <SecondaryAction
                  label={t.selectAll}
                  onPress={() => setSelected(new Set(stops.map((stop) => stop.id)))}
                />
              ) : null}
            </View>
          ) : null
        }
        emptyIcon="file-tray-outline"
        emptyTitle={t.readyEmptyTitle}
        emptyBody={t.readyEmptyBody}
      />

      <PickupSheet
        visible={checking}
        stops={chosen}
        busy={pickup.isPending}
        progress={progress}
        labels={{
          title: t.pickupTitle,
          intro: t.pickupIntro,
          packageTypes: t.packageTypes,
          mismatch: t.countMismatch,
          confirm: t.takeChargeCount,
          cancel: t.cancel,
          progress: t.batchProgress,
        }}
        onCancel={() => setChecking(false)}
        onConfirm={(counts) => void takeInCharge(counts)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  footer: { gap: Space.sm },
});
