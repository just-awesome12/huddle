'use client';

import { useActionState, useEffect, useRef } from 'react';
import { addPostAction } from '@/actions/posts';
import { EMPTY_POST_STATE } from '@/actions/posts-state';
import { Button } from './Button';

/** Group-wall composer. Clears the textarea after a successful post. */
export function PostComposer({ groupId }: { groupId: string }) {
  const [state, formAction, pending] = useActionState(addPostAction, EMPTY_POST_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <label htmlFor="wall-body" className="sr-only">
        Write something
      </label>
      <textarea
        id="wall-body"
        name="body"
        rows={2}
        required
        maxLength={2000}
        placeholder="Anyone free this weekend?"
        className="w-full resize-y rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-content placeholder:text-muted focus:border-accent-400 focus:outline-none"
      />
      {state.error && (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Post
        </Button>
      </div>
    </form>
  );
}
