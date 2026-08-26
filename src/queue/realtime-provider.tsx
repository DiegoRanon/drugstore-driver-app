/**
 * The socket's lifetime, and the one thing it is allowed to do.
 *
 * A frame from the server says only that something changed for this driver
 * (`@/api/realtime`). The reaction is always the same: invalidate the queue and
 * let TanStack Query refetch it through `GET /v1/driver/queue`. That keeps the
 * driver serializer on the only path patient data takes to this device, and it
 * is why nothing downstream needed changing — `shift-alerts` diffs whatever
 * payload arrives, so a socket-driven refetch raises the arrival banner exactly
 * as the poll did.
 *
 * The poll is not replaced. It stays as the fallback PRD §7 requires of
 * clients, widened while the socket is up — see `use-queue.ts`.
 */
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Socket } from 'socket.io-client';

import { REALTIME_EVENTS, createRealtimeSocket } from '@/api/realtime';
import { useSession } from '@/auth/session-provider';
import { RealtimeContext, type RealtimeStatus } from '@/queue/realtime-status';
import { QUEUE_MUTATION_KEY, queueQueryKey } from '@/queue/use-queue';

export { useRealtime, type RealtimeStatus } from '@/queue/realtime-status';

/**
 * Long enough to fold a morning's assignments into one refetch, short enough
 * that a driver watching the screen reads it as immediate.
 *
 * Without it, a dispatcher assigning ten stops would fire ten frames and ten
 * full queue fetches in about a second.
 */
export const REALTIME_REFRESH_DEBOUNCE_MS = 1000;

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { state } = useSession();
  const signedIn = state.status === 'signed-in';

  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  /*
    A refetch that lands between an optimistic write and its response
    overwrites the optimistic cache with server state that predates the write —
    a stop visibly jumping back to the tab it just left. `useQueue` suspends
    the poll for exactly this window; a frame can arrive inside it too, so the
    same guard has to apply here.

    Read through a ref because the debounce timer fires outside the render that
    scheduled it and must see the value as of *then*.
  */
  const writing = useIsMutating({ mutationKey: QUEUE_MUTATION_KEY });
  const writingRef = useRef(writing);
  writingRef.current = writing;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    // Deferred, not dropped: the change the frame announced is real, so it has
    // to land once the write it collided with has settled.
    if (writingRef.current > 0) {
      timerRef.current = setTimeout(refresh, REALTIME_REFRESH_DEBOUNCE_MS);
      return;
    }

    timerRef.current = null;
    void queryClient.invalidateQueries({ queryKey: queueQueryKey() });
    // `unread_notifications` rides on the queue payload, but the feed screen
    // reads its own query and would otherwise keep yesterday's list open.
    void queryClient.invalidateQueries({ queryKey: ['driver', 'notifications'] });
  }, [queryClient]);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(refresh, REALTIME_REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    if (!signedIn) return;

    const socket: Socket = createRealtimeSocket();

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    /*
      Refused handshakes are ordinary here — an expired token, a server
      restart, no signal in a parking garage — and socket.io retries on its own
      backoff with a token the `auth` callback fetches fresh each time. Nothing
      to do but stop claiming to be connected.
    */
    socket.on('connect_error', () => setConnected(false));

    for (const event of REALTIME_EVENTS) socket.on(event, scheduleRefresh);

    /*
      Foreground only, the same rule `app-state-focus.ts` enforces for the poll
      and for the same reason: PRD §10 puts nothing on a backgrounded phone's
      battery, and an open socket held in a pocket all afternoon is precisely
      that. The queue is refetched on return by `refetchOnWindowFocus`, so a
      driver misses nothing by having been away.
    */
    const apply = (status: AppStateStatus): void => {
      if (status === 'active') socket.connect();
      else socket.disconnect();
    };

    apply(AppState.currentState);
    const subscription = AppState.addEventListener('change', apply);

    return () => {
      subscription.remove();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // `apply` cannot fire after this, so the socket is unreachable once
      // closed — no null-out needed to keep it from being used.
      socket.removeAllListeners();
      socket.close();
      setConnected(false);
    };
  }, [signedIn, scheduleRefresh]);

  const value = useMemo<RealtimeStatus>(() => ({ connected }), [connected]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
