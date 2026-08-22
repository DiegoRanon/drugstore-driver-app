import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';

import { MeshBackground } from '@/components/glass/mesh-background';
import { AppThemeProvider } from '@/design/theme-provider';
import { useTheme } from '@/design/theme';

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

  return (
    <MeshBackground>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
            animation: 'fade',
          }}
        />
      </ThemeProvider>
    </MeshBackground>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider initialMode="dark">
      <Navigation />
    </AppThemeProvider>
  );
}
