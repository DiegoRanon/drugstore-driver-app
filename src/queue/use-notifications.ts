/**
 * The in-app feed.
 *
 * There is no push channel — `docs/PRD.md` §9.2 — so a driver learns about a
 * mid-shift order from the queue poll and from this. The unread *count* rides
 * on the queue payload already (`unread_notifications`), which is what the
 * bell badges, so this query only runs when someone actually opens the screen.
 * Polling a second endpoint every thirty seconds to render a number the first
 * one already returned would double the request budget for nothing.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { getNotifications, markNotificationsRead } from '@/api/client';
import type { NotificationsResponse } from '@/api/types';
import { queueQueryKey } from '@/queue/use-queue';

export function notificationsQueryKey(unread?: boolean): readonly unknown[] {
  return ['driver', 'notifications', unread ?? 'all'];
}

export function useNotifications(
  unread?: boolean,
): UseQueryResult<NotificationsResponse, Error> {
  return useQuery({
    queryKey: notificationsQueryKey(unread),
    queryFn: () => getNotifications({ unread }),
  });
}

/**
 * Marking read is **explicit** — a tap on a row, or "tout marquer comme lu".
 *
 * Not automatic on mount. A driver who opens the feed at a red light and locks
 * the phone before reading it would otherwise lose the badge and the only
 * signal that anything happened.
 *
 * Invalidates the queue as well as the feed, because `unread_notifications`
 * lives on the queue payload and the bell would otherwise keep its old count
 * until the next poll.
 */
export function useMarkNotificationsRead(): UseMutationResult<
  { updated: number },
  Error,
  { ids?: string[] }
> {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ ids }: { ids?: string[] }) =>
      markNotificationsRead(ids ? { ids } : {}),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['driver', 'notifications'] }),
        client.invalidateQueries({ queryKey: queueQueryKey() }),
      ]);
    },
  });
}
