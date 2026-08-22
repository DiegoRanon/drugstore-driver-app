/**
 * Android variant of `base-url.ts` — see that file for why this is split by
 * platform rather than branched at runtime.
 */

/**
 * The Android emulator cannot see the host's `localhost`; `10.0.2.2` is the
 * alias its network stack maps back to the host machine.
 *
 * A physical device shares neither, so it needs `EXPO_PUBLIC_API_URL` set to
 * the laptop's LAN address.
 */
export const DEFAULT_BASE_URL = 'http://10.0.2.2:3000';
