import { ClosedOrderCard } from '@/components/driver/order-card';
import { QueueScreen } from '@/components/driver/queue-screen';
import { useLocale, useStrings } from '@/locale/locale-provider';
import { useQueueSlices } from '@/queue/use-queue';

/**
 * Done — everything terminal: completed, returned, and cancelled alike.
 *
 * These cards carry no patient name, address, or phone, because the server
 * stops sending them the moment an order closes (PRD §8.1). That is not a
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
            returned: t.returned,
            cancelled: t.cancelled,
            coolerPending: t.coolerPending,
            returnToPharmacy: t.returnToPharmacy,
          }}
        />
      )}
      emptyIcon="checkmark-circle-outline"
      emptyTitle={t.doneEmptyTitle}
      emptyBody={t.doneEmptyBody}
    />
  );
}
