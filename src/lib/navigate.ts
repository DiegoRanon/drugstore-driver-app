import { Linking, Platform } from 'react-native';

/**
 * Hands a stop off to the phone's map app.
 *
 * Until the Route Optimizer landed there was nothing to hand off — the API
 * exposed no coordinates for a stop, which is why `NextStopCard.onNavigate`
 * has been an unwired prop and `StopSheet` opens without a map preview. Now
 * that an active stop carries `latitude`/`longitude`, this is the last mile.
 *
 * WHY COORDINATES AND NOT THE ADDRESS STRING
 *
 * The address on the order is a snapshot of what an employee typed. Handing
 * that to a map app means a second, uncontrolled geocode on the driver's
 * phone, which can disagree with the one the route was solved from — the
 * driver would be navigating to a different point than the one the optimizer
 * sequenced. The coordinate is the thing the route was built on, so it is the
 * thing to navigate to. The address rides along as the label so the map shows
 * a name rather than a number pair.
 *
 * A stop with no coordinate returns false rather than falling back to an
 * address search: the caller says so plainly instead of opening a map that
 * may or may not have found the right house.
 */
export type NavigableStop = {
  latitude: number | null;
  longitude: number | null;
  address: string;
};

export function navigationUrl(stop: NavigableStop): string | null {
  const { latitude, longitude } = stop;
  if (latitude === null || longitude === null) return null;

  const point = `${latitude},${longitude}`;
  const label = encodeURIComponent(stop.address);

  // Apple Maps is the only one guaranteed present on iOS; `maps:` opens it
  // with the pin already placed. Android's `google.navigation:` starts turn-by-
  // turn directly, which is what a driver at the wheel actually wants.
  if (Platform.OS === 'ios') {
    return `maps:0,0?q=${label}@${point}`;
  }
  if (Platform.OS === 'android') {
    return `google.navigation:q=${point}`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${point}`;
}

/**
 * Opens the stop in a map app. Resolves false when there is nothing to open,
 * so the caller can tell the driver why rather than appearing to do nothing.
 */
export async function navigateToStop(stop: NavigableStop): Promise<boolean> {
  const url = navigationUrl(stop);
  if (!url) return false;

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    // A phone with no map app, or an OEM build that refuses the scheme. The
    // universal https form works in a browser everywhere.
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`;
    try {
      await Linking.openURL(fallback);
      return true;
    } catch {
      return false;
    }
  }
}
