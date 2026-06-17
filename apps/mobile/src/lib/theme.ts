/**
 * Huddle palette — "Pop" direction (OQ-4) with light + dark modes.
 * Brand violet / accent pink stay constant across modes; the neutral
 * surfaces/text/border flip. Mirrors the web semantic tokens.
 *
 * Components read the active palette via useColors() (see
 * src/context/ThemeContext). `colors` is the light alias, kept so any
 * not-yet-themed code still compiles and renders light.
 */

const brand = {
  50: '#eeedfe',
  100: '#cecbf6',
  200: '#afa9ec',
  300: '#9a92e6',
  400: '#7f77dd',
  600: '#534ab7',
  700: '#473e9f',
  800: '#3c3489',
  900: '#26215c',
} as const;

const accent = {
  50: '#fbeaf0',
  400: '#d4537e',
  600: '#993556',
} as const;

export const lightColors = {
  brand,
  accent,
  canvas: '#f7f6fd',
  surface: '#ffffff',
  surface2: '#f1f0fb',
  text: '#0f172a',
  muted: '#5b5b73',
  faint: '#94a3b8',
  border: '#e6e3f5',
  brandInk: '#473e9f',
  // Brand-tinted surface (e.g. the picker's chosen/result card). Mirrors
  // web's bg-brand-50 / dark:bg-brand-900.
  brandBg: '#eeedfe',
  white: '#ffffff',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerText: '#b91c1c',
};

export const darkColors: typeof lightColors = {
  brand,
  accent,
  canvas: '#0d0d18',
  surface: '#17172a',
  surface2: '#21213a',
  text: '#ececf5',
  muted: '#a6a6bd',
  faint: '#6f6f88',
  border: '#2e2e48',
  brandInk: '#afa9ec',
  brandBg: '#26215c',
  white: '#ffffff',
  danger: '#ef4444',
  dangerBg: '#3a1d24',
  dangerText: '#fca5a5',
};

export type ThemeColors = typeof lightColors;

/** Light alias for code paths not yet wired to useColors(). */
export const colors = lightColors;
