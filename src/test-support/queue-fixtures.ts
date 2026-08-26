/**
 * Builders for `GET /v1/driver/queue` payloads, shared by every suite.
 *
 * Six test files used to hand-roll these, each with an `as QueueResponse` cast
 * to paper over the fields it did not care about — which is precisely what let
 * a server change land as a runtime failure inside `splitQueue` instead of a
 * type error. There are **no casts here**: each builder returns a complete,
 * type-checked row, and a field the server adds breaks this one file.
 *
 * Lives outside `__tests__` so Jest does not try to run it as a suite, beside
 * `fake-server.ts` for the same reason.
 */
import type {
  ActiveStop,
  Notification,
  Package,
  QueueResponse,
  QueueTotals,
  ReturnStop,
  TerminalStop,
} from '@/api/types';

const DATE = '2026-08-22';

export function pkg(overrides: Partial<Package> = {}): Package {
  return {
    id: '1a2b3c4d-0000-4000-8000-000000000001',
    label_code: '4412-A',
    package_type: 'bag',
    position: 1,
    ...overrides,
  };
}

export function activeStop(overrides: Partial<ActiveStop> = {}): ActiveStop {
  return {
    id: 'active-1',
    status: 'in_pharmacy',
    sequence_number: null,
    is_priority: false,
    delivery_date: DATE,
    delivery_window: 'AM',
    requested_delivery_time: null,
    patient_name: 'Evelyn Harper',
    address: '4210 Willow Creek Dr',
    phone_number: '+15145550142',
    authorized_recipient: null,
    amount_due: null,
    payment_status: 'unpaid',
    payment_collected: false,
    requires_cooler_bag: false,
    packages: [pkg()],
    package_count: 1,
    picked_up_at: null,
    ...overrides,
  };
}

/** Failed, still in the van, owed back to the pharmacy. */
export function returnStop(overrides: Partial<ReturnStop> = {}): ReturnStop {
  return {
    id: 'returned-1',
    status: 'returned',
    delivery_date: DATE,
    failure_reason: 'customer_absent',
    requires_cooler_bag: false,
    cooler_bag_confirmed: null,
    packages: [pkg({ label_code: '4408-A' })],
    package_count: 1,
    picked_up_at: null,
    completed_at: null,
    returned_at: null,
    returned_to_pharmacy_at: null,
    ...overrides,
  };
}

/** Nothing else can happen to it. */
export function terminalStop(overrides: Partial<TerminalStop> = {}): TerminalStop {
  return {
    id: 'closed-1',
    status: 'completed',
    delivery_date: DATE,
    failure_reason: null,
    requires_cooler_bag: false,
    cooler_bag_confirmed: null,
    packages: [pkg({ label_code: '4401-A' })],
    package_count: 1,
    picked_up_at: null,
    completed_at: null,
    returned_at: null,
    returned_to_pharmacy_at: null,
    ...overrides,
  };
}

export function totals(overrides: Partial<QueueTotals> = {}): QueueTotals {
  return {
    stop_count: 0,
    priority_count: 0,
    payment_stop_count: 0,
    amount_due_total: 0,
    requires_payment_terminal: false,
    packages_to_return: 0,
    ...overrides,
  };
}

export function queue(overrides: Partial<QueueResponse> = {}): QueueResponse {
  return {
    date: DATE,
    pharmacy: {
      name: 'Pharmacie Saint-Laurent',
      phone: null,
      return_deadline: '18:00:00',
    },
    stops: [],
    to_return: [],
    closed: [],
    totals: totals(),
    unread_notifications: 0,
    has_new: false,
    last_updated_at: null,
    ...overrides,
  };
}

export function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: '2b3c4d5e-0000-4000-8000-000000000001',
    type: 'order_assigned',
    order_id: 'active-1',
    delivery_date: DATE,
    created_at: '2026-08-22T12:00:00.000Z',
    read_at: null,
    ...overrides,
  };
}
