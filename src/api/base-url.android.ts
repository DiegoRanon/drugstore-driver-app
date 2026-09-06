/**
 * Android variant of `base-url.ts` — see that file for why this is split by
 * platform rather than branched at runtime.
 */

/**
 * The local physical-device workflow uses `adb reverse tcp:3000 tcp:3000`,
 * which exposes the computer's API as the phone's `127.0.0.1:3000`.
 *
 * Run `npm run android:usb` after reconnecting the phone. Emulator and LAN
 * builds can still override this with `EXPO_PUBLIC_API_URL`.
 */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
