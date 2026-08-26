/**
 * The live channel. Knows how to reach the server; knows nothing about React.
 *
 * Same split as `http.ts` for the same reason — the socket has to be created
 * and torn down from a provider, and a module that imported React could not be
 * exercised without rendering something.
 *
 * ## What arrives here
 *
 * Frames, not data. The server sends `{ order_id, delivery_date, status }` and
 * deliberately nothing else (drugstore-server/docs/realtime.md): patient names
 * and addresses reach this device through `GET /v1/driver/queue` and its driver
 * serializer, or not at all. So the only correct reaction to a frame is to
 * refetch — never to render it.
 */
import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL } from './http';
import { getValidAccessToken } from './refresh';

/** Must match REALTIME_PATH in drugstore-server/src/realtime/server.ts. */
export const REALTIME_PATH = '/v1/realtime';

/** The four the server publishes to a driver (PRD §7). */
export const REALTIME_EVENTS = [
  'order.assigned',
  'order.ready',
  'order.unassigned',
  'order.cancelled',
] as const;

export type RealtimeEvent = (typeof REALTIME_EVENTS)[number];

export type RealtimeFrame = {
  order_id: string;
  delivery_date: string | null;
  status: string;
};

/**
 * Builds the socket, disconnected.
 *
 * The caller connects, because *when* to hold a socket open is a policy
 * question — signed in, foregrounded — and this module has no business
 * answering it.
 *
 * `auth` is given as a **callback**, which socket.io-client re-invokes on every
 * connection attempt including each reconnect. That is what makes the server's
 * disconnect-on-token-expiry survivable: the reconnect carries a fresh token
 * rather than replaying the expired one forever.
 *
 * It goes through `getValidAccessToken`, so a reconnect storm coming out of a
 * tunnel shares the one refresh that module's mutex allows. Two concurrent
 * refreshes present an already-rotated token, which the server treats as theft
 * and answers by revoking the whole family — signing the driver out mid-route.
 */
export function createRealtimeSocket(): Socket {
  return io(API_BASE_URL, {
    path: REALTIME_PATH,
    // The XHR-polling fallback is unreliable under React Native's fetch shim,
    // and the server only offers websocket anyway.
    transports: ['websocket'],
    autoConnect: false,
    auth: (cb: (data: { token?: string }) => void) => {
      getValidAccessToken().then(
        (token) => cb({ token }),
        /*
          No credential to offer — the session ended, or the device is offline
          mid-refresh. Hand over nothing: the server refuses the handshake and
          the client backs off, which is the correct outcome in both cases and
          strictly better than throwing inside socket.io's callback.
        */
        () => cb({}),
      );
    },
  });
}
