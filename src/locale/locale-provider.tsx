/**
 * Which language the app speaks, and the strings for it.
 *
 * French is the default with no negotiation: these are Quebec pharmacies, and
 * an English-first first launch is wrong more often than it is right
 * (PRD §5.11).
 *
 * Feature 4 replaces the body of this provider with i18next + expo-localization
 * and seeds the initial value from `/v1/auth/me` → `organization.locale`, with
 * the driver's override persisted on-device. Because every screen reads through
 * `useStrings()`, that change lands here and nowhere else.
 */
import { createContext, useContext, useMemo, useState } from 'react';

import { STRINGS, type Locale, type Strings } from './strings';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: Strings;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = 'fr',
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: STRINGS[locale] }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside a LocaleProvider');
  return value;
}

/** The current language and the setter behind the FR/EN toggle. */
export function useLocale(): Pick<LocaleContextValue, 'locale' | 'setLocale'> {
  const { locale, setLocale } = useLocaleContext();
  return { locale, setLocale };
}

/** The strings for the current language. */
export function useStrings(): Strings {
  return useLocaleContext().t;
}
