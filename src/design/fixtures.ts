/**
 * Mock data for the design gallery.
 *
 * The stop shapes are no longer declared here: they are the generated aliases
 * from `@/api/types`, so this fixture data is checked against the real
 * `GET /v1/driver/queue` payload at compile time. A server change that
 * regenerates `schema.d.ts` breaks this file rather than the screens.
 *
 * Note what the server does *not* send, because it shapes the design:
 * no coordinates (so no map, no distance), no per-stop ETA, and on a terminal
 * order no `patient_name`, `address`, or `phone_number` at all.
 */
import type { ActiveStop, ClosedStop, Pharmacy } from '@/api/types';

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const TODAY = new Date().toISOString().slice(0, 10);

export const PHARMACY: Pharmacy = { name: 'Pharmacie Saint-Laurent', phone: '+15145550100' };

/** Waiting at the counter. The Ready tab. */
export const READY_STOPS: ActiveStop[] = [
  {
    id: '8f14e45f-ceea-467a-9c1e-1b2c3d4e492a',
    status: 'in_pharmacy',
    sequence_number: null,
    delivery_date: TODAY,
    delivery_window: 'AM',
    patient_name: 'Evelyn Harper',
    address: '4210 Willow Creek Dr, Montréal, QC H3G 1P5',
    phone_number: '+15145550142',
    amount_due: 42.5,
    payment_status: 'unpaid',
    payment_collected: false,
    requires_cooler_bag: true,
    picked_up_at: null,
  },
  {
    id: 'c9f0f895-fb98-4b41-b1e9-9a8b7c6d5e4f',
    status: 'in_pharmacy',
    sequence_number: null,
    delivery_date: TODAY,
    delivery_window: 'PM',
    patient_name: 'Marcus Vance',
    address: '887 Skyline Blvd, Unit 1204, Laval, QC H7N 5Y3',
    phone_number: '+15145550188',
    amount_due: null,
    payment_status: 'paid',
    payment_collected: false,
    requires_cooler_bag: false,
    picked_up_at: null,
  },
  {
    id: '45c48cce-2e2d-4fbd-aa1f-fdd8e04dc0a3',
    status: 'in_pharmacy',
    sequence_number: null,
    delivery_date: TODAY,
    delivery_window: 'PM',
    patient_name: 'Geneviève Beauchamp-Rousseau',
    address: '1250 Rue Sainte-Catherine O, Montréal, QC H3G 1P5',
    phone_number: '+15145550163',
    amount_due: 18.75,
    payment_status: 'unpaid',
    payment_collected: false,
    requires_cooler_bag: false,
    picked_up_at: null,
  },
];

/** In the vehicle, in server route order. The On-the-way tab. */
export const ON_THE_WAY_STOPS: ActiveStop[] = [
  {
    id: 'd3d94468-02a4-4c1f-b6c8-2f3a1e5b7c9d',
    status: 'picked_up',
    sequence_number: 1,
    delivery_date: TODAY,
    delivery_window: 'PM',
    patient_name: 'Sarah Jenkins',
    address: '4829 Westward Lane, Apt 4B, North Tower, Montréal, QC H2X 1Y4',
    phone_number: '+15145550117',
    amount_due: 42.5,
    payment_status: 'unpaid',
    payment_collected: false,
    requires_cooler_bag: false,
    picked_up_at: minutesAgo(22),
  },
  {
    id: '6512bd43-d9ca-4e7a-9d4f-8c2b1a0e3f5d',
    status: 'picked_up',
    sequence_number: 2,
    delivery_date: TODAY,
    delivery_window: 'PM',
    patient_name: 'Jean Bouchard',
    address: '4100 Rue Sherbrooke E, Montréal, QC H1X 2B2',
    phone_number: '+15145550188',
    amount_due: null,
    payment_status: 'paid',
    payment_collected: false,
    requires_cooler_bag: true,
    picked_up_at: minutesAgo(22),
  },
  {
    id: 'c20ad4d7-6fe9-4f45-a9e6-1d2c3b4a5e6f',
    status: 'picked_up',
    sequence_number: 3,
    delivery_date: TODAY,
    delivery_window: 'PM',
    patient_name: 'Susan Clarke',
    address: '88 Queen St W, Toronto, ON M5H 2N2',
    phone_number: '+14165550119',
    amount_due: 12,
    payment_status: 'unpaid',
    payment_collected: true,
    requires_cooler_bag: false,
    picked_up_at: minutesAgo(95),
  },
];

/** Today's finished deliveries — note the absent patient fields. */
export const CLOSED_STOPS: ClosedStop[] = [
  {
    id: 'aab32389-22b6-4a3d-9b1c-0e1f2a3b4c5d',
    status: 'completed',
    delivery_date: TODAY,
    picked_up_at: minutesAgo(180),
    completed_at: minutesAgo(150),
    returned_at: null,
    requires_cooler_bag: true,
    cooler_bag_confirmed: true,
  },
  {
    id: '9bf31c7f-f062-4bd4-8a0f-5c6d7e8f9a0b',
    status: 'completed',
    delivery_date: TODAY,
    picked_up_at: minutesAgo(200),
    completed_at: minutesAgo(140),
    returned_at: null,
    requires_cooler_bag: true,
    /** Unanswered — the prompt was dismissed. Stays actionable on the Done tab. */
    cooler_bag_confirmed: null,
  },
  {
    id: 'c74d97b0-1eae-4b3f-9d2c-8a7b6c5d4e3f',
    status: 'returned',
    delivery_date: TODAY,
    picked_up_at: minutesAgo(210),
    completed_at: null,
    returned_at: minutesAgo(120),
    requires_cooler_bag: false,
    cooler_bag_confirmed: null,
  },
];
