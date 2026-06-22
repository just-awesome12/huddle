'use client';

import { useState, useTransition } from 'react';
import { setLiteModeAction } from '@/actions/groups';

/**
 * Admin toggle for a group's lite mode (Phase 16d). When on, the hub drops
 * the crowd-coordination surface (polls, activity feed, do-again / reignite
 * nudges, presence) — a simpler home for couples / roommates. Mirrors the
 * hub mute toggle's optimistic-with-revert pattern.
 */
export function LiteModeToggle({
  groupId,
  initialLite,
}: {
  groupId: string;
  initialLite: boolean;
}) {
  const [lite, setLite] = useState(initialLite);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !lite;
    setLite(next); // optimistic
    startTransition(async () => {
      const res = await setLiteModeAction(groupId, next);
      if (!res.ok) setLite(!next); // revert on failure
    });
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-content">Lite mode</p>
        <p className="mt-0.5 text-xs text-muted">
          A simpler hub for small groups — hides polls, the activity feed, and re-engagement nudges.
          Great for couples or roommates.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        onClick={toggle}
        disabled={pending}
        data-testid="lite-mode-toggle"
        data-lite={lite}
        aria-checked={lite}
        aria-label="Lite mode"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
          lite ? 'bg-accent-600' : 'bg-line'
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            lite ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
