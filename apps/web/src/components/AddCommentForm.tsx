'use client';

import { useActionState, useEffect, useRef } from 'react';
import { addCommentAction } from '@/actions/comments';
import { EMPTY_COMMENT_STATE } from '@/actions/comments-state';
import { Button } from './Button';

/** Add-comment box for an idea (Phase 11). Clears on success. */
export function AddCommentForm({ ideaId, groupId }: { ideaId: string; groupId: string }) {
  const [state, formAction, pending] = useActionState(addCommentAction, EMPTY_COMMENT_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="ideaId" value={ideaId} />
      <input type="hidden" name="groupId" value={groupId} />
      <textarea
        name="body"
        rows={2}
        required
        maxLength={2000}
        placeholder="Add a comment…"
        aria-label="Add a comment"
        data-testid="comment-input"
        className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-content"
      />
      {state.fieldErrors?.body?.[0] && (
        <p className="text-xs text-red-600" role="alert">
          {state.fieldErrors.body[0]}
        </p>
      )}
      {state.formError && (
        <p className="text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}
      <div>
        <Button type="submit" variant="secondary" loading={pending} data-testid="comment-submit">
          Comment
        </Button>
      </div>
    </form>
  );
}
