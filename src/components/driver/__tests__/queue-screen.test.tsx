/**
 * The queue page frame, and one property that is easy to lose.
 *
 * Every tab scene in this app is transparent so the shared mesh shows through.
 * That means an inactive scene is not hidden behind the active one — it shows
 * *through* it, and two of the three tabs render patient names and addresses.
 * The bug was real and visible: opening Done showed the Ready list ghosting
 * behind the closed cards.
 *
 * `detachInactiveScreens` on the navigator is the platform fix and it does
 * nothing on web, so the component refuses to draw when it is not the focused
 * tab. This test is what keeps that from being "simplified" away (PRD §8.1).
 */

/** Controls what `useIsFocused` reports. Prefixed so `jest.mock` may close over it. */
let mockFocused = true;

// Mocked without `requireActual`: expo-router's real entry pulls in an
// untransformed ESM dependency, and `useIsFocused` is the only thing the
// component under test uses from it.
jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
}));

/** In-memory Keychain — the header reads the session for a fallback name. */
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

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/auth/session-provider';
import { MeshBackground } from '@/components/glass/mesh-background';
import { QueueScreen } from '@/components/driver/queue-screen';
import { AppThemeProvider } from '@/design/theme-provider';
import { LocaleProvider } from '@/locale/locale-provider';
import { createQueryClient } from '@/queue/query-client';
import type { QueueResponse } from '@/api/types';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const QUEUE = {
  date: '2026-08-22',
  pharmacy: { name: 'Pharmacie Saint-Laurent', phone: null },
  stops: [],
  closed: [],
} as QueueResponse;

/** Just enough of a query result for the frame to render. */
function queryStub(overrides: Record<string, unknown> = {}) {
  return {
    data: QUEUE,
    error: null,
    isPending: false,
    isRefetching: false,
    refetch: jest.fn(),
    ...overrides,
  } as never;
}

function mount(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppThemeProvider initialMode="dark">
        <LocaleProvider initialLocale="fr">
          <QueryClientProvider client={createQueryClient()}>
            <SessionProvider>
              <MeshBackground>{ui}</MeshBackground>
            </SessionProvider>
          </QueryClientProvider>
        </LocaleProvider>
      </AppThemeProvider>
    </SafeAreaProvider>,
  );
}

function screenWithPatient() {
  return (
    <QueueScreen
      query={queryStub()}
      items={[{ id: '1', name: 'Evelyn Harper' }]}
      keyExtractor={(item) => item.id}
      renderItem={(item) => <Text>{item.name}</Text>}
      emptyIcon="file-tray-outline"
      emptyTitle="Rien à ramasser"
      emptyBody="Aucun colis ne vous attend au comptoir."
    />
  );
}

afterEach(() => {
  mockFocused = true;
  mockSecureStoreData.clear();
});

describe('the focused tab', () => {
  it('renders the pharmacy, the date, and the stops', () => {
    mount(screenWithPatient());

    expect(screen.getByText('Pharmacie Saint-Laurent')).toBeTruthy();
    expect(screen.getByText('2026-08-22')).toBeTruthy();
    expect(screen.getByText('Evelyn Harper')).toBeTruthy();
  });

  it('shows the empty state rather than a blank page', () => {
    mount(
      <QueueScreen
        query={queryStub()}
        items={[] as { id: string }[]}
        keyExtractor={(item) => item.id}
        renderItem={() => <Text>never</Text>}
        emptyIcon="file-tray-outline"
        emptyTitle="Rien à ramasser"
        emptyBody="Aucun colis ne vous attend au comptoir."
      />,
    );

    expect(screen.getByText('Rien à ramasser')).toBeTruthy();
  });

  it('renders the degraded banner as a note on a working screen, not an error', () => {
    mount(
      <QueueScreen
        query={queryStub({ data: { ...QUEUE, degraded: true } })}
        items={[{ id: '1', name: 'Evelyn Harper' }]}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.name}</Text>}
        emptyIcon="file-tray-outline"
        emptyTitle="Rien à ramasser"
        emptyBody="Aucun colis ne vous attend au comptoir."
      />,
    );

    // The stops are still listed — a degraded route is a working route.
    expect(screen.getByText('Evelyn Harper')).toBeTruthy();
    expect(
      screen.getByText('Route non optimisée — ordre précédent conservé'),
    ).toBeTruthy();
  });
});

describe('a tab that is not being looked at', () => {
  it('draws nothing at all, so its patient data cannot show through another tab', () => {
    mockFocused = false;

    mount(screenWithPatient());

    expect(screen.queryByText('Evelyn Harper')).toBeNull();
    // Not even the chrome: the whole scene is transparent, so anything drawn
    // here would be visible on top of the tab the driver is actually reading.
    expect(screen.queryByText('Pharmacie Saint-Laurent')).toBeNull();
  });
});
