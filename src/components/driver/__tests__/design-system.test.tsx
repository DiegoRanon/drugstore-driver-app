import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DesignGallery from '@/app/design';
import { ClosedOrderCard, OrderCard } from '@/components/driver/order-card';
import { QueueTabBar } from '@/components/driver/queue-tab-bar';
import { StopSheet } from '@/components/driver/stop-sheet';
import { MeshBackground } from '@/components/glass/mesh-background';
import { AppThemeProvider } from '@/design/theme-provider';
import { DARK_THEME, LIGHT_THEME, type ThemeName } from '@/design/theme';
import { ReturnCard } from '@/components/driver/return-card';
import {
  ON_THE_WAY_STOPS,
  READY_STOPS,
  RETURN_STOPS,
  TERMINAL_STOPS,
} from '@/design/fixtures';
import { STRINGS } from '@/locale/strings';

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
  cooler: STRINGS[locale].cooler,
  priority: STRINGS[locale].priority,
  packages: STRINGS[locale].packages,
  accessibilityPrefix: STRINGS[locale].accessibilityPrefix,
});

const sheetLabels = (locale: 'fr' | 'en') => {
  const t = STRINGS[locale];
  return {
    status: t.statusOnTheWay,
    client: t.client,
    callClient: t.callClient,
    callPharmacy: t.callPharmacy,
    navigate: t.navigate,
    window: t.window,
    promisedWindow: t.promisedWindow,
    amountDue: t.amountDue,
    paymentAtDoor: t.paymentAtDoor,
    cooler: t.cooler,
    pickup: t.takeCharge,
    delivered: t.delivered,
    returnOrder: t.returnOrder,
    handover: t.handedBack,
  };
};

describe('OrderCard', () => {
  it('renders the patient, address, and window in French', () => {
    mount(<OrderCard stop={READY} locale="fr" labels={cardLabels('fr')} />);

    expect(screen.getByText(READY.patient_name)).toBeTruthy();
    expect(screen.getByText(READY.address)).toBeTruthy();
    expect(screen.getByText('AM 9h–12h')).toBeTruthy();
    expect(screen.getByText(STRINGS.fr.cooler)).toBeTruthy();
  });

  it('renders the same card in English with English formatting', () => {
    mount(<OrderCard stop={READY} locale="en" labels={cardLabels('en')} />);

    expect(screen.getByText('AM 9–12')).toBeTruthy();
    expect(screen.getByText(STRINGS.en.cooler)).toBeTruthy();
  });

  it('exposes selection state to assistive technology', () => {
    mount(
      <OrderCard stop={READY} locale="fr" labels={cardLabels('fr')} selectable selected />,
    );

    const card = screen.getByLabelText(
      `${STRINGS.fr.accessibilityPrefix} ${READY.patient_name}, ${READY.address}`,
    );
    expect(card.props.accessibilityState).toMatchObject({ checked: true, selected: true });
  });
});

describe('ClosedOrderCard', () => {
  const closed = TERMINAL_STOPS[0]!;
  const labels = {
    completed: STRINGS.fr.completed,
    returned_to_pharmacy: STRINGS.fr.returned_to_pharmacy,
    cancelled: STRINGS.fr.cancelled,
    coolerPending: STRINGS.fr.coolerPending,
  };

  it('shows the order reference and outcome', () => {
    mount(<ClosedOrderCard stop={closed} locale="fr" labels={labels} />);

    expect(screen.getByText(STRINGS.fr.completed)).toBeTruthy();
  });

  it('renders no patient data — the terminal payload carries none', () => {
    mount(<ClosedOrderCard stop={closed} locale="fr" labels={labels} />);

    for (const stop of [...READY_STOPS, ...ON_THE_WAY_STOPS]) {
      expect(screen.queryByText(stop.patient_name)).toBeNull();
      expect(screen.queryByText(stop.address)).toBeNull();
    }
  });

  it('keeps an unanswered cooler check visible so it can be answered later', () => {
    const pending = TERMINAL_STOPS.find(
      (stop) => stop.requires_cooler_bag && stop.cooler_bag_confirmed === null,
    )!;
    mount(<ClosedOrderCard stop={pending} locale="fr" labels={labels} />);

    expect(screen.getByText(STRINGS.fr.coolerPending)).toBeTruthy();
  });
});

describe('StopSheet', () => {
  it('opens as a full-screen modal with an explicit close control', () => {
    const onDismiss = jest.fn();
    const view = mount(
      <StopSheet
        stop={ACTIVE}
        locale="fr"
        transitions={['complete', 'return']}
        labels={sheetLabels('fr')}
        fullScreen
        dismissLabel={STRINGS.fr.cancel}
        onDismiss={onDismiss}
      />,
    );

    const modal = view.UNSAFE_getByType(Modal);
    expect(modal.props.presentationStyle).toBe('fullScreen');
    expect(modal.props.transparent).not.toBe(true);

    fireEvent.press(screen.getByLabelText(STRINGS.fr.cancel));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders only the transitions the server allows', () => {
    mount(
      <StopSheet
        stop={ACTIVE}
        locale="fr"
        transitions={['complete', 'return']}
        labels={sheetLabels('fr')}
      />,
    );

    expect(screen.getByText(STRINGS.fr.delivered)).toBeTruthy();
    expect(screen.getByText(STRINGS.fr.returnOrder)).toBeTruthy();
    expect(screen.queryByText(STRINGS.fr.takeCharge)).toBeNull();
  });

  it('offers pickup, and nothing else, on a stop still at the pharmacy', () => {
    mount(
      <StopSheet stop={READY} locale="fr" transitions={['pickup']} labels={sheetLabels('fr')} />,
    );

    expect(screen.getByText(STRINGS.fr.takeCharge)).toBeTruthy();
    expect(screen.queryByText(STRINGS.fr.delivered)).toBeNull();
    expect(screen.queryByText(STRINGS.fr.returnOrder)).toBeNull();
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
    expect(screen.getByText(STRINGS.en.paymentAtDoor)).toBeTruthy();
  });
});

describe('QueueTabBar', () => {
  it('labels each tab with its count for screen readers', () => {
    const counts = { ready: 8, on_the_way: 3, to_hand_back: 2, done: 12 };
    mount(
      <QueueTabBar
        active="ready"
        counts={counts}
        labels={STRINGS.fr.tabs}
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText(`${STRINGS.fr.tabs.ready}, 8`)).toBeTruthy();
    expect(screen.getByLabelText(`${STRINGS.fr.tabs.on_the_way}, 3`)).toBeTruthy();
  });

  it('renders four tabs, including the return leg the PRD used to say we did not need', () => {
    mount(
      <QueueTabBar
        active="to_hand_back"
        counts={{ ready: 0, on_the_way: 0, to_hand_back: 2, done: 0 }}
        labels={STRINGS.fr.tabs}
        onChange={() => {}}
      />,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(4);
    const tab = screen.getByLabelText(`${STRINGS.fr.tabs.to_hand_back}, 2`);
    expect(tab.props.accessibilityState).toMatchObject({ selected: true });
  });
});

/**
 * The screen that only exists because `returned` stopped being terminal.
 *
 * Its whole reason to exist is the pair of facts in `privacy-rules.md` §1: the
 * order is still open, and the patient's details are already gone. So the card
 * has to show label codes — the driver matches parcels against them at the
 * counter — and must not show anything that identifies a person.
 */
describe('ReturnCard', () => {
  const returned = RETURN_STOPS[0]!;
  const labels = {
    reasons: STRINGS.fr.failureReasons,
    cooler: STRINGS.fr.cooler,
    handedBack: STRINGS.fr.handedBack,
  };

  it('shows the label codes the driver reads out at the counter', () => {
    mount(<ReturnCard stop={returned} locale="fr" labels={labels} />);

    for (const parcel of returned.packages) {
      expect(screen.getByText(parcel.label_code)).toBeTruthy();
    }
  });

  it('names why the delivery failed', () => {
    mount(<ReturnCard stop={returned} locale="fr" labels={labels} />);

    expect(
      screen.getByText(STRINGS.fr.failureReasons[returned.failure_reason!]),
    ).toBeTruthy();
  });

  it('renders no patient data, even though the order is not terminal', () => {
    mount(<ReturnCard stop={returned} locale="fr" labels={labels} />);

    for (const stop of [...READY_STOPS, ...ON_THE_WAY_STOPS]) {
      expect(screen.queryByText(stop.patient_name)).toBeNull();
      expect(screen.queryByText(stop.address)).toBeNull();
      expect(screen.queryByText(stop.phone_number)).toBeNull();
    }
  });
});

describe('design gallery', () => {
  it('mounts every surface at once and switches language on tap', () => {
    mount(<DesignGallery />);

    // French is the default (PRD 5.11).
    expect(screen.getByText(STRINGS.fr.tagline)).toBeTruthy();
    expect(screen.getByText(STRINGS.fr.tabs.on_the_way)).toBeTruthy();
    expect(screen.getAllByText(STRINGS.fr.returnOrder).length).toBeGreaterThan(0);

    fireEvent.press(screen.getByLabelText('EN'));

    expect(screen.getByText(STRINGS.en.tagline)).toBeTruthy();
    expect(screen.getByText(STRINGS.en.tabs.on_the_way)).toBeTruthy();
  });
});

describe('themes', () => {
  it('renders every surface in day mode as well as night', () => {
    mount(<DesignGallery />, 'light');

    expect(screen.getByText(STRINGS.fr.tagline)).toBeTruthy();
    expect(screen.getAllByText(STRINGS.fr.returnOrder).length).toBeGreaterThan(0);
  });

  it('switches from night to day when the driver picks day', () => {
    mount(<DesignGallery />);

    // The night accent, on the section captions, before the switch.
    const caption = screen.getByText('2 - Ready tab, batch pickup');
    expect(caption.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: DARK_THEME.palette.accentDim })]),
    );

    fireEvent.press(screen.getByLabelText(STRINGS.fr.themeLight));

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
