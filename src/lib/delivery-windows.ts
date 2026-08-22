export type DeliveryWindow = 'AM' | 'PM';

/**
 * AM/PM clock bounds.
 *
 * These live on `organizations` in the database (`am_window_start`,
 * `am_window_end`, …) but **no endpoint returns them** — `/v1/auth/me` gives
 * only id, name, phone, timezone, and locale. Until the server exposes them the
 * app shows the schema defaults, exactly as the admin dashboard does.
 *
 * A pharmacy with different hours sees the wrong label here, which is why this
 * is one constant rather than four literals across the UI: when the field
 * arrives, only this file changes.
 */
export const DELIVERY_WINDOWS: Record<DeliveryWindow, { start: string; end: string }> = {
  AM: { start: '09:00', end: '12:00' },
  PM: { start: '13:00', end: '17:00' },
};

/** "AM 9h–12h" in French, "AM 9–12" in English. */
export function windowLabel(window: DeliveryWindow, locale: 'fr' | 'en'): string {
  const { start, end } = DELIVERY_WINDOWS[window];
  const hour = (value: string): string => String(Number(value.slice(0, 2)));
  return locale === 'fr'
    ? `${window} ${hour(start)}h–${hour(end)}h`
    : `${window} ${hour(start)}–${hour(end)}`;
}
