import { Redirect } from 'expo-router';

import { useSession } from '@/auth/session-provider';

/**
 * The app's front door.
 *
 * The route groups own everything real, so `/` exists only to send the driver
 * into the right one. Without it `/` matches nothing at all — harmless on
 * native, where the navigator just renders its first screen, but a hard 404 on
 * web.
 *
 * Each target is only ever named while its guard is open, so this cannot
 * bounce: a signed-out driver is never redirected at `(app)`, which the root
 * layout would refuse and send straight back here.
 */
export default function Index() {
  const { state } = useSession();

  // The native splash is still up; rendering a redirect now would race the
  // Keychain and send a signed-in driver to the login screen.
  if (state.status === 'restoring') return null;

  return <Redirect href={state.status === 'signed-in' ? '/ready' : '/sign-in'} />;
}
