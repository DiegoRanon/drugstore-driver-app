import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DesignGallery from '@/app/design';
import { ClosedOrderCard, OrderCard } from '@/components/driver/order-card';
import { QueueTabBar } from '@/components/driver/queue-tab-bar';
import { StopSheet } from '@/components/driver/stop-sheet';
import { MeshBackground } from '@/components/glass/mesh-background';
import { AppThemeProvider } from '@/design/theme-provider';
import { DARK_THEME, LIGHT_THEME, type ThemeName } from '@/design/theme';
import { CLOSED_STOPS, ON_THE_WAY_STOPS, READY_STOPS } from '@/design/fixtures';
import { GALLERY_STRINGS } from '@/design/gallery-strings';

/**
 * Render checks for the design system.
 *
 * Three things are worth asserting at this stage, and they are the three that
 * would be expensive to discover later:
 *
 *   1. every surface mounts in both languages
 *   2. a closed delivery renders no patient data (PRD 8.1)
 *   3. the detail sheet's actions come from the `transitions` prop, not from a
 *      status switch inside the component (PRD 5.2 — the server owns the state
 *      machine)
 */

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function mount(ui: ReactElement, mode: ThemeName = 'dark') {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppThemeProvider initialMode={mode}>
        <MeshBackground>{ui}</MeshBackground>
      </AppThemeProvider>
    </SafeAreaProvider>,
  );
}

const READY = READY_STOPS[0]!;
const ACTIVE = ON_THE_WAY_STOPS[0]!;

const cardLabels = (locale: 'fr' | 'en') => ({
  cooler: GALLERY_STRINGS[locale].cooler,
  accessibilityPrefix: GALLERY_STRINGS[locale].accessibilityPrefix,
});

const sheetLabels = (locale: 'fr' | 'en') => {
  const t = GALLERY_STRINGS[locale];
  return {
    status: t.statusOnTheWay,
    client: t.client,
    callClient: t.callClient,
    callPharmacy: t.callPharmacy,
    window: t.window,
    amountDue: t.amountDue,
    paymentAtDoor: t.paymentAtDoor,
    cooler: t.cooler,
    pickup: t.takeCharge,
    delivered: t.delivered,
    returnOrder: t.returnOrder,
  };
};

describe('OrderCard', () => {
  it('renders the patient, address, and window in French', () => {
    mount(<OrderCard stop={READY} locale="fr" labels={cardLabels('fr')} />);

    expect(screen.getByText(READY.patient_name)).toBeTruthy();
    expect(screen.getByText(READY.address)).toBeTruthy();
    expect(screen.getByText('AM 9h–12h')).toBeTruthy();
    expect(screen.getByText(GALLERY_STRINGS.fr.cooler)).toBeTruthy();
  });

  it('renders the same card in English with English formatting', () => {
    mount(<OrderCard stop={READY} locale="en" labels={cardLabels('en')} />);

    expect(screen.getByText('AM 9–12')).toBeTruthy();
    expect(screen.getByText(GALLERY_STRINGS.en.cooler)).toBeTruthy();
  });

  it('exposes selection state to assistive technology', () => {
    mount(
      <OrderCard stop={READY} locale="fr" labels={cardLabels('fr')} selectable selected />,
    );

    const card = screen.getByLabelText(
      `${GALLERY_STRINGS.fr.accessibilityPrefix} ${READY.patient_name}, ${READY.address}`,
    );
    expect(card.props.accessibilityState).toMatchObject({ checked: true, selected: true });
  });
});

describe('ClosedOrderCard', () => {
  const closed = CLOSED_STOPS[0]!;
  const labels = {
    completed: GALLERY_STRINGS.fr.completed,
    returned: GALLERY_STRINGS.fr.returned,
    cancelled: GALLERY_STRINGS.fr.cancelled,
    coolerPending: GALLERY_STRINGS.fr.coolerPending,
    returnToPharmacy: GALLERY_STRINGS.fr.returnToPharmacy,
  };

  it('shows the order reference and outcome', () => {
    mount(<ClosedOrderCard stop={closed} locale="fr" labels={labels} />);

    expect(screen.getByText(GALLERY_STRINGS.fr.completed)).toBeTruthy();
  });

  it('renders no patient data — the terminal payload carries none', () => {
    mount(<ClosedOrderCard stop={closed} locale="fr" labels={labels} />);

    for (const stop of [...READY_STOPS, ...ON_THE_WAY_STOPS]) {
      expect(screen.queryByText(stop.patient_name)).toBeNull();
      expect(screen.queryByText(stop.address)).toBeNull();
    }
  });

  it('keeps an unanswered cooler check visible so it can be answered later', () => {
    const pending = CLOSED_STOPS.find(
      (stop) => stop.requires_cooler_bag && stop.cooler_bag_confirmed === null,
    )!;
    mount(<ClosedOrderCard stop={pending} locale="fr" labels={labels} />);

    expect(screen.getByText(GALLERY_STRINGS.fr.coolerPending)).toBeTruthy();
  });
});

describe('StopSheet', () => {
  it('renders only the transitions the server allows', () => {
    mount(
      <StopSheet
        stop={ACTIVE}
        locale="fr"
        transitions={['complete', 'return']}
        labels={sheetLabels('fr')}
      />,
    );

    expect(screen.getByText(GALLERY_STRINGS.fr.delivered)).toBeTruthy();
    expect(screen.getByText(GALLERY_STRINGS.fr.returnOrder)).toBeTruthy();
    expect(screen.queryByText(GALLERY_STRINGS.fr.takeCharge)).toBeNull();
  });

  it('offers pickup, and nothing else, on a stop still at the pharmacy', () => {
    mount(
      <StopSheet stop={READY} locale="fr" transitions={['pickup']} labels={sheetLabels('fr')} />,
    );

    expect(screen.getByText(GALLERY_STRINGS.fr.takeCharge)).toBeTruthy();
    expect(screen.queryByText(GALLERY_STRINGS.fr.delivered)).toBeNull();
    expect(screen.queryByText(GALLERY_STRINGS.fr.returnOrder)).toBeNull();
  });

  it('surfaces the amount owed at the door', () => {
    mount(
      <StopSheet
        stop={ACTIVE}
        locale="en"
        transitions={['complete']}
        labels={sheetLabels('en')}
      />,
    );

    expect(screen.getByText(/42\.50/)).toBeTruthy();
    expect(screen.getByText(GALLERY_STRINGS.en.paymentAtDoor)).toBeTruthy();
  });
});

describe('QueueTabBar', () => {
  it('labels each tab with its count for screen readers', () => {
    const counts = { ready: 8, on_the_way: 3, done: 12 };
    mount(
      <QueueTabBar
        active="ready"
        counts={counts}
        labels={GALLERY_STRINGS.fr.tabs}
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText(`${GALLERY_STRINGS.fr.tabs.ready}, 8`)).toBeTruthy();
    expect(screen.getByLabelText(`${GALLERY_STRINGS.fr.tabs.on_the_way}, 3`)).toBeTruthy();
  });
});

describe('design gallery', () => {
  it('mounts every surface at once and switches language on tap', () => {
    mount(<DesignGallery />);

    // French is the default (PRD 5.11).
    expect(screen.getByText(GALLERY_STRINGS.fr.tagline)).toBeTruthy();
    expect(screen.getByText(GALLERY_STRINGS.fr.tabs.on_the_way)).toBeTruthy();
    expect(screen.getAllByText(GALLERY_STRINGS.fr.returnOrder).length).toBeGreaterThan(0);

    fireEvent.press(screen.getByLabelText('EN'));

    expect(screen.getByText(GALLERY_STRINGS.en.tagline)).toBeTruthy();
    expect(screen.getByText(GALLERY_STRINGS.en.tabs.on_the_way)).toBeTruthy();
  });
});

describe('themes', () => {
  it('renders every surface in day mode as well as night', () => {
    mount(<DesignGallery />, 'light');

    expect(screen.getByText(GALLERY_STRINGS.fr.tagline)).toBeTruthy();
    expect(screen.getAllByText(GALLERY_STRINGS.fr.returnOrder).length).toBeGreaterThan(0);
  });

  it('switches from night to day when the driver picks day', () => {
    mount(<DesignGallery />);

    // The night accent, on the section captions, before the switch.
    const caption = screen.getByText('2 - Ready tab, batch pickup');
    expect(caption.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: DARK_THEME.palette.accentDim })]),
    );

    fireEvent.press(screen.getByLabelText(GALLERY_STRINGS.fr.themeLight));

    expect(screen.getByText('2 - Ready tab, batch pickup').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: LIGHT_THEME.palette.accentDim })]),
    );
  });

  it('keeps the two themes structurally identical', () => {
    // A missing key in one theme is a crash at runtime in that theme only, and
    // nothing else in the suite would catch it.
    const shape = (value: unknown): unknown =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .map(([key, inner]) => [key, shape(inner)])
              .sort(),
          )
        : typeof value;

    expect(shape(DARK_THEME)).toEqual(shape(LIGHT_THEME));
  });
});
