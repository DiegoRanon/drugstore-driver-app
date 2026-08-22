import { useCallback, useMemo, useState, type PropsWithChildren } from 'react';

import { THEMES, ThemeContext, type ThemeName } from '@/design/theme';

/**
 * Holds the driver's night/day choice for the session.
 *
 * Not persisted yet, deliberately: the app has no on-device preference store
 * until the session work lands (the locale override needs the same one, PRD
 * §5.11), and adding a storage dependency for one boolean now would be the
 * wrong shape. When that store exists, this provider reads its initial mode
 * from it and writes on change — nothing else moves.
 */
export function AppThemeProvider({
  initialMode = 'dark',
  children,
}: PropsWithChildren<{ initialMode?: ThemeName }>) {
  const [mode, setMode] = useState<ThemeName>(initialMode);

  const toggle = useCallback(() => {
    setMode((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({ theme: THEMES[mode], mode, setMode, toggle }),
    [mode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
