import { OrderCard } from '@/components/driver/order-card';
import { QueueScreen } from '@/components/driver/queue-screen';
import { useLocale, useStrings } from '@/locale/locale-provider';
import { useQueueSlices } from '@/queue/use-queue';

/**
 * On the way — packages in the van (`picked_up`).
 *
 * Rendered in the server's `sequence_number` order exactly as received. The
 * app never re-sorts by its own distance math, or the driver's screen and the
 * pharmacist's dashboard would show different routes (PRD §3.1).
 */
export default function OnTheWayScreen() {
  const { query, slices } = useQueueSlices();
  const { locale } = useLocale();
  const t = useStrings();

  return (
    <QueueScreen
      query={query}
      items={slices.onTheWay}
      keyExtractor={(stop) => stop.id}
      renderItem={(stop) => (
        <OrderCard
          stop={stop}
          locale={locale}
          labels={{ cooler: t.cooler, accessibilityPrefix: t.accessibilityPrefix }}
        />
      )}
      emptyIcon="car-outline"
      emptyTitle={t.onTheWayEmptyTitle}
      emptyBody={t.onTheWayEmptyBody}
    />
  );
}
