'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createPollAction } from '@/actions/polls';
import { EMPTY_POLL_STATE } from '@/actions/polls-state';
import { Button } from './Button';

/**
 * Create-a-poll form (16a): a question + 2..10 option inputs (add/remove).
 * Options post as repeated `option` fields the action reads with getAll.
 */
export function PollComposer({ groupId }: { groupId: string }) {
  const [state, formAction, pending] = useActionState(createPollAction, EMPTY_POLL_STATE);
  const [optionCount, setOptionCount] = useState(2);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset on a successful create.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOptionCount(2);
    }
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="flex flex-col gap-1">
        <label htmlFor="poll-question" className="text-sm font-medium text-content">
          Ask the group
        </label>
        <input
          id="poll-question"
          name="question"
          required
          maxLength={200}
          placeholder="Which weekend works?"
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: optionCount }, (_, i) => (
          <input
            key={i}
            name="option"
            required={i < 2}
            maxLength={100}
            placeholder={`Option ${i + 1}`}
            aria-label={`Option ${i + 1}`}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
        ))}
      </div>

      {optionCount < 10 && (
        <button
          type="button"
          onClick={() => setOptionCount((n) => Math.min(10, n + 1))}
          className="self-start text-sm font-semibold text-brand-ink underline"
        >
          + Add option
        </button>
      )}

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" loading={pending}>
          Create poll
        </Button>
      </div>
    </form>
  );
}
