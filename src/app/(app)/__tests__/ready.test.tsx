/**
 * Taking charge is what sequences the day.
 *
 * The driver picks their bags at the counter and walks out; if the run is not
 * ordered at that moment it is never ordered at all, and the first door they
 * drive to is whichever card happened to be on top. Three properties matter
 * and none of them is visible from the screen:
 *
 *   - the optimize call goes out *after* the pickups, because the endpoint
 *     sequences the queue the server holds, not the cards on screen;
 *   - it does not go out when nothing was picked up;
 *   - a failed optimize says so, because the pickups succeeded and the driver
 *     would otherwise walk out believing the order in front of them is a route.
 */
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), back: jest.fn() },
}));

const mockSecureStoreData = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStoreData.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStoreData.get(key) ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStoreData.delete(key);
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

/** Records the order calls happen in, which is the property under test. */
const calls: string[] = [];
const mockPickup = jest.fn();
const mockOptimize = jest.fn();

jest.mock('@/queue/mutations', () => ({
  usePickup: () => ({ mutateAsync: mockPickup, isPending: false }),
  useOptimize: () => ({ mutateAsync: mockOptimize, isPending: false }),
}));

let mockReady: ActiveStop[] = [];

jest.mock('@/queue/use-queue', () => ({
  useQueueSlices: () => ({
    query: {
      data: { pharmacy: { name: 'Pharmacie Saint-Laurent', phone: null }, date: '2026-09-08' },
      error: null,
      isPending: false,
      isRefetching: false,
      refetch: jest.fn(),
    },
    slices: {
      ready: mockReady,
      onTheWay: [],
      toReturn: [],
      closed: [],
      estimates: new Map(),
      totals: null,
      pharmacy: { name: 'Pharmacie Saint-Laurent', phone: null },
    },
  }),
}));

import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ReadyScreen from '../ready';
import type { ActiveStop } from '@/api/types';
import { SessionProvider } from '@/auth/session-provider';
import { AppThemeProvider } from '@/design/theme-provider';
import { LocaleProvider } from '@/locale/locale-provider';
import { STRINGS } from '@/locale/strings';
import { createQueryClient } from '@/queue/query-client';
import { activeStop } from '@/test-support/queue-fixtures';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const t = STRINGS.fr;

function mount() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppThemeProvider initialMode="dark">
        <LocaleProvider initialLocale="fr">
          <QueryClientProvider client={createQueryClient()}>
            <SessionProvider>
              <ReadyScreen />
            </SessionProvider>
          </QueryClientProvider>
        </LocaleProvider>
      </AppThemeProvider>
    </SafeAreaProvider>,
  );
}

/** Select the one card, open the label check, confirm it. */
async function takeInCharge() {
  fireEvent.press(
    screen.getByLabelText(`${t.accessibilityPrefix} Evelyn Harper, 4210 Willow Creek Dr`),
  );

  // The footer button and the sheet's confirm carry the same label; the sheet
  // mounts second, so the last match is the one inside it.
  fireEvent.press(screen.getByText(t.takeChargeCount(1)));
  const confirms = await screen.findAllByText(t.takeChargeCount(1));
  const confirm = confirms.at(-1);
  if (!confirm) throw new Error('the pickup sheet did not open');
  fireEvent.press(confirm);
}

beforeEach(() => {
  calls.length = 0;
  mockSecureStoreData.clear();
  mockReady = [activeStop({ id: 'a', status: 'in_pharmacy' })];

  mockPickup.mockReset().mockImplementation(async () => {
    calls.push('pickup');
  });
  mockOptimize.mockReset().mockImplementation(async () => {
    calls.push('optimize');
    return { degraded: false };
  });
});

describe('taking charge', () => {
  it('sequences the run once, after the pickups have landed', async () => {
    mount();
    await takeInCharge();

    await waitFor(() => expect(mockOptimize).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['pickup', 'optimize']);
  });

  it('does not sequence anything when every pickup failed', async () => {
    mockPickup.mockRejectedValue(new Error('409'));

    mount();
    await takeInCharge();

    await waitFor(() => expect(screen.queryByText(t.takeChargeCount(1))).toBeNull());
    expect(mockOptimize).not.toHaveBeenCalled();
  });

  it('tells the driver when the run could not be sequenced', async () => {
    mockOptimize.mockRejectedValue(new Error('network'));

    mount();
    await takeInCharge();

    // The pickups worked, so this is a note about the route, not a failure of
    // the thing the driver just did.
    expect(await screen.findByText(t.optimizeFailed)).toBeTruthy();
    expect(screen.getByText(t.retry)).toBeTruthy();
  });

  it('retries the sequencing from the banner', async () => {
    mockOptimize.mockRejectedValueOnce(new Error('network'));

    mount();
    await takeInCharge();
    await screen.findByText(t.optimizeFailed);

    fireEvent.press(screen.getByText(t.retry));

    await waitFor(() => expect(mockOptimize).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(t.optimizeFailed)).toBeNull());
  });
});
