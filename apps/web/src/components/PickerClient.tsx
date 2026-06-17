'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { IdeaCategory } from '@huddle/validation';
import { runPickerAction } from '@/actions/picker';
import { Button } from './Button';
import { CategoryBadge, CATEGORY_LABELS } from './IdeaBadges';

/** Minimal idea shape the picker needs (on-radar ideas only). */
export interface PickableIdea {
  id: string;
  title: string;
  category: IdeaCategory;
}

type Phase = 'idle' | 'rolling' | 'done';

/** Minimum spin time so the reveal feels deliberate, not instant. */
const MIN_SPIN_MS = 1400;
const TICK_MS = 90;

export function PickerClient({
  groupId,
  ideas,
}: {
  groupId: string;
  ideas: PickableIdea[];
}) {
  const [category, setCategory] = useState<IdeaCategory | ''>('');
  const [useShortlist, setUseShortlist] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [phase, setPhase] = useState<Phase>('idle');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
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
  const chosen = chosenId ? ideas.find((i) => i.id === chosenId) ?? null : null;

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
    setHighlightId(pool[0]?.id ?? null);
    tickRef.current = setInterval(() => {
      i = (i + 1) % pool.length;
      setHighlightId(pool[i]?.id ?? null);
    }, TICK_MS);

    const start = Date.now();
    const result = await runPickerAction({
      groupId,
      category: category || null,
      shortlist: useShortlist && selected.size > 0 ? [...selected] : null,
    });

    const elapsed = Date.now() - start;
    if (elapsed < MIN_SPIN_MS) {
      await new Promise((r) => setTimeout(r, MIN_SPIN_MS - elapsed));
    }
    if (tickRef.current) clearInterval(tickRef.current);

    if (!result.ok) {
      setPhase('idle');
      setHighlightId(null);
      setError(
        result.error === 'too_few_candidates'
          ? 'Need at least 2 ideas to pick from. Clear a filter or add more ideas.'
          : result.error === 'forbidden'
            ? "You're not a member of this group."
            : 'Could not run the picker. Please try again.',
      );
      return;
    }

    setHighlightId(result.chosenIdeaId);
    setChosenId(result.chosenIdeaId);
    setPhase('done');
  }

  if (ideas.length < 2) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-line px-6 py-8 text-center">
        <p className="text-sm font-medium text-content">
          Not enough ideas to pick from yet
        </p>
        <p className="mt-1 text-sm text-muted">
          Add at least two on-the-radar ideas, then come back to let Huddle choose.
        </p>
        <Link
          href={`/groups/${groupId}/ideas/new`}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
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
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Category
        </h3>
        <div className="mt-2 flex flex-wrap gap-2" data-testid="picker-categories">
          <FilterChip
            active={category === ''}
            label="Any"
            onClick={() => setCategory('')}
          />
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

      {/* Shortlist toggle */}
      <div>
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
        {useShortlist && (
          <p className="mt-1 text-xs text-muted">
            Tick the ideas to include. Leave all unticked to use every idea in
            the category.
          </p>
        )}
      </div>

      {/* Candidate list (with shortlist checkboxes + spin highlight) */}
      <ul className="flex flex-col gap-2" data-testid="picker-candidates">
        {pickableForDisplay(ideas, category).map((idea) => {
          const inPool = candidates.some((c) => c.id === idea.id);
          const isHighlight = highlightId === idea.id;
          const isChosen = phase === 'done' && chosenId === idea.id;
          return (
            <li key={idea.id}>
              <div
                className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-all ${
                  isChosen
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900'
                    : isHighlight
                      ? 'border-brand-400 bg-surface-2'
                      : 'border-line bg-surface'
                } ${!inPool ? 'opacity-40' : ''}`}
                data-testid={`picker-candidate-${idea.id}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {useShortlist && (
                    <input
                      type="checkbox"
                      checked={selected.has(idea.id)}
                      onChange={() => toggleSelected(idea.id)}
                      className="h-4 w-4 shrink-0 rounded border-line text-brand-600 focus:ring-brand-500"
                      aria-label={`Include ${idea.title}`}
                    />
                  )}
                  <span className="truncate text-sm font-medium text-content">
                    {idea.title}
                  </span>
                </div>
                <CategoryBadge category={idea.category} />
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
          data-testid="picker-error"
        >
          {error}
        </p>
      )}

      {/* Result */}
      {phase === 'done' && (
        <div
          className="rounded-lg border border-brand-500 bg-brand-50 p-5 text-center dark:bg-brand-900"
          data-testid="picker-result"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">
            The pick is
          </p>
          <p className="mt-1 text-lg font-semibold text-content" data-testid="picker-result-title">
            {chosen ? chosen.title : 'an idea'}
          </p>
          {chosen && (
            <Link
              href={`/groups/${groupId}/ideas/${chosen.id}`}
              className="mt-2 inline-block text-sm font-medium text-brand-ink hover:underline"
            >
              View idea →
            </Link>
          )}
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
          {phase === 'done' ? 'Pick again' : 'Pick for us'}
        </Button>
        <Link
          href={`/groups/${groupId}/history`}
          className="text-sm font-medium text-muted hover:text-brand-ink"
        >
          View history →
        </Link>
      </div>
    </div>
  );
}

/** Ideas shown in the candidate list — narrowed only by category so the
 *  shortlist checkboxes stay visible for the whole category. */
function pickableForDisplay(
  ideas: PickableIdea[],
  category: IdeaCategory | '',
): PickableIdea[] {
  return category ? ideas.filter((i) => i.category === category) : ideas;
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
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-brand-600 text-white' : 'bg-surface-2 text-muted hover:bg-line'
      }`}
    >
      {label}
    </button>
  );
}
