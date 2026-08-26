/**
 * "The pharmacy just gave you more work."
 *
 * Two readings of one fact. On Ready it is an inventory change — packages the
 * driver has not seen are sitting at the counter. On On-the-way it is a
 * decision: the driver is out with a van full of deliveries and something new
 * arrived, so a trip back is now on the table (`domain_workflow.md`, §En
 * route — "le livreur doit repasser par la pharmacie à sa discrétion").
 *
 * It never says *what* arrived. A banner is chrome that can sit on screen while
 * a phone is on a dashboard mount in a parked car; counts carry the urgency and
 * no patient name has to leave the list to do it (PRD §8.1).
 */
import { StyleSheet } from 'react-native';

import { SecondaryAction } from '@/components/driver/actions';
import { Banner } from '@/components/driver/chrome';
import { useStrings } from '@/locale/locale-provider';
import { useShiftAlerts } from '@/queue/shift-alerts-provider';

export type ShiftAlertVariant = 'assigned' | 'return_to_pharmacy';

export function ShiftAlertBanner({ variant }: { variant: ShiftAlertVariant }) {
  const t = useStrings();
  const { newAtPharmacy, shouldReturn, acknowledge } = useShiftAlerts();

  const showing = variant === 'assigned' ? newAtPharmacy > 0 : shouldReturn;
  if (!showing) return null;

  // Dismissible, and it comes back if more arrive. A notice a driver cannot
  // clear is one they learn to read past.
  const dismiss = (
    <SecondaryAction label={t.dismiss} onPress={acknowledge} style={styles.dismiss} />
  );

  return variant === 'assigned' ? (
    <Banner
      tone="accent"
      icon="notifications-outline"
      message={t.newOrders(newAtPharmacy)}
      action={dismiss}
    />
  ) : (
    <Banner
      tone="caution"
      icon="storefront-outline"
      message={t.backToPharmacy(newAtPharmacy)}
      action={dismiss}
    />
  );
}

const styles = StyleSheet.create({
  dismiss: { flex: 0 },
});
