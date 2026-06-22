'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createAvailabilityPollAction } from '@/actions/availability';
import { EMPTY_POLL_STATE } from '@/actions/polls-state';
import { Button } from './Button';

/**
 * Create-an-availability-poll form (16b): a title + 1..14 date inputs.
 * Dates post as repeated `date` fields the action reads with getAll.
 */
export function AvailabilityComposer({ groupId }: { groupId: string }) {
  const [state, formAction, pending] = useActionState(
    createAvailabilityPollAction,
    EMPTY_POLL_STATE,
  );
  const [dateCount, setDateCount] = useState(2);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setDateCount(2);
    }
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="flex flex-col gap-1">
        <label htmlFor="avail-title" className="text-sm font-medium text-content">
          What are we planning?
        </label>
        <input
          id="avail-title"
          name="title"
          required
          maxLength={200}
          placeholder="Dinner next week"
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: dateCount }, (_, i) => (
          <input
            key={i}
            type="date"
            name="date"
            required={i < 1}
            aria-label={`Date ${i + 1}`}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
        ))}
      </div>

      {dateCount < 14 && (
        <button
          type="button"
          onClick={() => setDateCount((n) => Math.min(14, n + 1))}
          className="self-start text-sm font-semibold text-brand-ink underline"
        >
          + Add date
        </button>
      )}

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" loading={pending}>
          Ask when&rsquo;s free
        </Button>
      </div>
    </form>
  );
}
