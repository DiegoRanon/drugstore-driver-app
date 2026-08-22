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
