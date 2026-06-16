import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { darkColors, lightColors, type ThemeColors } from '@/lib/theme';

export type { ThemeColors } from '@/lib/theme';

/**
 * Theme: light / dark / system, persisted. Mirrors the web provider.
 * SecureStore on native, localStorage on web (SecureStore is native-
 * only — lesson 3). useColorScheme() supplies the OS setting for
 * 'system'. Until the stored pref loads we default to 'system'.
 */

export type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'huddle-theme';

async function readPref(): Promise<ThemePref | null> {
  try {
    const v =
      Platform.OS === 'web'
        ? (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null)
        : await SecureStore.getItemAsync(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : null;
  } catch {
    return null;
  }
}

async function writePref(p: ThemePref): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, p);
    } else {
      await SecureStore.setItemAsync(STORAGE_KEY, p);
    }
  } catch {
    // Non-fatal: the choice just won't persist across launches.
  }
}

interface ThemeContextValue {
  colors: ThemeColors;
  dark: boolean;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('system');

  useEffect(() => {
    let active = true;
    void readPref().then((p) => {
      if (active && p) setPrefState(p);
    });
    return () => {
      active = false;
    };
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    void writePref(p);
  };

  const dark = pref === 'dark' || (pref === 'system' && system === 'dark');

  const value = useMemo<ThemeContextValue>(
    () => ({ colors: dark ? darkColors : lightColors, dark, pref, setPref }),
    [dark, pref],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeCtx(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/** Active palette (flips with light/dark). */
export function useColors(): ThemeColors {
  return useThemeCtx().colors;
}

/** Full theme controls for the toggle. */
export function useTheme(): ThemeContextValue {
  return useThemeCtx();
}
