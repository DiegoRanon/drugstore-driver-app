/**
 * The development fallback for `/v1`, per platform.
 *
 * Split across `.ts` / `.android.ts` rather than branching on `Platform.OS`
 * so the transport layer never imports the React Native runtime. That keeps
 * `src/api` importable from plain Node — which is what lets the API
 * verification run against the real server outside the RN test environment.
 *
 * Metro picks `.android.ts` on Android; everything else — iOS, web, Node —
 * resolves this file.
 */

/** The iOS simulator shares the host machine's loopback interface. */
export const DEFAULT_BASE_URL = 'http://localhost:3000';
