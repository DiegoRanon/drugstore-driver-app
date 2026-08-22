/**
 * Structural design tokens — everything that does **not** change between the
 * night and day themes.
 *
 * Colour deliberately does not live here. It is in `theme.ts`, behind
 * `useTheme()`, because the driver can switch themes at runtime and a colour
 * imported as a module constant can never follow that switch. Spacing, radii,
 * and type scale are identical in both themes, so they stay here as plain
 * constants and keep working inside `StyleSheet.create`.
 */

import { Platform } from 'react-native';

export const Radius = {
  chip: 999,
  control: 16,
  card: 22,
  sheet: 30,
} as const;

/** 4pt grid. */
export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Minimum interactive size. PRD §7: winter gloves are a use case, so this is a
 * floor for every pressable, not a target for the primary ones.
 */
export const TapTarget = 48;
/** The one-tap actions sit in the thumb zone and are taller still. */
export const PrimaryActionHeight = 60;

export const Type = {
  /** The address on the detail sheet — legible on a dashboard mount. */
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
  /** Patient name on the hero card. */
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  /** Patient name in a list row. */
  rowTitle: { fontSize: 19, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '500' },
  /** Addresses, secondary lines. */
  meta: { fontSize: 14, lineHeight: 19, fontWeight: '500' },
  /** Section headers: uppercase, tracked out. */
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.3 },
  chip: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  /** Button text. Sized so a French string 30% longer still fits one line. */
  action: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
} as const;

/**
 * Monospace for order references and the invite code, where character shape
 * has to be unambiguous — a driver typing a code off a printed sheet must be
 * able to tell 5 from S.
 */
export const MonoFont = Platform.select({
  ios: 'ui-monospace',
  android: 'monospace',
  default: 'monospace',
});
