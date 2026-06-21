'use client';

import { useActionState, useEffect, useRef } from 'react';
import { quickAddIdeaAction } from '@/actions/ideas';
import { EMPTY_IDEA_STATE } from '@/actions/ideas-state';
import { Button } from './Button';

/**
 * Inline quick-add on the hub (Phase 15c): type a title, hit add, the idea
 * appears — no navigating to the full form. Category defaults to "other";
 * the full "+ New idea" flow is still there for photos/dates/etc.
 */
export function QuickAddIdea({ groupId }: { groupId: string }) {
  const [state, formAction, pending] = useActionState(quickAddIdeaAction, EMPTY_IDEA_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor="quick-add-title" className="sr-only">
          Quick-add an idea
        </label>
        <input
          ref={inputRef}
          id="quick-add-title"
          name="title"
          required
          maxLength={200}
          placeholder="Quick-add an idea…"
          className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-content placeholder:text-muted focus:border-accent-400 focus:outline-none"
        />
        <input type="hidden" name="groupId" value={groupId} />
        <Button type="submit" loading={pending}>
          Add
        </Button>
      </div>
      {state.fieldErrors?.title?.[0] && (
        <p className="px-1 text-xs text-red-700" role="alert">
          {state.fieldErrors.title[0]}
        </p>
      )}
      {state.formError && (
        <p className="px-1 text-xs text-red-700" role="alert">
          {state.formError}
        </p>
      )}
    </form>
  );
}
