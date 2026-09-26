/**
 * Named aliases over the generated OpenAPI schema.
 *
 * The server's spec declares every payload inline (`components.schemas` is
 * empty), so these aliases are the only readable handle on those shapes. They
 * are *derived*, never hand-written: regenerating `schema.d.ts` with
 * `npm run api:types` after a server change surfaces the drift here as a type
 * error instead of at runtime (PRD §3).
 */
import type { paths } from './schema';

/* -------------------------------------------------------------------------- */
/* Compile-time assertions                                                    */
/* -------------------------------------------------------------------------- */

type Assert<T extends true> = T;
/** Mutual assignability. `[A] extends [B]` stops naked-union distribution. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Narrows one member of a union-typed `status` field.
 *
 * `Extract` cannot do this. The closed stop is a *single* object type whose
 * `status` is a four-way union, so `ClosedStop extends { status: 'returned' }`
 * is false, nothing distributes, and `Extract<ClosedStop, …>` evaluates to
 * `never` — silently, at every use site.
 */
type AtStatus<T extends { status: string }, S extends T['status']> = Omit<
  T,
  'status'
> & { status: S };

/* -------------------------------------------------------------------------- */
/* Driver queue                                                               */
/* -------------------------------------------------------------------------- */

export type QueueResponse =
  paths['/v1/driver/queue']['get']['responses'][200]['content']['application/json'];

export type Pharmacy = QueueResponse['pharmacy'];
/** Counts for the day, including whether to take the POS from the counter. */
export type QueueTotals = QueueResponse['totals'];
/**
 * Per-stop distance and duration. Absent entirely when the optimizer can order
 * but not measure — which is every response from the current `FakeOptimizer`.
 * Never infer a distance from its absence.
 */
export type Estimate = NonNullable<QueueResponse['estimates']>[number];

/**
 * Traffic-aware arrival times for the rest of the run.
 *
 * Distinct from `Estimate` above, which is a by-product of an optimize call
 * and describes the route that was *solved*. This one is asked for on its own
 * and describes the route as it *stands*: measured against predicted traffic,
 * re-measured whenever a stop leaves the list, and carrying the clock time
 * the driver actually reads.
 */
export type RouteEta =
  paths['/v1/driver/queue/eta']['post']['responses'][200]['content']['application/json'];
export type EtaStop = RouteEta['stops'][number];
export type EtaBody =
  paths['/v1/driver/queue/eta']['post']['requestBody']['content']['application/json'];

/**
 * One row of the day's run, exactly as the server serializes it.
 *
 * This is a *union*, not a struct with optional fields, and that is the whole
 * point: the moment the delivery attempt is over the serializer physically
 * omits `patient_name`, `address`, `phone_number`, and `authorized_recipient`.
 * Modelling it as one wide type with optionals would let a screen read
 * `stop.address` on a closed delivery and silently render nothing; as a union,
 * that read is a compile error until the code proves which branch it is on.
 */
export type Stop = QueueResponse['stops'][number];

/**
 * Carries PII — and is *defined* by that fact rather than by a status list.
 *
 * The server's cliff is `PII_VISIBLE_STATUSES`, which is deliberately not the
 * terminal set (`medibus-server/docs/privacy-rules.md` §1). Deriving the
 * branch from `patient_name` rather than from a hand-written status union
 * means the two cannot drift: if the server ever makes another status
 * PII-visible, it lands in this type on the next `npm run api:types`.
 */
export type ActiveStop = Extract<Stop, { patient_name: string }>;
export type ActiveStatus = ActiveStop['status'];

/**
 * PII-free by construction — the keys are absent, not null.
 *
 * Taken from the `closed` bucket rather than by narrowing `Stop`, because
 * `stops`, `to_return`, `closed`, and every mutation response share this one
 * schema. Only the bucket an item arrived in says what it means.
 */
export type ClosedStop = QueueResponse['closed'][number];
export type ClosedStatus = ClosedStop['status'];

export type StopStatus = ActiveStatus | ClosedStatus;

/** `returned` — the attempt failed and the package is in the driver's van. */
export type ReturnStop = AtStatus<ClosedStop, 'returned'>;
/** Nothing else can happen: `completed`, `returned_to_pharmacy`, `cancelled`. */
export type TerminalStatus = Exclude<ClosedStatus, 'returned'>;
export type TerminalStop = AtStatus<ClosedStop, TerminalStatus>;

export type DeliveryWindow = ActiveStop['delivery_window'];
export type PaymentStatus = ActiveStop['payment_status'];
export type Package = ActiveStop['packages'][number];
export type PackageType = Package['package_type'];
export type FailureReason = NonNullable<ClosedStop['failure_reason']>;

/*
  The runtime needs literal strings; the type system has to police them. Each
  assertion below fails the build if the server adds or removes a status, which
  is the failure mode these predicates would otherwise hide — a stop belonging
  to no bucket simply disappears from every tab.
*/
const ACTIVE_STATUSES = ['in_pharmacy', 'picked_up'] as const;
type _ActiveComplete = Assert<
  Same<ActiveStatus, (typeof ACTIVE_STATUSES)[number]>
>;

const CLOSED_STATUSES = [
  'completed',
  'returned',
  'returned_to_pharmacy',
  'cancelled',
] as const;
type _ClosedComplete = Assert<
  Same<ClosedStatus, (typeof CLOSED_STATUSES)[number]>
>;

/** The narrowing every screen uses. Written once so no screen re-derives it. */
export function isActiveStop(stop: Stop): stop is ActiveStop {
  return (ACTIVE_STATUSES as readonly string[]).includes(stop.status);
}

export function isClosedStop(stop: Stop): stop is ClosedStop {
  return !isActiveStop(stop);
}

/** Owed a handover. Not terminal, not active, and not PII-visible. */
export function isReturnStop(stop: ClosedStop): stop is ReturnStop {
  return stop.status === 'returned';
}

export function isTerminalStop(stop: ClosedStop): stop is TerminalStop {
  return !isReturnStop(stop);
}

/* -------------------------------------------------------------------------- */
/* Driver mutations                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Every driver verb answers with the same untagged `ActiveStop | ClosedStop`
 * union the queue's `stops` array carries — not "the updated stop" as one
 * struct. A caller that wants a field has to narrow first, which is exactly
 * the point: `complete` and `return` both hand back a row whose patient
 * fields are already gone.
 */
export type MutatedStop =
  paths['/v1/driver/orders/{id}/pickup']['post']['responses'][200]['content']['application/json'];

export type PickupBody =
  paths['/v1/driver/orders/{id}/pickup']['post']['requestBody']['content']['application/json'];

export type CompleteBody =
  paths['/v1/driver/orders/{id}/complete']['post']['requestBody']['content']['application/json'];
/** Money actually changed hands at the door. */
export type PaymentTaken = NonNullable<CompleteBody['payment']>;
/**
 * The pharmacy authorised handing the package over unpaid. Never the driver's
 * own decision — the workflow has them phone the pharmacy and record the
 * answer (`domain_workflow.md`, §à l'adresse, scénario A).
 */
export type PaymentException = NonNullable<CompleteBody['payment_exception']>;

export type ReturnBody =
  paths['/v1/driver/orders/{id}/return']['post']['requestBody']['content']['application/json'];

/** `POST /orders/{id}/handover` takes no body at all — hence no alias for it. */
export type BatchHandoverBody =
  paths['/v1/driver/returns/handover']['post']['requestBody']['content']['application/json'];
export type BatchHandoverResponse =
  paths['/v1/driver/returns/handover']['post']['responses'][200]['content']['application/json'];

export type PriorityBody =
  paths['/v1/driver/orders/{id}/priority']['post']['requestBody']['content']['application/json'];

export type PaymentBody =
  paths['/v1/driver/orders/{id}/payment']['post']['requestBody']['content']['application/json'];
/**
 * Note `matches_amount_due`: a short collection is a *fact the server reports*,
 * not an error it refuses (PRD §5.7). The UI renders "collected $15.00 of
 * $42.50" from these three fields.
 */
export type PaymentResponse =
  paths['/v1/driver/orders/{id}/payment']['post']['responses'][200]['content']['application/json'];
export type PaymentMethod = PaymentBody['payment_method'];

export type CoolerCheckBody =
  paths['/v1/driver/orders/{id}/cooler-check']['post']['requestBody']['content']['application/json'];

/**
 * The driver's own route order. Omitted stops have `sequence_number` cleared
 * by the server, so this always carries the whole day, never a slice.
 */
export type SequenceBody =
  paths['/v1/driver/queue/sequence']['post']['requestBody']['content']['application/json'];

export type OptimizeBody =
  paths['/v1/driver/queue/optimize']['post']['requestBody']['content']['application/json'];
/**
 * Same shape as the queue, plus `degraded`. When the optimizer is unreachable
 * the server returns the *previous* sequence with `degraded: true` rather than
 * failing, so this is a success response the UI annotates — never an error
 * path (MVP plan, Feature 6).
 */
export type OptimizeResponse =
  paths['/v1/driver/queue/optimize']['post']['responses'][200]['content']['application/json'];
export type Coordinates = NonNullable<OptimizeBody['current_location']>;

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export type NotificationsResponse =
  paths['/v1/driver/notifications']['get']['responses'][200]['content']['application/json'];
export type Notification = NotificationsResponse['data'][number];
export type NotificationType = Notification['type'];

export type MarkReadBody =
  paths['/v1/driver/notifications/read']['post']['requestBody']['content']['application/json'];

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export type LoginBody =
  paths['/v1/auth/login']['post']['requestBody']['content']['application/json'];
export type LoginResponse =
  paths['/v1/auth/login']['post']['responses'][200]['content']['application/json'];

/** Refresh answers with the same envelope as login — including a new user. */
export type RefreshBody =
  paths['/v1/auth/refresh']['post']['requestBody']['content']['application/json'];
export type RefreshResponse =
  paths['/v1/auth/refresh']['post']['responses'][200]['content']['application/json'];

/** The token pair both endpoints return. `expires_in` is seconds (900). */
export type TokenPair = Pick<
  LoginResponse,
  'access_token' | 'refresh_token' | 'expires_in'
>;

export type SessionUser = LoginResponse['user'];
export type UserRole = SessionUser['role'];

export type LogoutBody =
  paths['/v1/auth/logout']['post']['requestBody']['content']['application/json'];

export type MeResponse =
  paths['/v1/auth/me']['get']['responses'][200]['content']['application/json'];
export type MeUser = MeResponse['user'];
/** `locale` seeds i18n on first launch; `timezone` is not yet used. */
export type Organization = MeResponse['organization'];

export type RegisterDriverBody =
  paths['/v1/auth/register/driver']['post']['requestBody']['content']['application/json'];
export type RegisterDriverResponse =
  paths['/v1/auth/register/driver']['post']['responses'][201]['content']['application/json'];
