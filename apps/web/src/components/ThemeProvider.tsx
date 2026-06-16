'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/**
 * Theme: light / dark / system, persisted in localStorage. The no-flash
 * script in the root layout applies the initial class before paint;
 * this provider owns runtime changes and keeps the <html> class in sync
 * (including reacting to OS changes while in 'system' mode).
 */

export type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'huddle-theme';

interface ThemeContextValue {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function applyClass(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('system');

  // Hydrate from storage on mount (the no-flash script already set the
  // class; this syncs React state to it).
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePref | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setPrefState(stored);
    }
  }, []);

  // Re-apply when in system mode and the OS preference changes.
  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyClass('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    localStorage.setItem(STORAGE_KEY, p);
    applyClass(p);
  }, []);

  return (
    <ThemeContext.Provider value={{ pref, setPref }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
