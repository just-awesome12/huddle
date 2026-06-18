'use client';

import { useTheme, type ThemePref } from './ThemeProvider';

/**
 * Compact 3-way theme switch (system / light / dark) for the header.
 * Segmented control; the active segment uses the brand fill.
 */
const OPTIONS: { value: ThemePref; label: string; glyph: string }[] = [
  { value: 'system', label: 'System theme', glyph: '◐' },
  { value: 'light', label: 'Light theme', glyph: '☀' },
  { value: 'dark', label: 'Dark theme', glyph: '☾' },
];

export function ThemeToggle() {
  const { pref, setPref } = useTheme();

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2 p-0.5"
      role="group"
      aria-label="Theme"
    >
      {OPTIONS.map((opt) => {
        const active = pref === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPref(opt.value)}
            aria-label={opt.label}
            aria-pressed={active}
            title={opt.label}
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors ${
              active ? 'bg-brand-600 text-white' : 'text-muted hover:text-content'
            }`}
          >
            <span aria-hidden>{opt.glyph}</span>
          </button>
        );
      })}
    </div>
  );
}
