import { ClosedOrderCard } from '@/components/driver/order-card';
import { QueueScreen } from '@/components/driver/queue-screen';
import { useLocale, useStrings } from '@/locale/locale-provider';
import { useQueueSlices } from '@/queue/use-queue';

/**
 * Done — everything terminal: completed, handed back, and cancelled alike.
 *
 * A `returned` order is deliberately **not** here. It is closed in the privacy
 * sense — the attempt is over and the patient's details are gone — but the
 * pharmacy has not taken the package back yet, so it lives on À rapporter
 * until a handover lands. `splitQueue` narrows this list to `TerminalStop`,
 * which is what makes that a compile-time fact rather than a convention.
 *
 * These cards carry no patient name, address, or phone, because the server
 * stops sending them the moment the attempt ends (PRD §8.1). That is not a
 * rendering choice this screen makes — the keys are absent from the payload,
 * and the type will not let them be read.
 */
export default function DoneScreen() {
  const { query, slices } = useQueueSlices();
  const { locale } = useLocale();
  const t = useStrings();

  return (
    <QueueScreen
      query={query}
      items={slices.done}
      keyExtractor={(stop) => stop.id}
      renderItem={(stop) => (
        <ClosedOrderCard
          stop={stop}
          locale={locale}
          labels={{
            completed: t.completed,
            returned_to_pharmacy: t.returned_to_pharmacy,
            cancelled: t.cancelled,
            coolerPending: t.coolerPending,
          }}
        />
      )}
      emptyIcon="checkmark-circle-outline"
      emptyTitle={t.doneEmptyTitle}
      emptyBody={t.doneEmptyBody}
    />
  );
}
