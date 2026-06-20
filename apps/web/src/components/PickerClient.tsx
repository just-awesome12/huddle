'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { IdeaCategory } from '@huddle/validation';
import { runPickerAction } from '@/actions/picker';
import { Button } from './Button';
import { Confetti } from './Confetti';
import { CategoryBadge, CATEGORY_LABELS } from './IdeaBadges';

/** Minimal idea shape the picker needs (on-radar ideas only). */
export interface PickableIdea {
  id: string;
  title: string;
  category: IdeaCategory;
}

const CATEGORY_EMOJI: Record<IdeaCategory, string> = {
  food: '🌮',
  activity: '🎳',
  place: '📍',
  event: '🎬',
  other: '💡',
};

type Phase = 'idle' | 'rolling' | 'done';

/** Minimum spin time so the reveal feels deliberate, not instant. */
const MIN_SPIN_MS = 1400;
const TICK_MS = 90;

export function PickerClient({ groupId, ideas }: { groupId: string; ideas: PickableIdea[] }) {
  const [category, setCategory] = useState<IdeaCategory | ''>('');
  const [useShortlist, setUseShortlist] = useState(false);
  const [fair, setFair] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [phase, setPhase] = useState<Phase>('idle');
  const [spinIdx, setSpinIdx] = useState(0);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [pickCount, setPickCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Candidate pool mirrors what the server will compute: on-radar ideas
  // narrowed by category, then (if enabled) intersected with the shortlist.
  const candidates = useMemo(() => {
    let pool = ideas;
    if (category) pool = pool.filter((i) => i.category === category);
    if (useShortlist && selected.size > 0) {
      pool = pool.filter((i) => selected.has(i.id));
    }
    return pool;
  }, [ideas, category, useShortlist, selected]);

  const canPick = candidates.length >= 2 && phase !== 'rolling';
  const chosen = chosenId ? (ideas.find((i) => i.id === chosenId) ?? null) : null;

  // Ideas eligible for the shortlist (in-category, so the checkboxes stay
  // visible for the whole category even when some are unticked).
  const inCategory = useMemo(
    () => (category ? ideas.filter((i) => i.category === category) : ideas),
    [ideas, category],
  );

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePick() {
    if (!canPick) return;
    setError(null);
    setChosenId(null);
    setPhase('rolling');

    const pool = candidates;
    let i = 0;
    setSpinIdx(0);
    tickRef.current = setInterval(() => {
      i = (i + 1) % pool.length;
      setSpinIdx(i);
    }, TICK_MS);

    const start = Date.now();
    const result = await runPickerAction({
      groupId,
      category: category || null,
      shortlist: useShortlist && selected.size > 0 ? [...selected] : null,
      fair,
    });

    const elapsed = Date.now() - start;
    if (elapsed < MIN_SPIN_MS) {
      await new Promise((r) => setTimeout(r, MIN_SPIN_MS - elapsed));
    }
    if (tickRef.current) clearInterval(tickRef.current);

    if (!result.ok) {
      setPhase('idle');
      setError(
        result.error === 'too_few_candidates'
          ? 'Need at least 2 ideas to pick from. Clear a filter or add more ideas.'
          : result.error === 'forbidden'
            ? "You're not a member of this group."
            : 'Could not run the picker. Please try again.',
      );
      return;
    }

    // Land the reel on the server's chosen idea.
    const landed = pool.findIndex((p) => p.id === result.chosenIdeaId);
    if (landed >= 0) setSpinIdx(landed);
    setChosenId(result.chosenIdeaId);
    setPickCount(pool.length);
    setPhase('done');
  }

  if (ideas.length < 2) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-line px-6 py-8 text-center">
        <p className="text-sm font-semibold text-content">Not enough ideas to pick from yet</p>
        <p className="mt-1 text-sm text-muted">
          Add at least two on-the-radar ideas, then come back to let Huddle choose.
        </p>
        <Link
          href={`/groups/${groupId}/ideas/new`}
          className="mt-4 inline-flex items-center justify-center rounded-full bg-accent-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-900"
        >
          Add an idea
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* Category filter */}
      <div>
        <h3 className="font-display text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted">
          Category
        </h3>
        <div className="mt-2 flex flex-wrap gap-2" data-testid="picker-categories">
          <FilterChip active={category === ''} label="Any" onClick={() => setCategory('')} />
          {(Object.keys(CATEGORY_LABELS) as IdeaCategory[]).map((c) => (
            <FilterChip
              key={c}
              active={category === c}
              label={CATEGORY_LABELS[c]}
              onClick={() => setCategory(c)}
            />
          ))}
        </div>
      </div>

      {/* Toggles: shortlist + fair mode */}
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-content">
          <input
            type="checkbox"
            checked={useShortlist}
            onChange={(e) => setUseShortlist(e.target.checked)}
            className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
            data-testid="picker-shortlist-toggle"
          />
          Choose from a shortlist
        </label>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-content">
            <input
              type="checkbox"
              checked={fair}
              onChange={(e) => setFair(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
              data-testid="picker-fair-toggle"
            />
            Give everyone a fair shot
          </label>
          <p className="mt-1 pl-6 text-xs text-muted">
            Leans toward people whose ideas haven’t been picked yet. Still random — just weighted.
          </p>
        </div>
      </div>

      {/* Shortlist selection (only when the toggle is on). */}
      {useShortlist && (
        <div>
          <p className="text-xs text-muted">
            Tick the ideas to include. Leave all unticked to use every idea in the category.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {inCategory.map((idea) => (
              <li key={idea.id}>
                <label className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-content">
                  <input
                    type="checkbox"
                    checked={selected.has(idea.id)}
                    onChange={() => toggleSelected(idea.id)}
                    className="h-4 w-4 shrink-0 rounded border-line text-brand-600 focus:ring-brand-500"
                    aria-label={`Include ${idea.title}`}
                  />
                  <span className="text-base leading-none" aria-hidden>
                    {CATEGORY_EMOJI[idea.category]}
                  </span>
                  <span className="truncate font-medium">{idea.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The reel — a slot-machine strip that settles on the winner. */}
      <Reel pool={candidates} spinIdx={spinIdx} phase={phase} data-testid="picker-candidates" />

      {error && (
        <p
          className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
          data-testid="picker-error"
        >
          {error}
        </p>
      )}

      {/* Result footer — provenance + link to the chosen idea. */}
      {phase === 'done' && chosen && (
        <div className="relative text-center" data-testid="picker-result">
          <Confetti />
          {pickCount !== null && (
            <p className="text-[13px] text-muted" data-testid="picker-provenance">
              Chosen at random from {pickCount} option{pickCount === 1 ? '' : 's'}
            </p>
          )}
          <Link
            href={`/groups/${groupId}/ideas/${chosen.id}`}
            className="mt-1 inline-flex items-center gap-1 font-display text-sm font-bold text-accent-600 hover:underline"
          >
            View idea →
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          onClick={handlePick}
          loading={phase === 'rolling'}
          disabled={!canPick}
          data-testid="picker-run"
        >
          {phase === 'done'
            ? '↻ Spin again'
            : phase === 'rolling'
              ? 'Spinning…'
              : '🎲 Spin the picker'}
        </Button>
        <Link
          href={`/groups/${groupId}/history`}
          className="font-display text-sm font-bold text-muted hover:text-brand-ink"
        >
          View history →
        </Link>
      </div>
    </div>
  );
}

/**
 * Slot-machine reel: three rows (prev / current / next) where the centre
 * scales up, and on landing turns accent-pink with a check. The centre
 * title carries the result testid once landed.
 */
function Reel({
  pool,
  spinIdx,
  phase,
  'data-testid': testId,
}: {
  pool: PickableIdea[];
  spinIdx: number;
  phase: Phase;
  'data-testid': string;
}) {
  const n = pool.length;

  if (n === 0) {
    return (
      <div
        className="rounded-2xl bg-surface-2 px-6 py-10 text-center text-sm text-muted"
        data-testid={testId}
      >
        No ideas match this filter.
      </div>
    );
  }

  const ai = ((spinIdx % n) + n) % n;
  const rows: { idea: PickableIdea; center: boolean }[] = [
    { idea: pool[(ai - 1 + n) % n]!, center: false },
    { idea: pool[ai]!, center: true },
    { idea: pool[(ai + 1) % n]!, center: false },
  ];
  const landed = phase === 'done';

  return (
    <div className="overflow-hidden rounded-2xl bg-surface-2 px-3 py-3" data-testid={testId}>
      <div className="flex flex-col gap-1">
        {rows.map(({ idea, center }, i) => {
          const isLanded = center && landed;
          return (
            <div
              key={`${i}-${idea.id}`}
              className={`flex items-center gap-3 rounded-2xl transition-all duration-150 ${
                center ? 'px-4 py-4' : 'px-4 py-2'
              } ${
                isLanded
                  ? 'bg-accent-400 text-white shadow-[0_18px_34px_-14px_rgba(212,83,126,0.7)]'
                  : center
                    ? 'bg-surface text-content shadow-sm'
                    : 'text-content'
              }`}
              style={{ transform: center ? 'scale(1)' : 'scale(0.9)' }}
            >
              <span
                className={`${center ? 'text-3xl' : 'text-xl opacity-50'} leading-none`}
                aria-hidden
              >
                {CATEGORY_EMOJI[idea.category]}
              </span>
              <span
                className={`min-w-0 flex-1 truncate font-display ${
                  center ? 'text-[20px] font-extrabold' : 'text-[14px] font-bold'
                }`}
                data-testid={isLanded ? 'picker-result-title' : undefined}
              >
                {idea.title}
              </span>
              {center && !landed && <CategoryBadge category={idea.category} />}
              {isLanded && (
                <span className="ml-auto text-2xl" aria-hidden>
                  ✓
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 font-display text-xs font-bold transition-colors ${
        active ? 'bg-brand-600 text-white' : 'bg-surface-2 text-muted hover:bg-line'
      }`}
    >
      {label}
    </button>
  );
}
