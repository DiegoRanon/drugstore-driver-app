/**
 * What the Route Optimizer actually put on a driver's card.
 *
 * Three things arrived with the feature and each is invisible when it breaks:
 * the travel chip (absent means "not measured", never "close by"), the
 * promised interval (which outranks the single promised time), and the
 * Navigate button (which must not appear on a stop that has no coordinate to
 * navigate to).
 */
import { render, screen } from '@testing-library/react-native';

import { OrderCard } from '@/components/driver/order-card';
import { StopSheet } from '@/components/driver/stop-sheet';
import { AppThemeProvider } from '@/design/theme-provider';
import { activeStop, estimate } from '@/test-support/queue-fixtures';
import type { EtaStop } from '@/api/types';

const LABELS = {
  cooler: 'Glacière',
  priority: 'Prioritaire',
  packages: 'colis',
  accessibilityPrefix: 'Livraison pour',
  arriveAt: (time: string) => `Arrivée ~${time}`,
};

/** One stop's slice of the live, traffic-aware run estimate. */
function etaStop(overrides: Partial<EtaStop> = {}): EtaStop {
  return {
    order_id: 'active-1',
    duration_seconds: 720,
    distance_meters: 3200,
    arrival_time: '2026-08-22T18:06:00.000Z',
    ...overrides,
  };
}

const SHEET_LABELS = {
  status: 'En route',
  client: 'Client :',
  callClient: 'Appeler le client',
  callPharmacy: 'Appeler la pharmacie',
  navigate: 'Naviguer',
  window: 'Créneau',
  promisedWindow: 'Promis entre',
  amountDue: 'Montant dû',
  paymentAtDoor: 'Paiement à la porte',
  cooler: 'Glacière',
  pickup: 'Prendre en charge',
  delivered: 'Livré',
  returnOrder: 'Retourner',
  handover: 'Remis',
};

function renderCard(node: React.ReactElement) {
  return render(<AppThemeProvider>{node}</AppThemeProvider>);
}

describe('OrderCard — travel estimates', () => {
  it('shows distance and time together when the optimizer measured them', () => {
    renderCard(
      <OrderCard
        stop={activeStop({ status: 'picked_up' })}
        locale="fr"
        estimate={estimate({ distance_meters: 2400, duration_seconds: 360 })}
        labels={LABELS}
      />,
    );

    expect(screen.getByText('2,4 km · 6 min')).toBeTruthy();
  });

  it('shows nothing at all when there is no estimate', () => {
    // The ordinary case. An absent estimate means the provider could not
    // measure — rendering a zero would tell the driver the stop is adjacent.
    renderCard(
      <OrderCard stop={activeStop({ status: 'picked_up' })} locale="fr" labels={LABELS} />,
    );

    expect(screen.queryByText(/km/)).toBeNull();
    expect(screen.queryByText(/0 m/)).toBeNull();
  });

  it('shows the distance alone when only distance was measured', () => {
    renderCard(
      <OrderCard
        stop={activeStop({ status: 'picked_up' })}
        locale="fr"
        estimate={estimate({ distance_meters: 2400, duration_seconds: null })}
        labels={LABELS}
      />,
    );

    expect(screen.getByText('2,4 km')).toBeTruthy();
  });
});

describe('OrderCard — the position badge', () => {
  it('shows the server sequence when the caller passes no position', () => {
    renderCard(
      <OrderCard stop={activeStop({ status: 'picked_up', sequence_number: 4 })} locale="fr" labels={LABELS} />,
    );

    expect(screen.getByText('4')).toBeTruthy();
  });

  it('shows the caller-supplied position instead, without touching sequence_number', () => {
    // This is the renumbering on-the-way.tsx does after a stop completes:
    // the server's own number (5) is left alone, only the badge changes.
    renderCard(
      <OrderCard
        stop={activeStop({ status: 'picked_up', sequence_number: 5 })}
        locale="fr"
        position={2}
        labels={LABELS}
      />,
    );

    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText('5')).toBeNull();
  });

  it('hides the badge when a caller-supplied position is explicitly null', () => {
    renderCard(
      <OrderCard
        stop={activeStop({ status: 'picked_up', sequence_number: 3 })}
        locale="fr"
        position={null}
        labels={LABELS}
      />,
    );

    expect(screen.queryByText('3')).toBeNull();
  });
});

describe('OrderCard — the live run estimate', () => {
  it('shows the drive time to this stop, not how long it has been in the van', () => {
    // The elapsed-since-pickup counter reads the same on every card of a run
    // picked up together, so it told a driver nothing about which stop to
    // think about next. The leg duration differs per card.
    renderCard(
      <OrderCard
        stop={activeStop({
          status: 'picked_up',
          picked_up_at: '2026-08-22T12:00:00.000Z',
        })}
        locale="fr"
        eta={etaStop({ duration_seconds: 720 })}
        labels={LABELS}
      />,
    );

    expect(screen.getByText('12 min')).toBeTruthy();
  });

  it('shows the predicted arrival clock time alongside it', () => {
    renderCard(
      <OrderCard
        stop={activeStop({ status: 'picked_up' })}
        locale="fr"
        eta={etaStop()}
        labels={LABELS}
      />,
    );

    expect(screen.getByText(/Arrivée ~/)).toBeTruthy();
  });

  it('falls back to the elapsed counter when there is no estimate', () => {
    // A degraded run, or a stop with no coordinates. The counter is then the
    // only timing signal there is, so it stays rather than leaving a gap.
    renderCard(
      <OrderCard
        stop={activeStop({
          status: 'picked_up',
          picked_up_at: new Date(Date.now() - 90 * 60_000).toISOString(),
        })}
        locale="fr"
        labels={LABELS}
      />,
    );

    expect(screen.getByText('1 h 30')).toBeTruthy();
  });

  it('prefers the live arrival over the optimizer leg length', () => {
    // `estimate` describes the route that was solved; `eta` describes the one
    // being driven right now. When both exist the live one wins.
    renderCard(
      <OrderCard
        stop={activeStop({ status: 'picked_up' })}
        locale="fr"
        estimate={estimate({ distance_meters: 9000, duration_seconds: 1800 })}
        eta={etaStop({ duration_seconds: 720 })}
        labels={LABELS}
      />,
    );

    expect(screen.getByText('12 min')).toBeTruthy();
    expect(screen.queryByText('9 km · 30 min')).toBeNull();
  });
});

describe('OrderCard — the promised window', () => {
  it('prefers the explicit range over the single promised time', () => {
    // The range is the narrower commitment and the one the optimizer routed
    // to, so it is the one the driver is held to.
    renderCard(
      <OrderCard
        stop={activeStop({
          status: 'picked_up',
          requested_delivery_time: '09:30',
          requested_time_start: '14:00:00',
          requested_time_end: '16:00:00',
        })}
        locale="fr"
        labels={LABELS}
      />,
    );

    expect(screen.getByText('14:00 – 16:00')).toBeTruthy();
    expect(screen.queryByText('09:30')).toBeNull();
  });

  it('falls back to the single promised time', () => {
    renderCard(
      <OrderCard
        stop={activeStop({ status: 'picked_up', requested_delivery_time: '09:30' })}
        locale="fr"
        labels={LABELS}
      />,
    );

    expect(screen.getByText('09:30')).toBeTruthy();
  });
});

describe('StopSheet — navigation', () => {
  it('offers Navigate for a geocoded stop', () => {
    renderCard(
      <StopSheet
        stop={activeStop({ status: 'picked_up' })}
        locale="fr"
        transitions={['complete', 'return']}
        labels={SHEET_LABELS}
        onNavigate={() => {}}
      />,
    );

    expect(screen.getByText('Naviguer')).toBeTruthy();
  });

  it('hides Navigate when the caller passes no handler', () => {
    // The screen passes undefined for a stop with no coordinate. A dead button
    // on a moving vehicle is worse than no button.
    renderCard(
      <StopSheet
        stop={activeStop({ status: 'picked_up', latitude: null, longitude: null })}
        locale="fr"
        transitions={['complete', 'return']}
        labels={SHEET_LABELS}
      />,
    );

    expect(screen.queryByText('Naviguer')).toBeNull();
  });

  it('shows the promised interval in place of the AM/PM bounds', () => {
    renderCard(
      <StopSheet
        stop={activeStop({
          status: 'picked_up',
          requested_time_start: '14:00:00',
          requested_time_end: '16:00:00',
        })}
        locale="fr"
        transitions={['complete']}
        labels={SHEET_LABELS}
      />,
    );

    expect(screen.getByText('Promis entre')).toBeTruthy();
    expect(screen.getByText('14:00 – 16:00')).toBeTruthy();
  });

  it('falls back to the organization window when nothing was promised', () => {
    renderCard(
      <StopSheet
        stop={activeStop({ status: 'picked_up' })}
        locale="fr"
        transitions={['complete']}
        labels={SHEET_LABELS}
      />,
    );

    expect(screen.getByText('Créneau')).toBeTruthy();
    expect(screen.getByText('09:00 – 12:00')).toBeTruthy();
  });
});
