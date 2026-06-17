'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import type { IdeaCategory } from '@huddle/validation';
import { runPickerAction } from '@/actions/decisions';
import { EMPTY_PICKER_STATE } from '@/actions/decisions-state';
import { CATEGORY_LABELS, CategoryBadge } from './IdeaBadges';
import { Button } from './Button';

export interface PickerCandidate {
  id: string;
  title: string;
  category: IdeaCategory;
}

interface PickerPanelProps {
  groupId: string;
  /** All on_radar ideas in the group — the pool the picker draws from. */
  candidates: PickerCandidate[];
}

const selectClasses =
  'rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1';

/**
 * Picker controls + animated reveal. Options (category filter, optional
 * shortlist) post to runPickerAction; while the action is pending we run
 * a short "drumroll" cycling candidate titles, then reveal the winner
 * with a pop. The server is the authority on the outcome — the animation
 * is pure UX over whatever it returns.
 */
export function PickerPanel({ groupId, candidates }: PickerPanelProps) {
  const [state, formAction, pending] = useActionState(
    runPickerAction,
    EMPTY_PICKER_STATE,
  );

  const [category, setCategory] = useState<IdeaCategory | ''>('');
  const [useShortlist, setUseShortlist] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rollTitle, setRollTitle] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  // Candidates available given the current category filter.
  const visible = candidates.filter((c) => !category || c.category === category);
  const shortlistCount = visible.filter((c) => picked.has(c.id)).length;
  const shortlistInvalid = useShortlist && shortlistCount === 0;

  // Drumroll while the pick is in flight.
  useEffect(() => {
    if (!pending) {
      setRollTitle(null);
      return;
    }
    const pool = useShortlist
      ? visible.filter((c) => picked.has(c.id))
      : visible;
    if (pool.length === 0) return;
    let i = Math.floor(Math.random() * pool.length);
    setRollTitle(pool[i]!.title);
    const interval = setInterval(() => {
      i = (i + 1) % pool.length;
      setRollTitle(pool[i]!.title);
    }, 90);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // Trigger the reveal transition once a pick lands.
  useEffect(() => {
    if (state.status === 'picked') {
      setRevealed(false);
      const t = setTimeout(() => setRevealed(true), 20);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Reveal / status area */}
      <div
        aria-live="polite"
        className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-line bg-surface-2 px-6 py-8 text-center"
      >
        {pending ? (
          <>
            <span className="text-3xl" aria-hidden>
              🎲
            </span>
            <p className="mt-2 animate-pulse text-lg font-medium text-content">
              {rollTitle ?? 'Shuffling…'}
            </p>
          </>
        ) : state.status === 'picked' ? (
          <div
            className={`flex flex-col items-center transition-all duration-500 ${
              revealed ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
            }`}
          >
            <span className="text-3xl" aria-hidden>
              🎉
            </span>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">
              The pick is
            </p>
            <p className="mt-1 text-2xl font-semibold text-content" data-testid="picker-result">
              {state.chosen.title}
            </p>
            <div className="mt-2">
              <CategoryBadge category={state.chosen.category} />
            </div>
            <Link
              href={`/groups/${groupId}/ideas/${state.chosen.id}`}
              className="mt-3 text-sm font-medium text-brand-ink hover:underline"
            >
              Open this idea &rarr;
            </Link>
          </div>
        ) : state.status === 'no_candidates' ? (
          <p className="text-sm text-muted" data-testid="picker-empty">
            Nothing on the radar matched those options. Add an idea or widen
            the filter.
          </p>
        ) : state.status === 'error' ? (
          <p className="text-sm text-red-700" role="alert">
            {state.message}
          </p>
        ) : (
          <p className="text-sm text-muted">
            Can&apos;t agree? Let Huddle pick one for you.
          </p>
        )}
      </div>

      {/* Options + run */}
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="groupId" value={groupId} />

        <div className="flex flex-col gap-1">
          <label htmlFor="picker-category" className="text-sm font-medium text-content">
            Category
          </label>
          <select
            id="picker-category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as IdeaCategory | '')}
            className={selectClasses}
          >
            <option value="">Any category</option>
            {(Object.keys(CATEGORY_LABELS) as IdeaCategory[]).map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm font-medium text-content">
            <input
              type="checkbox"
              checked={useShortlist}
              onChange={(e) => setUseShortlist(e.target.checked)}
            />
            Only pick from a shortlist
          </label>

          {useShortlist && (
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-line bg-surface p-2">
              {visible.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted">
                  No ideas in this category to shortlist.
                </p>
              ) : (
                visible.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 rounded px-1 py-1 text-sm text-content hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      name="shortlist"
                      value={c.id}
                      checked={picked.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    <span className="truncate">{c.title}</span>
                  </label>
                ))
              )}
            </div>
          )}
          {shortlistInvalid && (
            <p className="text-xs text-amber-700" role="alert">
              Select at least one idea, or turn off the shortlist.
            </p>
          )}
        </div>

        <div>
          <Button type="submit" loading={pending} disabled={shortlistInvalid}>
            Pick for us
          </Button>
        </div>
      </form>
    </div>
  );
}
