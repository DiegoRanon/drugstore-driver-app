/**
 * Display helpers. Presentation only — no business rules live here.
 */

/**
 * A short human handle for an order.
 *
 * The server identifies orders by UUID and exposes no reference number, but a
 * driver reading a package label back to a pharmacist cannot say a UUID. The
 * last six characters are stable, unique enough within one day's run, and the
 * pharmacist can match them against the dashboard.
 */
export function orderRef(id: string): string {
  return `#${id.replace(/-/g, '').slice(-6).toUpperCase()}`;
}

/** "$42.50" / "42,50 $" — the amount owed at the door. */
export function money(amount: number, locale: 'fr' | 'en'): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount);
}

/**
 * How long the order has been in its current status, as Mobilus shows it.
 *
 * Deliberately coarse: a driver triaging a card needs "this one has been in the
 * van 40 minutes", not a running clock. Returns null when there is no
 * timestamp to measure from, so the caller renders nothing rather than "0 min".
 */
export function elapsedLabel(since: string | null, now: number = Date.now()): string | null {
  if (!since) return null;
  const ms = now - new Date(since).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60}`.trimEnd();
}

/** Clock time for a timestamp, in the device's locale. */
export function clock(iso: string | null, locale: 'fr' | 'en'): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: locale === 'en',
  }).format(date);
}

/**
 * Travel distance to a stop, as the optimizer measured it.
 *
 * Rounded hard on purpose: under a kilometre reads in hundreds of metres,
 * above it to one decimal. A driver glancing at a card is deciding "is this
 * the next one or the one after" — three significant figures would imply a
 * precision the routing engine does not have, and would not change the answer.
 *
 * Returns null for a null reading, so the caller renders nothing rather than
 * "0 km". A missing estimate means the provider could not measure; it does not
 * mean the stop is close.
 */
export function distance(meters: number | null, locale: 'fr' | 'en'): string | null {
  if (meters === null || !Number.isFinite(meters) || meters < 0) return null;

  if (meters < 1000) {
    const rounded = Math.max(50, Math.round(meters / 50) * 50);
    return `${rounded} m`;
  }

  const km = meters / 1000;
  const value = new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    maximumFractionDigits: km < 10 ? 1 : 0,
  }).format(km);
  return `${value} km`;
}

/**
 * Travel time to a stop. Same coarseness as `elapsedLabel`, and the same
 * shape, so the two read as one family on a card that shows both.
 */
export function duration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;

  const minutes = Math.round(seconds / 60);
  // "min" and "h" read the same in both locales, which is why this takes no
  // locale — same reason `elapsedLabel` does not.
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

/**
 * The interval the pharmacy promised, when there is one.
 *
 * `HH:MM:SS` and `HH:MM` both arrive from the API depending on the column, so
 * both are trimmed to the clock face a person reads.
 */
export function timeRange(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const face = (value: string): string => value.slice(0, 5);
  return `${face(start)} – ${face(end)}`;
}
