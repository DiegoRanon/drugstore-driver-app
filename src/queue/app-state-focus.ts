/**
 * Tie React Query's notion of "focused" to the OS notion of "foregrounded".
 *
 * Without this the library's focus signal never fires on a phone — it is
 * written against a browser's `visibilitychange` — with two consequences the
 * queue poll depends on. `refetchOnWindowFocus` would do nothing when a driver
 * comes back from the dialer or a navigation app, and `refetchInterval` would
 * keep polling a backgrounded app for patient addresses on the driver's battery
 * (PRD §10: nothing in the background).
 *
 * Wiring it once here makes both correct: the queue refreshes the moment the
 * app is looked at again, and the 30-second poll suspends itself when it is not.
 */
import { focusManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

/** Returns its own unsubscribe, so it can be handed straight to `useEffect`. */
export function subscribeAppStateFocus(): () => void {
  focusManager.setFocused(AppState.currentState === 'active');

  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });

  return () => subscription.remove();
}
