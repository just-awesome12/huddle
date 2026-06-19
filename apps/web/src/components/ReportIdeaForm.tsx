'use client';

import { useActionState, useState } from 'react';
import { reportIdeaAction } from '@/actions/moderation';
import { EMPTY_MODERATION_STATE } from '@/actions/moderation-state';
import { Button } from './Button';

const REASONS: { value: string; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
];

/**
 * Report control for an idea (OQ-5). Collapsed to a link; expands to a
 * reason + optional details form. A duplicate report still resolves as
 * "reported".
 */
export function ReportIdeaForm({ ideaId }: { ideaId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(reportIdeaAction, EMPTY_MODERATION_STATE);

  if (state.ok) {
    return (
      <p className="text-sm text-muted" role="status" data-testid="report-done">
        Reported — thanks, we&rsquo;ll review it.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-muted hover:text-brand-ink"
        data-testid="report-open"
      >
        Report
      </button>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-2" data-testid="report-form">
      <input type="hidden" name="ideaId" value={ideaId} />
      <label className="text-sm font-medium text-content" htmlFor="report-reason">
        Why are you reporting this?
      </label>
      <select
        id="report-reason"
        name="reason"
        defaultValue="inappropriate"
        className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-content"
      >
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        name="details"
        rows={2}
        maxLength={1000}
        placeholder="Add any details (optional)"
        className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-content"
      />
      {state.formError && (
        <p className="text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="secondary" loading={pending}>
          Submit report
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
