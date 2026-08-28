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
  // The header's notification bell pushes this route; nothing here asserts on
  // navigation, it just must not be undefined.
  router: { push: jest.fn(), back: jest.fn() },
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
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/auth/session-provider';
import { MeshBackground } from '@/components/glass/mesh-background';
import { QueueScreen } from '@/components/driver/queue-screen';
import { AppThemeProvider } from '@/design/theme-provider';
import { LocaleProvider } from '@/locale/locale-provider';
import { createQueryClient } from '@/queue/query-client';
import { queue } from '@/test-support/queue-fixtures';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// Built by the shared fixture, with no `as` cast. The cast this used to carry
// still *compiled* after the server grew `to_return` and `totals`, and blew up
// at runtime inside `splitQueue` instead — which is the whole reason the
// builders exist.
const QUEUE = queue();

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

  it("renders a page's own banner alongside the shared ones", () => {
    mount(
      <QueueScreen
        query={queryStub({ data: { ...QUEUE, degraded: true } })}
        items={[{ id: '1', name: 'Evelyn Harper' }]}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.name}</Text>}
        emptyIcon="file-tray-outline"
        emptyTitle="Rien à ramasser"
        emptyBody="Aucun colis ne vous attend au comptoir."
        banner={<Text>2 nouvelles commandes vous ont été assignées</Text>}
      />,
    );

    // Both notices and the list: a new assignment does not replace a degraded
    // route, and neither replaces the day's work.
    expect(screen.getByText('Route non optimisée — ordre précédent conservé')).toBeTruthy();
    expect(screen.getByText('2 nouvelles commandes vous ont été assignées')).toBeTruthy();
    expect(screen.getByText('Evelyn Harper')).toBeTruthy();
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

describe('signing out', () => {
  /**
   * The confirmation used to be `Alert.alert`, which react-native-web does not
   * implement: on the deployed web build the header control did nothing at all.
   * Asserting on rendered text is what keeps the prompt a real component.
   */
  it('asks before it signs the driver out', () => {
    mount(screenWithPatient());

    expect(screen.queryByText('Se déconnecter ?')).toBeNull();

    fireEvent.press(screen.getByLabelText('Déconnexion'));

    expect(screen.getByText('Se déconnecter ?')).toBeTruthy();
    // The queue stays underneath: asking is not leaving.
    expect(screen.getByText('Evelyn Harper')).toBeTruthy();
  });

  it('backs out without touching the session', () => {
    mount(screenWithPatient());

    fireEvent.press(screen.getByLabelText('Déconnexion'));
    fireEvent.press(screen.getByLabelText('Annuler'));

    expect(screen.queryByText('Se déconnecter ?')).toBeNull();
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
