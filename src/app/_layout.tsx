import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';

import { SessionProvider, useSession } from '@/auth/session-provider';
import { MeshBackground } from '@/components/glass/mesh-background';
import { AppThemeProvider } from '@/design/theme-provider';
import { useTheme } from '@/design/theme';
import { LocaleProvider } from '@/locale/locale-provider';
import { subscribeAppStateFocus } from '@/queue/app-state-focus';
import { createQueryClient } from '@/queue/query-client';
import { RealtimeProvider } from '@/queue/realtime-provider';

/**
 * Hold the native splash until the Keychain has answered.
 *
 * Without this the first frame renders with no session — which is
 * indistinguishable from being signed out — so a driver reopening the app
 * would see the sign-in screen flash before their queue appears.
 */
void SplashScreen.preventAutoHideAsync();

/**
 * The navigator paints its own background from the React Navigation theme, and
 * that background sits *above* the mesh. Left at the default it is an opaque
 * `rgb(242,242,242)` that hides the entire design and turns every glass panel
 * into a floating box on a grey page.
 *
 * So the navigation theme tracks ours and its surfaces are transparent: the
 * mesh below is the only thing that paints the field, in either theme, from the
 * first frame of the first screen.
 */
function Navigation() {
  const theme = useTheme();
  const { state } = useSession();

  const navigationTheme = useMemo(() => {
    const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: 'transparent',
        card: 'transparent',
        border: 'transparent',
        text: theme.ink.primary,
        primary: theme.palette.accent,
      },
    };
  }, [theme]);

  useEffect(() => {
    if (state.status !== 'restoring') void SplashScreen.hideAsync();
  }, [state.status]);

  const signedIn = state.status === 'signed-in';

  return (
    <MeshBackground>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
            animation: 'fade',
          }}>
          {/*
            The guards are the whole access-control story: there is no
            `router.replace` in a `useEffect` anywhere, so there is no window in
            which a signed-out driver's device is rendering a patient address.
            When a guard flips — a deactivated driver mid-route — the navigator
            drops the protected group and falls through to the first available
            screen, which is why `(auth)` is declared second and not last.
          */}
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(app)" />
            {/*
              Pushed over the tab group rather than declared inside it. The
              feed is a destination, not a fifth state of the day, and pushing
              leaves the tabs mounted underneath — which is what keeps the
              queue's only long-lived observer alive under `gcTime: 0`.
            */}
            <Stack.Screen name="notifications" options={{ presentation: 'card' }} />
          </Stack.Protected>

          {/*
            `restoring` counts as signed-out here so the stack is never empty;
            the splash above covers those frames.
          */}
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>

          {/*
            Declared after both groups so that when a guard closes, the
            navigator falls back to the group that is still open rather than
            bouncing through the redirect.
          */}
          <Stack.Screen name="index" />

          {/* The design gallery stays reachable at /design in development. */}
          <Stack.Screen name="design" />
        </Stack>
      </ThemeProvider>
    </MeshBackground>
  );
}

export default function RootLayout() {
  // One client for the process. Created in state rather than at module scope so
  // a fast refresh does not leave two caches holding patient data.
  const [queryClient] = useState(createQueryClient);

  /*
    Once for the process, and above every screen: it is what makes the queue's
    30-second poll stop when the phone is pocketed and resume when the driver
    comes back from the dialer or a navigation app. It returns its own
    unsubscribe, which is exactly the cleanup `useEffect` wants.
  */
  useEffect(subscribeAppStateFocus, []);

  return (
    <AppThemeProvider initialMode="dark">
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            {/*
              Inside the session (it holds a socket only while a driver is
              signed in) and above every screen, because `useQueue` reads its
              connected flag to choose a poll interval and the tab bar calls
              that from outside any single page.
            */}
            <RealtimeProvider>
              <Navigation />
            </RealtimeProvider>
          </SessionProvider>
        </QueryClientProvider>
      </LocaleProvider>
    </AppThemeProvider>
  );
}
