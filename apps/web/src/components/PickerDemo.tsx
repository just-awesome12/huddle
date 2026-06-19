'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The Huddle picker, dramatized — a self-contained marketing animation
 * used twice in the onboarding redesign: full size on the landing hero
 * (a 3-row slot machine) and compact in the split-screen auth panel (a
 * single spotlight chip). It spins through an idea pool, eases to a stop,
 * lands on a choice, bursts confetti, pauses, and repeats.
 *
 * Pure local state — no app data. Honours prefers-reduced-motion and a
 * `paused` prop: the loop stops and a single result is shown statically.
 */

interface Idea {
  emoji: string;
  label: string;
}

const IDEAS: Idea[] = [
  { emoji: '🌮', label: 'Taco Tuesday' },
  { emoji: '🥾', label: 'Sunset hike' },
  { emoji: '🎬', label: 'Movie night' },
  { emoji: '🎳', label: 'Bowling league' },
  { emoji: '☕', label: 'Coffee crawl' },
  { emoji: '🍜', label: 'Ramen run' },
];

const CONFETTI_COLORS = [
  'var(--color-accent-400)',
  'var(--color-brand-500)',
  'var(--color-accent-100)',
  'var(--color-brand-300)',
  '#ffffff',
];

interface PickerDemoProps {
  variant: 'hero' | 'compact';
  /** Force a static, landed state (also implied by reduced motion). */
  paused?: boolean;
}

export function PickerDemo({ variant, paused = false }: PickerDemoProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [landed, setLanded] = useState(false);
  const [landKey, setLandKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dead = useRef(false);

  // Confetti pieces: generated once, replayed by re-keying on each land.
  const confetti = useMemo(
    () =>
      Array.from({ length: 20 }, () => ({
        left: Math.random() * 100,
        bg: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        delay: Math.random() * 0.25,
        dur: 0.9 + Math.random() * 0.7,
        size: 6 + Math.random() * 7,
        drift: (Math.random() * 2 - 1) * 70,
      })),
    [],
  );

  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const spin = useCallback(() => {
    if (dead.current) return;
    if (timer.current) clearTimeout(timer.current);
    setLanded(false);
    let ticks = 0;
    const total = 20 + Math.floor(Math.random() * 7);
    const step = () => {
      if (dead.current) return;
      ticks += 1;
      setActiveIndex((i) => (i + 1) % IDEAS.length);
      if (ticks < total) {
        const p = ticks / total;
        timer.current = setTimeout(step, 55 + p * p * 300);
      } else {
        setLanded(true);
        setLandKey((k) => k + 1);
        timer.current = setTimeout(spin, 2800);
      }
    };
    timer.current = setTimeout(step, 80);
  }, []);

  useEffect(() => {
    dead.current = false;
    if (paused || reducedMotion) {
      setLanded(true);
      return () => {
        dead.current = true;
        if (timer.current) clearTimeout(timer.current);
      };
    }
    spin();
    return () => {
      dead.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [paused, reducedMotion, spin]);

  const n = IDEAS.length;
  const cur = IDEAS[activeIndex]!;

  const confettiLayer =
    landed && !paused && !reducedMotion ? (
      <div
        key={`cf-${landKey}`}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[300px] overflow-hidden"
      >
        {confetti.map((c, i) => (
          <span
            key={i}
            className="absolute top-[-14px] block rounded-[2px]"
            style={{
              left: `${c.left}%`,
              width: `${c.size}px`,
              height: `${c.size * 0.55}px`,
              background: c.bg,
              ['--drift' as string]: `${c.drift}px`,
              animation: `hud-confetti ${c.dur}s ${c.delay}s ease-in forwards`,
            }}
          />
        ))}
      </div>
    ) : null;

  // -------------------------------------------------------------------
  // Compact variant — single spotlight chip (auth panel).
  // -------------------------------------------------------------------
  if (variant === 'compact') {
    return (
      <div className="relative inline-block" data-testid="picker-demo">
        <div
          className={`inline-flex min-w-[270px] items-center gap-4 rounded-[18px] border border-white/20 px-6 py-[18px] transition-all duration-200 ${
            landed ? 'bg-surface text-brand-ink shadow-2xl' : 'bg-white/10 text-white'
          }`}
        >
          <span className="text-[36px] leading-none">{cur.emoji}</span>
          <span className="flex flex-col">
            <span className="font-sans text-[11px] uppercase tracking-[0.14em] opacity-70">
              {landed ? 'Locked in' : 'Spinning…'}
            </span>
            <span className="whitespace-nowrap font-display text-[22px] font-extrabold">
              {cur.label}
            </span>
          </span>
          {landed ? <span className="ml-auto text-[24px]">🎉</span> : null}
        </div>
        {confettiLayer}
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Hero variant — the full "live picker" card (header + 3-row slot +
  // spin-again + caption), used in the landing hero.
  // -------------------------------------------------------------------
  const rows = [
    { idea: IDEAS[(activeIndex - 1 + n) % n]!, center: false },
    { idea: cur, center: true },
    { idea: IDEAS[(activeIndex + 1) % n]!, center: false },
  ];

  return (
    <div
      className="relative rounded-[28px] border border-white/50 bg-surface p-6"
      style={{ boxShadow: '0 50px 90px -34px rgba(20,16,52,.8)' }}
      data-testid="picker-demo"
    >
      <div className="mb-[18px] flex items-center gap-[10px]">
        <span
          className="h-[9px] w-[9px] rounded-full bg-online"
          style={{ animation: 'hud-pulse 1.8s ease-in-out infinite' }}
        />
        <span className="font-display text-[15px] font-extrabold text-brand-ink">
          Friday night · 6 in
        </span>
        <span className="ml-auto rounded-full bg-accent-50 px-[10px] py-1 text-xs font-bold text-accent-600">
          PICKER
        </span>
      </div>

      <div className="relative">
        {rows.map(({ idea, center }, i) => (
          <div
            key={i}
            className={`flex items-center gap-[13px] rounded-[16px] transition-all duration-150 ${
              center ? 'px-[18px] py-4' : 'scale-90 px-[18px] py-[9px] opacity-30'
            } ${
              center && landed
                ? 'bg-accent-400 text-white'
                : center
                  ? 'bg-surface-2 text-content'
                  : 'bg-transparent text-content'
            }`}
            style={
              center && landed
                ? { boxShadow: '0 18px 34px -14px var(--color-accent-400)' }
                : undefined
            }
          >
            <span className={center ? 'text-[32px] leading-none' : 'text-[22px] leading-none'}>
              {idea.emoji}
            </span>
            <span
              className={`whitespace-nowrap font-display font-extrabold ${
                center ? 'text-[22px]' : 'text-[17px]'
              }`}
            >
              {idea.label}
            </span>
            {center && landed ? <span className="ml-auto text-[22px]">✓</span> : null}
          </div>
        ))}
        {confettiLayer}
      </div>

      <div className="mt-[18px]">
        <button
          type="button"
          onClick={spin}
          className="w-full rounded-[14px] bg-brand-900 py-[13px] font-display text-[15px] font-extrabold text-white transition-colors hover:bg-brand-800"
        >
          ↻ Spin again
        </button>
      </div>
      <p className="mx-[2px] mt-[14px] text-center text-[12.5px] text-faint">
        Fair, random, and logged forever — no take-backs 😏
      </p>
    </div>
  );
}
