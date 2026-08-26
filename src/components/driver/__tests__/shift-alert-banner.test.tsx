/**
 * The two readings of "the pharmacy added work".
 *
 * Same underlying fact, two screens, two different things to say — and one of
 * them must stay quiet in a case that looks identical from the data alone. A
 * driver whose van is empty is standing at the counter; telling them to come
 * back to the pharmacy is nonsense.
 */

/** Prefixed so `jest.mock`'s factory may close over it. */
let mockAlerts = {
  newAtPharmacy: 0,
  shouldReturn: false,
  acknowledge: jest.fn(),
};

jest.mock('@/queue/shift-alerts-provider', () => ({
  useShiftAlerts: () => mockAlerts,
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ShiftAlertBanner } from '@/components/driver/shift-alert-banner';
import { MeshBackground } from '@/components/glass/mesh-background';
import { AppThemeProvider } from '@/design/theme-provider';
import { LocaleProvider } from '@/locale/locale-provider';
import { STRINGS, type Locale } from '@/locale/strings';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function mount(ui: ReactElement, locale: Locale = 'fr') {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppThemeProvider initialMode="dark">
        <LocaleProvider initialLocale={locale}>
          <MeshBackground>{ui}</MeshBackground>
        </LocaleProvider>
      </AppThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockAlerts = { newAtPharmacy: 0, shouldReturn: false, acknowledge: jest.fn() };
});

describe('on Ready', () => {
  it('says how many packages appeared at the counter', () => {
    mockAlerts.newAtPharmacy = 2;

    mount(<ShiftAlertBanner variant="assigned" />);

    expect(screen.getByText(STRINGS.fr.newOrders(2))).toBeTruthy();
    expect(screen.getByText(STRINGS.fr.dismiss)).toBeTruthy();
  });

  it('reads correctly for a single order', () => {
    mockAlerts.newAtPharmacy = 1;

    mount(<ShiftAlertBanner variant="assigned" />);

    expect(screen.getByText(STRINGS.fr.newOrders(1))).toBeTruthy();
  });

  it('renders nothing at all when there is nothing new', () => {
    mount(<ShiftAlertBanner variant="assigned" />);

    expect(screen.queryByText(STRINGS.fr.dismiss)).toBeNull();
  });

  it('speaks English too', () => {
    mockAlerts.newAtPharmacy = 3;

    mount(<ShiftAlertBanner variant="assigned" />, 'en');

    expect(screen.getByText(STRINGS.en.newOrders(3))).toBeTruthy();
  });
});

describe('on On the way', () => {
  it('suggests a trip back once the driver already has packages in the van', () => {
    mockAlerts = { newAtPharmacy: 2, shouldReturn: true, acknowledge: jest.fn() };

    mount(<ShiftAlertBanner variant="return_to_pharmacy" />);

    expect(screen.getByText(STRINGS.fr.backToPharmacy(2))).toBeTruthy();
  });

  it('stays quiet when the van is empty, even though orders are waiting', () => {
    // The driver is at the counter. Ready is already telling them.
    mockAlerts = { newAtPharmacy: 2, shouldReturn: false, acknowledge: jest.fn() };

    mount(<ShiftAlertBanner variant="return_to_pharmacy" />);

    expect(screen.queryByText(STRINGS.fr.backToPharmacy(2))).toBeNull();
    expect(screen.queryByText(STRINGS.fr.dismiss)).toBeNull();
  });
});

describe('dismissing', () => {
  it('acknowledges rather than hiding locally, so both tabs agree', () => {
    mockAlerts = { newAtPharmacy: 1, shouldReturn: true, acknowledge: jest.fn() };

    mount(<ShiftAlertBanner variant="return_to_pharmacy" />);
    fireEvent.press(screen.getByText(STRINGS.fr.dismiss));

    expect(mockAlerts.acknowledge).toHaveBeenCalledTimes(1);
  });
});
