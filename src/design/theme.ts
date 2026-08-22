import { createContext, useContext } from 'react';

/**
 * Two themes, one shape.
 *
 * Night is the working default — the environment is a vehicle, often after dark
 * (PRD §7). Day exists because that same vehicle sits in full sun, where a dark
 * screen behind a windshield reflection is unreadable, and because a driver
 * starting a 9am run should not be handed a night interface.
 *
 * The two are not inversions of each other. Night is glass over a coloured mesh
 * — translucent navy surfaces, cyan accent, light rims catching the glow. Day is
 * glass over paper — near-opaque white surfaces that lift off a pale mint field
 * with a soft shadow, and a deep teal accent, because the night cyan sits at
 * about 1.6:1 on white and would fail every contrast rule we set.
 *
 * Colour lives here and nowhere else. `tokens.ts` keeps only what does not
 * change between themes: spacing, radii, type scale, tap targets.
 */

export type ThemeName = 'dark' | 'light';

/** One glass surface recipe: blurred backdrop, fill, rim, and lit edge. */
export type GlassRecipe = {
  blur: number;
  fill: string;
  border: string;
  /** The brighter arc along the top rim. Transparent where it would be noise. */
  edge: string;
};

export type Theme = {
  name: ThemeName;
  backdrop: {
    base: string;
    deep: string;
    blobCyan: string;
    blobIndigo: string;
    blobViolet: string;
    blobTeal: string;
    /** Opacity applied to every mesh blob. Day needs a far lighter hand. */
    blobOpacity: number;
    /** Vignette stops, top to bottom. */
    vignette: [string, string, string];
  };
  palette: {
    accent: string;
    accentBright: string;
    accentDim: string;
    onAccent: string;
    money: string;
    cooler: string;
    danger: string;
    success: string;
    caution: string;
  };
  ink: {
    primary: string;
    secondary: string;
    tertiary: string;
    inverse: string;
  };
  glass: {
    row: GlassRecipe;
    raised: GlassRecipe;
    chrome: GlassRecipe;
    active: GlassRecipe;
  };
  tint: {
    danger: { fill: string; border: string };
    money: { fill: string; border: string };
    cooler: { fill: string; border: string };
    caution: { fill: string; border: string };
    accent: { fill: string; border: string };
    neutral: { fill: string; border: string };
  };
  /**
   * Delivery-window chips are solid, not tinted: the window is the single most
   * scanned thing on a card, and each theme fills it the way that reads fastest
   * against its own field.
   */
  windowChip: {
    AM: { fill: string; text: string };
    PM: { fill: string; text: string };
  };
  /**
   * Card lift. Night has none — a shadow under a translucent panel on a dark
   * field is invisible work. Day depends on it: white on near-white only reads
   * as a card because it casts.
   */
  shadow: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
  /** Feeds `BlurView.tint` and the status bar. */
  scheme: 'dark' | 'light';
};

export type GlassLevel = keyof Theme['glass'];
export type TintName = keyof Theme['tint'];

export const DARK_THEME: Theme = {
  name: 'dark',
  scheme: 'dark',
  backdrop: {
    base: '#060912',
    deep: '#0C1226',
    blobCyan: '#22D3EE',
    blobIndigo: '#4F46E5',
    blobViolet: '#7C3AED',
    blobTeal: '#0D9488',
    blobOpacity: 1,
    vignette: ['rgba(6,9,18,0.55)', 'rgba(6,9,18,0)', 'rgba(6,9,18,0.75)'],
  },
  palette: {
    accent: '#7FD7EC',
    accentBright: '#A8E8F7',
    accentDim: '#4BA3BA',
    onAccent: '#04121A',
    money: '#5BE49B',
    cooler: '#FFA24C',
    danger: '#FF6072',
    success: '#34D399',
    caution: '#FFC864',
  },
  ink: {
    primary: '#F4F8FB',
    secondary: '#A7B6CC',
    tertiary: '#7D8EA6',
    inverse: '#04121A',
  },
  glass: {
    row: {
      blur: 24,
      fill: 'rgba(14,21,40,0.62)',
      border: 'rgba(255,255,255,0.09)',
      edge: 'rgba(255,255,255,0.15)',
    },
    raised: {
      blur: 40,
      fill: 'rgba(16,25,48,0.74)',
      border: 'rgba(255,255,255,0.13)',
      edge: 'rgba(255,255,255,0.22)',
    },
    chrome: {
      blur: 60,
      fill: 'rgba(9,14,30,0.86)',
      border: 'rgba(255,255,255,0.11)',
      edge: 'rgba(255,255,255,0.18)',
    },
    active: {
      blur: 40,
      fill: 'rgba(18,58,76,0.78)',
      border: 'rgba(127,215,236,0.46)',
      edge: 'rgba(168,232,247,0.55)',
    },
  },
  tint: {
    danger: { fill: 'rgba(58,17,26,0.78)', border: 'rgba(255,96,114,0.42)' },
    money: { fill: 'rgba(13,46,33,0.74)', border: 'rgba(91,228,155,0.38)' },
    cooler: { fill: 'rgba(56,34,13,0.74)', border: 'rgba(255,162,76,0.38)' },
    caution: { fill: 'rgba(52,40,13,0.72)', border: 'rgba(255,200,100,0.36)' },
    accent: { fill: 'rgba(15,52,68,0.74)', border: 'rgba(127,215,236,0.40)' },
    neutral: { fill: 'rgba(22,31,52,0.66)', border: 'rgba(255,255,255,0.10)' },
  },
  windowChip: {
    AM: { fill: 'rgba(127,215,236,0.20)', text: '#A8E8F7' },
    PM: { fill: 'rgba(255,255,255,0.08)', text: '#A7B6CC' },
  },
  shadow: {
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
};

export const LIGHT_THEME: Theme = {
  name: 'light',
  scheme: 'light',
  backdrop: {
    base: '#F4FAF8',
    deep: '#E4F2EE',
    blobCyan: '#5EEAD4',
    blobIndigo: '#A5C9F5',
    blobViolet: '#C7E3DB',
    blobTeal: '#7FD9C4',
    /** The mesh is a whisper here; any more and text contrast starts drifting. */
    blobOpacity: 0.32,
    vignette: ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.1)', 'rgba(228,242,238,0.5)'],
  },
  palette: {
    /** Deep teal. The night cyan is ~1.6:1 on white — unusable as an accent. */
    accent: '#0E4D4D',
    accentBright: '#0B3B3B',
    accentDim: '#5C8A87',
    onAccent: '#FFFFFF',
    money: '#046C53',
    cooler: '#A45309',
    danger: '#B3261E',
    success: '#046C53',
    caution: '#A45309',
  },
  ink: {
    primary: '#0B1F1E',
    secondary: '#44605E',
    tertiary: '#6B7F7D',
    inverse: '#FFFFFF',
  },
  glass: {
    row: {
      blur: 20,
      fill: 'rgba(255,255,255,0.93)',
      border: 'rgba(11,31,30,0.07)',
      edge: 'rgba(255,255,255,0.9)',
    },
    raised: {
      blur: 30,
      fill: 'rgba(255,255,255,0.97)',
      border: 'rgba(11,31,30,0.09)',
      edge: 'rgba(255,255,255,1)',
    },
    chrome: {
      blur: 50,
      fill: 'rgba(255,255,255,0.95)',
      border: 'rgba(11,31,30,0.08)',
      edge: 'rgba(255,255,255,1)',
    },
    active: {
      blur: 30,
      fill: 'rgba(14,77,77,0.10)',
      border: 'rgba(14,77,77,0.45)',
      edge: 'rgba(255,255,255,0.8)',
    },
  },
  tint: {
    danger: { fill: 'rgba(179,38,30,0.09)', border: 'rgba(179,38,30,0.28)' },
    money: { fill: 'rgba(4,108,83,0.10)', border: 'rgba(4,108,83,0.26)' },
    cooler: { fill: 'rgba(164,83,9,0.10)', border: 'rgba(164,83,9,0.26)' },
    caution: { fill: 'rgba(164,83,9,0.10)', border: 'rgba(164,83,9,0.26)' },
    accent: { fill: 'rgba(14,77,77,0.09)', border: 'rgba(14,77,77,0.26)' },
    neutral: { fill: 'rgba(11,31,30,0.055)', border: 'rgba(11,31,30,0.08)' },
  },
  windowChip: {
    AM: { fill: '#0E4D4D', text: '#FFFFFF' },
    PM: { fill: '#F5A63F', text: '#3B2506' },
  },
  shadow: {
    shadowColor: '#0B1F1E',
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
};

export const THEMES: Record<ThemeName, Theme> = {
  dark: DARK_THEME,
  light: LIGHT_THEME,
};

type ThemeContextValue = {
  theme: Theme;
  mode: ThemeName;
  setMode: (mode: ThemeName) => void;
  toggle: () => void;
};

export const ThemeContext = createContext<ThemeContextValue>({
  theme: DARK_THEME,
  mode: 'dark',
  setMode: () => {},
  toggle: () => {},
});

/** Colours for the current theme. Every component reads them from here. */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/** The driver's choice, for the settings control that changes it. */
export function useThemeMode(): Omit<ThemeContextValue, 'theme'> {
  const { mode, setMode, toggle } = useContext(ThemeContext);
  return { mode, setMode, toggle };
}
