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
/* Driver queue                                                               */
/* -------------------------------------------------------------------------- */

export type QueueResponse =
  paths['/v1/driver/queue']['get']['responses'][200]['content']['application/json'];

export type Pharmacy = QueueResponse['pharmacy'];

/**
 * One row of the day's run, exactly as the server serializes it.
 *
 * This is a *union*, not a struct with optional fields, and that is the whole
 * point: once an order reaches a terminal status the serializer physically
 * omits `patient_name`, `address`, and `phone_number` (PRD §8.1). Modelling it
 * as one wide type with optionals would let a screen read `stop.address` on a
 * completed delivery and silently render nothing; as a union, that read is a
 * compile error until the code proves which branch it is on.
 */
export type Stop = QueueResponse['stops'][number];

export type ActiveStatus = 'in_pharmacy' | 'picked_up';
export type ClosedStatus = 'completed' | 'returned' | 'cancelled';
export type StopStatus = ActiveStatus | ClosedStatus;

/** Carries PII. Only reachable after narrowing on `status`. */
export type ActiveStop = Extract<Stop, { status: ActiveStatus }>;
/** PII-free by construction — the keys are absent, not null. */
export type ClosedStop = Extract<Stop, { status: ClosedStatus }>;

export type DeliveryWindow = ActiveStop['delivery_window'];
export type PaymentStatus = ActiveStop['payment_status'];

/** The narrowing every screen uses. Written once so no screen re-derives it. */
export function isActiveStop(stop: Stop): stop is ActiveStop {
  return stop.status === 'in_pharmacy' || stop.status === 'picked_up';
}

export function isClosedStop(stop: Stop): stop is ClosedStop {
  return !isActiveStop(stop);
}

/* -------------------------------------------------------------------------- */
/* Driver mutations                                                           */
/* -------------------------------------------------------------------------- */

/** `pickup`, `complete`, and `return` all answer with the updated stop. */
export type PickupResponse =
  paths['/v1/driver/orders/{id}/pickup']['post']['responses'][200]['content']['application/json'];
export type CompleteResponse =
  paths['/v1/driver/orders/{id}/complete']['post']['responses'][200]['content']['application/json'];
export type ReturnResponse =
  paths['/v1/driver/orders/{id}/return']['post']['responses'][200]['content']['application/json'];

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
export type CoolerCheckResponse =
  paths['/v1/driver/orders/{id}/cooler-check']['post']['responses'][200]['content']['application/json'];

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
