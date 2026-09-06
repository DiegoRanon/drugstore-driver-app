/**
 * Mock data for the design gallery.
 *
 * The stop shapes are no longer declared here: they are the generated aliases
 * from `@/api/types`, so this fixture data is checked against the real
 * `GET /v1/driver/queue` payload at compile time. A server change that
 * regenerates `schema.d.ts` breaks this file rather than the screens.
 *
 * Note what the server does *not* send, because it shapes the design:
 * no coordinates (so no map, no distance), no per-stop ETA, and once the
 * delivery attempt is over no `patient_name`, `address`, `phone_number`, or
 * `authorized_recipient` at all — including on a `returned` order that is
 * still open. What survives the strip is `label_code`, deliberately, because
 * the driver has to hand the right parcels back at the counter.
 */
import type {
  ActiveStop,
  Package,
  Pharmacy,
  QueueTotals,
  ReturnStop,
  TerminalStop,
} from '@/api/types';

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const TODAY = new Date().toISOString().slice(0, 10);

const pkg = (
  id: string,
  label_code: string,
  package_type: Package['package_type'],
  position: number,
): Package => ({ id, label_code, package_type, position });

export const PHARMACY: Pharmacy = {
  name: 'Pharmacie Saint-Laurent',
  phone: '+15145550100',
  return_deadline: '18:00:00',
};

/** Waiting at the counter. The Ready tab. */
export const READY_STOPS: ActiveStop[] = [
  {
    id: '8f14e45f-ceea-467a-9c1e-1b2c3d4e492a',
    status: 'in_pharmacy',
    sequence_number: null,
    is_priority: true,
    delivery_date: TODAY,
    delivery_window: 'AM',
    requested_delivery_time: '10:15',
    requested_time_start: '10:00',
    requested_time_end: '11:00',
    patient_name: 'Evelyn Harper',
    address: '4210 Willow Creek Dr, Montréal, QC H3G 1P5',
    phone_number: '+15145550142',
    latitude: 45.4952,
    longitude: -73.5657,
    authorized_recipient: 'Concierge, apt 4B',
    amount_due: 42.5,
    payment_status: 'unpaid',
    payment_collected: false,
    requires_cooler_bag: true,
    packages: [
      pkg('1a2b3c4d-0000-4000-8000-000000000001', '4412-A', 'cooler', 1),
      pkg('1a2b3c4d-0000-4000-8000-000000000002', '4412-B', 'bag', 2),
    ],
    package_count: 2,
    picked_up_at: null,
  },
  {
    id: 'c9f0f895-fb98-4b41-b1e9-9a8b7c6d5e4f',
    status: 'in_pharmacy',
    sequence_number: null,
    is_priority: false,
    delivery_date: TODAY,
    delivery_window: 'PM',
    requested_delivery_time: null,
    requested_time_start: null,
    requested_time_end: null,
    patient_name: 'Marcus Vance',
    address: '887 Skyline Blvd, Unit 1204, Laval, QC H7N 5Y3',
    phone_number: '+15145550188',
    latitude: 45.5041,
    longitude: -73.5687,
    authorized_recipient: null,
    amount_due: null,
    payment_status: 'paid',
    payment_collected: false,
    requires_cooler_bag: false,
    packages: [pkg('1a2b3c4d-0000-4000-8000-000000000003', '4415-A', 'tote', 1)],
    package_count: 1,
    picked_up_at: null,
  },
  {
    id: '45c48cce-2e2d-4fbd-aa1f-fdd8e04dc0a3',
    status: 'in_pharmacy',
    sequence_number: null,
    is_priority: false,
    delivery_date: TODAY,
    delivery_window: 'PM',
    requested_delivery_time: '14:30',
    requested_time_start: null,
    requested_time_end: null,
    patient_name: 'Geneviève Beauchamp-Rousseau',
    address: '1250 Rue Sainte-Catherine O, Montréal, QC H3G 1P5',
    phone_number: '+15145550163',
    latitude: 45.5155,
    longitude: -73.5772,
    authorized_recipient: null,
    amount_due: 18.75,
    payment_status: 'unpaid',
    payment_collected: false,
    requires_cooler_bag: false,
    packages: [pkg('1a2b3c4d-0000-4000-8000-000000000004', '4418-A', 'envelope', 1)],
    package_count: 1,
    picked_up_at: null,
  },
];

/** In the vehicle, in server route order. The On-the-way tab. */
export const ON_THE_WAY_STOPS: ActiveStop[] = [
  {
    id: 'd3d94468-02a4-4c1f-b6c8-2f3a1e5b7c9d',
    status: 'picked_up',
    sequence_number: 1,
    is_priority: false,
    delivery_date: TODAY,
    delivery_window: 'PM',
    requested_delivery_time: null,
    requested_time_start: '14:00',
    requested_time_end: '16:00',
    patient_name: 'Sarah Jenkins',
    address: '4829 Westward Lane, Apt 4B, North Tower, Montréal, QC H2X 1Y4',
    phone_number: '+15145550117',
    latitude: 45.5266,
    longitude: -73.5786,
    authorized_recipient: null,
    amount_due: 42.5,
    payment_status: 'unpaid',
    payment_collected: false,
    requires_cooler_bag: false,
    packages: [pkg('1a2b3c4d-0000-4000-8000-000000000005', '4421-A', 'bag', 1)],
    package_count: 1,
    picked_up_at: minutesAgo(22),
  },
  {
    id: '6512bd43-d9ca-4e7a-9d4f-8c2b1a0e3f5d',
    status: 'picked_up',
    sequence_number: 2,
    is_priority: false,
    delivery_date: TODAY,
    delivery_window: 'PM',
    requested_delivery_time: null,
    requested_time_start: null,
    requested_time_end: null,
    patient_name: 'Jean Bouchard',
    address: '4100 Rue Sherbrooke E, Montréal, QC H1X 2B2',
    phone_number: '+15145550188',
    latitude: 45.5366,
    longitude: -73.6142,
    authorized_recipient: 'Sa fille, Marie',
    amount_due: null,
    payment_status: 'paid',
    payment_collected: false,
    requires_cooler_bag: true,
    packages: [pkg('1a2b3c4d-0000-4000-8000-000000000006', '4423-A', 'cooler', 1)],
    package_count: 1,
    picked_up_at: minutesAgo(22),
  },
  {
    id: 'c20ad4d7-6fe9-4f45-a9e6-1d2c3b4a5e6f',
    status: 'picked_up',
    sequence_number: 3,
    is_priority: false,
    delivery_date: TODAY,
    delivery_window: 'PM',
    requested_delivery_time: null,
    requested_time_start: null,
    requested_time_end: null,
    patient_name: 'Susan Clarke',
    address: '88 Queen St W, Toronto, ON M5H 2N2',
    phone_number: '+14165550119',
    latitude: 45.4585,
    longitude: -73.5713,
    authorized_recipient: null,
    amount_due: 12,
    payment_status: 'unpaid',
    payment_collected: true,
    requires_cooler_bag: false,
    packages: [pkg('1a2b3c4d-0000-4000-8000-000000000007', '4425-A', 'bag', 1)],
    package_count: 1,
    picked_up_at: minutesAgo(95),
  },
];

/**
 * Failed deliveries still in the van. The À rapporter tab.
 *
 * Not terminal — the driver owes the pharmacy a handover — and yet already
 * PII-free, because the delivery attempt is over. That pair is the whole
 * reason `PII_VISIBLE_STATUSES` and `TERMINAL_STATUSES` are separate sets.
 */
export const RETURN_STOPS: ReturnStop[] = [
  {
    id: 'c74d97b0-1eae-4b3f-9d2c-8a7b6c5d4e3f',
    status: 'returned',
    delivery_date: TODAY,
    failure_reason: 'customer_absent',
    requires_cooler_bag: false,
    cooler_bag_confirmed: null,
    packages: [pkg('1a2b3c4d-0000-4000-8000-000000000008', '4408-A', 'bag', 1)],
    package_count: 1,
    picked_up_at: minutesAgo(210),
    completed_at: null,
    returned_at: minutesAgo(120),
    returned_to_pharmacy_at: null,
  },
  {
    id: '70efdf2e-c9b0-4a37-9c85-1d2e3f4a5b6c',
    status: 'returned',
    delivery_date: TODAY,
    failure_reason: 'payment_refused',
    requires_cooler_bag: true,
    cooler_bag_confirmed: null,
    packages: [
      pkg('1a2b3c4d-0000-4000-8000-000000000009', '4410-A', 'cooler', 1),
      pkg('1a2b3c4d-0000-4000-8000-00000000000a', '4410-B', 'bag', 2),
    ],
    package_count: 2,
    picked_up_at: minutesAgo(190),
    completed_at: null,
    returned_at: minutesAgo(65),
    returned_to_pharmacy_at: null,
  },
];

/** Nothing else can happen to these. The Done tab. */
export const TERMINAL_STOPS: TerminalStop[] = [
  {
    id: 'aab32389-22b6-4a3d-9b1c-0e1f2a3b4c5d',
    status: 'completed',
    delivery_date: TODAY,
    failure_reason: null,
    requires_cooler_bag: true,
    cooler_bag_confirmed: true,
    packages: [pkg('1a2b3c4d-0000-4000-8000-00000000000b', '4401-A', 'cooler', 1)],
    package_count: 1,
    picked_up_at: minutesAgo(180),
    completed_at: minutesAgo(150),
    returned_at: null,
    returned_to_pharmacy_at: null,
  },
  {
    id: '9bf31c7f-f062-4bd4-8a0f-5c6d7e8f9a0b',
    status: 'completed',
    delivery_date: TODAY,
    failure_reason: null,
    requires_cooler_bag: true,
    /** Unanswered — the prompt was dismissed. Stays actionable on the Done tab. */
    cooler_bag_confirmed: null,
    packages: [pkg('1a2b3c4d-0000-4000-8000-00000000000c', '4403-A', 'cooler', 1)],
    package_count: 1,
    picked_up_at: minutesAgo(200),
    completed_at: minutesAgo(140),
    returned_at: null,
    returned_to_pharmacy_at: null,
  },
  {
    id: 'b6d767d2-f8ed-4f1a-8e37-2c3d4e5f6a7b',
    status: 'returned_to_pharmacy',
    delivery_date: TODAY,
    failure_reason: 'wrong_address',
    requires_cooler_bag: false,
    cooler_bag_confirmed: null,
    packages: [pkg('1a2b3c4d-0000-4000-8000-00000000000d', '4405-A', 'bag', 1)],
    package_count: 1,
    picked_up_at: minutesAgo(240),
    completed_at: null,
    returned_at: minutesAgo(170),
    returned_to_pharmacy_at: minutesAgo(30),
  },
];

/** What the counter has to be told before the driver walks out. */
export const TOTALS: QueueTotals = {
  stop_count: READY_STOPS.length + ON_THE_WAY_STOPS.length,
  priority_count: 1,
  payment_stop_count: 3,
  amount_due_total: 115.75,
  requires_payment_terminal: true,
  packages_to_return: 3,
};
