import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert } from 'react-native';

import { PrimaryAction } from '@/components/driver/actions';
import { Banner } from '@/components/driver/chrome';
import { DeadlineChip } from '@/components/driver/deadline-chip';
import { QueueScreen } from '@/components/driver/queue-screen';
import { ReturnCard } from '@/components/driver/return-card';
import { useTheme } from '@/design/theme';
import { errorNotice } from '@/locale/error-message';
import { useLocale, useStrings } from '@/locale/locale-provider';
import { useBatchHandover, useHandover } from '@/queue/mutations';
import { useQueueSlices } from '@/queue/use-queue';

/**
 * À rapporter — failed deliveries still in the van.
 *
 * These orders are **not** terminal. `picked_up → returned → returned_to_pharmacy`
 * is the real lifecycle, and `returned` means one thing: the package is with
 * the driver and the pharmacy is still owed it. The PRD used to say a return
 * was instantaneous and terminal, with no tracked return leg; the server
 * proved that wrong, and this screen is the leg.
 *
 * It is also PII-free, despite being open. The delivery attempt is over, so
 * the server strips the patient's name, address, and phone — but keeps the
 * label codes, because matching parcels at the counter is the entire job here.
 *
 * The whole stack at once is the default action: the driver puts the bags on
 * the counter, the employee takes them, one tap. `POST /returns/handover` runs
 * them in a single transaction, so it is all or nothing — which is what a
 * counter looks like. The per-card button covers the pharmacy taking some now
 * and the rest later.
 */
export default function ToHandBackScreen() {
  const { query, slices } = useQueueSlices();
  const { locale } = useLocale();
  const t = useStrings();
  const theme = useTheme();

  const handover = useHandover();
  const batch = useBatchHandover();
  const busy = handover.isPending || batch.isPending;

  const failure = batch.error ?? handover.error;
  const notice = failure ? errorNotice(failure, t) : null;

  function confirmHandBackAll() {
    Alert.alert(
      t.handBackAll(slices.toHandBack.length),
      t.packagesToReturn(slices.totals?.packages_to_return ?? 0),
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.handedBack,
          onPress: () =>
            batch.mutate({ ids: slices.toHandBack.map((stop) => stop.id) }),
        },
      ],
    );
  }

  return (
    <QueueScreen
      query={query}
      items={slices.toHandBack}
      keyExtractor={(stop) => stop.id}
      banner={
        <>
          <DeadlineChip
            deadline={slices.pharmacy?.return_deadline ?? null}
            packages={slices.totals?.packages_to_return ?? 0}
            labels={{
              before: t.returnBefore,
              passed: t.returnDeadlinePassed,
              packages: t.packagesToReturn,
            }}
          />
          {notice ? (
            <Banner tone="danger" icon="alert-circle-outline" message={notice.message} />
          ) : null}
        </>
      }
      renderItem={(stop) => (
        <ReturnCard
          stop={stop}
          locale={locale}
          busy={busy}
          labels={{
            reasons: t.failureReasons,
            cooler: t.cooler,
            handedBack: t.handedBack,
          }}
          onHandOver={() => handover.mutate({ id: stop.id })}
        />
      )}
      footer={
        slices.toHandBack.length > 0 ? (
          <PrimaryAction
            label={t.handBackAll(slices.toHandBack.length)}
            loading={batch.isPending}
            disabled={busy}
            onPress={confirmHandBackAll}
            icon={
              <Ionicons name="checkmark-done" size={20} color={theme.palette.onAccent} />
            }
          />
        ) : null
      }
      emptyIcon="cube-outline"
      emptyTitle={t.toHandBackEmptyTitle}
      emptyBody={t.toHandBackEmptyBody}
    />
  );
}
