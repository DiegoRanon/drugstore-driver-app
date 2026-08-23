import { OrderCard } from '@/components/driver/order-card';
import { QueueScreen } from '@/components/driver/queue-screen';
import { useLocale, useStrings } from '@/locale/locale-provider';
import { useQueueSlices } from '@/queue/use-queue';

/**
 * Ready — packages waiting at the counter (`in_pharmacy`).
 *
 * Cards are read-only here for now. Multi-select pickup, the batch progress
 * indicator, and the per-card 409 handling are Feature 5, which owns every
 * write path through the outbox.
 */
export default function ReadyScreen() {
  const { query, slices } = useQueueSlices();
  const { locale } = useLocale();
  const t = useStrings();

  return (
    <QueueScreen
      query={query}
      items={slices.ready}
      keyExtractor={(stop) => stop.id}
      renderItem={(stop) => (
        <OrderCard
          stop={stop}
          locale={locale}
          labels={{ cooler: t.cooler, accessibilityPrefix: t.accessibilityPrefix }}
        />
      )}
      emptyIcon="file-tray-outline"
      emptyTitle={t.readyEmptyTitle}
      emptyBody={t.readyEmptyBody}
    />
  );
}
