import { distance, duration, timeRange } from '@/lib/format';
import { navigationUrl } from '@/lib/navigate';

/**
 * What the driver reads off a card, and where the Navigate button sends them.
 *
 * The formatters matter because their failure mode is quiet: a null estimate
 * rendered as "0 km" tells a driver the next stop is across the street, and
 * they will believe it. The navigation URL matters because it is the one place
 * the app turns route data into a physical instruction.
 */

describe('distance', () => {
  it('reads in metres below a kilometre', () => {
    expect(distance(240, 'fr')).toBe('250 m');
    expect(distance(980, 'en')).toBe('1000 m');
  });

  it('never rounds a real distance down to nothing', () => {
    // "0 m" would read as "you are already there".
    expect(distance(10, 'fr')).toBe('50 m');
  });

  it('switches to kilometres with one decimal, then drops it', () => {
    expect(distance(2400, 'en')).toBe('2.4 km');
    expect(distance(24_000, 'en')).toBe('24 km');
  });

  it('uses the locale decimal separator', () => {
    expect(distance(2400, 'fr')).toBe('2,4 km');
  });

  it('renders nothing rather than a guess when there is no reading', () => {
    // The absence of an estimate means the provider could not measure. It does
    // not mean the stop is close, and it must not look like it does.
    expect(distance(null, 'fr')).toBeNull();
    expect(distance(Number.NaN, 'fr')).toBeNull();
    expect(distance(-1, 'fr')).toBeNull();
  });
});

describe('duration', () => {
  it('rounds to whole minutes', () => {
    expect(duration(360)).toBe('6 min');
    expect(duration(390)).toBe('7 min');
  });

  it('does not claim zero minutes', () => {
    expect(duration(20)).toBe('< 1 min');
  });

  it('breaks into hours past sixty minutes', () => {
    expect(duration(3600)).toBe('1 h');
    expect(duration(5400)).toBe('1 h 30');
  });

  it('renders nothing for a missing reading', () => {
    expect(duration(null)).toBeNull();
    expect(duration(-5)).toBeNull();
  });
});

describe('timeRange', () => {
  it('trims seconds off the clock face', () => {
    expect(timeRange('14:00:00', '16:00:00')).toBe('14:00 – 16:00');
  });

  it('accepts a range already trimmed', () => {
    expect(timeRange('14:00', '16:00')).toBe('14:00 – 16:00');
  });

  it('needs both ends', () => {
    // Half a range is not a promise, and the server's CHECK constraint means
    // it should never arrive — but a null here must render nothing, not "14:00 – ".
    expect(timeRange('14:00', null)).toBeNull();
    expect(timeRange(null, '16:00')).toBeNull();
    expect(timeRange(null, null)).toBeNull();
  });
});

describe('navigationUrl', () => {
  const stop = {
    latitude: 45.5019,
    longitude: -73.5674,
    address: '1000 Rue Notre-Dame O, Montréal',
  };

  it('navigates to the coordinate, not the address string', () => {
    const url = navigationUrl(stop);

    // Handing the map app the typed address would mean a second, uncontrolled
    // geocode that can disagree with the one the route was solved from.
    expect(url).toContain('45.5019,-73.5674');
  });

  it('carries the address only as a label', () => {
    const url = navigationUrl(stop)!;
    const afterCoordinates = url.slice(url.indexOf('45.5019'));
    expect(afterCoordinates).not.toContain('Notre-Dame');
  });

  it('returns nothing for a stop that was never geocoded', () => {
    // The caller hides the button rather than opening a map on a guess.
    expect(navigationUrl({ ...stop, latitude: null, longitude: null })).toBeNull();
  });

  it('treats half a coordinate as no coordinate', () => {
    expect(navigationUrl({ ...stop, longitude: null })).toBeNull();
    expect(navigationUrl({ ...stop, latitude: null })).toBeNull();
  });
});
