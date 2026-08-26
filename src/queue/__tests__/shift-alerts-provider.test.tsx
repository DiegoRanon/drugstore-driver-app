/**
 * The wiring between the reducer and the two screens.
 *
 * The reducer is tested on its own and the banner is tested on its own, which
 * leaves exactly one seam untested: the provider that feeds one into the other
 * as payloads arrive. It is also the only place the van is taken into account —
 * the same arrival is "new packages" to a driver at the counter and "come back
 * to the pharmacy" to one who is already out, and nothing else in the feature
 * knows the difference.
 */
import type { ActiveStop, QueueResponse } from '@/api/types';

type Stop = QueueResponse['stops'][number];

/** Both prefixed so `jest.mock`'s factory may close over them. */
let mockQueue: QueueResponse | undefined;
let mockOnTheWay: Stop[] = [];

jest.mock('@/queue/use-queue', () => ({
  useQueueSlices: () => ({
    query: { data: mockQueue },
    slices: {
      ready: [],
      onTheWay: mockOnTheWay,
      toHandBack: [],
      done: [],
      totals: null,
      pharmacy: null,
      counts: {
        ready: 0,
        on_the_way: mockOnTheWay.length,
        to_hand_back: 0,
        done: 0,
      },
    },
  }),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ShiftAlertsProvider, useShiftAlerts } from '../shift-alerts-provider';
import { activeStop, queue as buildQueue } from '@/test-support/queue-fixtures';

function stop(id: string, status: ActiveStop['status'] = 'in_pharmacy'): Stop {
  return activeStop({ id, status });
}

function queue(stops: Stop[]): QueueResponse {
  return buildQueue({ stops });
}

/** Renders the context as text, plus a handle on `acknowledge`. */
function Probe() {
  const { newAtPharmacy, shouldReturn, acknowledge } = useShiftAlerts();
  return (
    <Text testID="alerts" onPress={acknowledge}>
      {`${newAtPharmacy}|${shouldReturn}`}
    </Text>
  );
}

function mount() {
  return render(
    <ShiftAlertsProvider>
      <Probe />
    </ShiftAlertsProvider>,
  );
}

beforeEach(() => {
  mockQueue = undefined;
  mockOnTheWay = [];
});

describe('ShiftAlertsProvider', () => {
  it('says nothing before the first payload arrives', () => {
    mount();

    expect(screen.getByTestId('alerts')).toHaveTextContent('0|false');
  });

  it('says nothing on the launch payload, however full the day is', () => {
    mockQueue = queue([stop('a'), stop('b'), stop('c')]);

    mount();

    expect(screen.getByTestId('alerts')).toHaveTextContent('0|false');
  });

  it('counts a package that appeared after the baseline', () => {
    mockQueue = queue([stop('a')]);
    const { rerender } = mount();

    mockQueue = queue([stop('a'), stop('late')]);
    rerender(
      <ShiftAlertsProvider>
        <Probe />
      </ShiftAlertsProvider>,
    );

    expect(screen.getByTestId('alerts')).toHaveTextContent('1|false');
  });

  it('only suggests a trip back once there are packages in the van', () => {
    mockQueue = queue([stop('a')]);
    const { rerender } = mount();

    // The pharmacy adds an order while the driver is already out delivering.
    mockOnTheWay = [stop('in-the-van', 'picked_up')];
    mockQueue = queue([stop('a'), stop('late'), stop('in-the-van', 'picked_up')]);
    rerender(
      <ShiftAlertsProvider>
        <Probe />
      </ShiftAlertsProvider>,
    );

    expect(screen.getByTestId('alerts')).toHaveTextContent('1|true');
  });

  it('clears both readings when the driver acknowledges', () => {
    mockQueue = queue([stop('a')]);
    const { rerender } = mount();

    mockOnTheWay = [stop('in-the-van', 'picked_up')];
    mockQueue = queue([stop('a'), stop('late'), stop('in-the-van', 'picked_up')]);
    rerender(
      <ShiftAlertsProvider>
        <Probe />
      </ShiftAlertsProvider>,
    );
    expect(screen.getByTestId('alerts')).toHaveTextContent('1|true');

    // Dismissing on either tab settles it for both — it is one fact.
    fireEvent.press(screen.getByTestId('alerts'));

    expect(screen.getByTestId('alerts')).toHaveTextContent('0|false');
  });
});
