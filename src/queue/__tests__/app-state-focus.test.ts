/**
 * The thing that stops the queue polling a pocketed phone.
 *
 * React Query's focus signal is written against a browser tab, so on a phone it
 * never fires by itself. Two behaviours the app is specified to have ride on
 * this one subscription: the queue refreshing when the driver comes back from
 * the dialer or a navigation app (PRD §7, "resumes exactly where it was"), and
 * the 30-second poll suspending in the background (PRD §10, "nothing in the
 * background"). Both fail silently if this is ever unwired.
 */
import { focusManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

import { subscribeAppStateFocus } from '../app-state-focus';

type Listener = (status: AppStateStatus) => void;

let listener: Listener | null = null;
let removed = false;

beforeEach(() => {
  listener = null;
  removed = false;

  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    listener = handler as Listener;
    return { remove: () => void (removed = true) } as ReturnType<
      typeof AppState.addEventListener
    >;
  });
  jest.spyOn(focusManager, 'setFocused').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('subscribeAppStateFocus', () => {
  it('seeds the current state rather than waiting for the first change', () => {
    // An app launched straight into the foreground never emits a change event,
    // so without this the first poll would never be scheduled.
    subscribeAppStateFocus();

    expect(focusManager.setFocused).toHaveBeenCalledWith(AppState.currentState === 'active');
  });

  it('unfocuses on background, so the poll stops', () => {
    subscribeAppStateFocus();
    listener?.('background');

    expect(focusManager.setFocused).toHaveBeenLastCalledWith(false);
  });

  it('treats inactive as unfocused too', () => {
    // iOS reports `inactive` during the app switcher and an incoming call.
    subscribeAppStateFocus();
    listener?.('inactive');

    expect(focusManager.setFocused).toHaveBeenLastCalledWith(false);
  });

  it('refocuses on return, which is what refetches the queue', () => {
    subscribeAppStateFocus();
    listener?.('background');
    listener?.('active');

    expect(focusManager.setFocused).toHaveBeenLastCalledWith(true);
  });

  it('hands back an unsubscribe, so a fast refresh does not stack listeners', () => {
    const unsubscribe = subscribeAppStateFocus();
    unsubscribe();

    expect(removed).toBe(true);
  });
});
