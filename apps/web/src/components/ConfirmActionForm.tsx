'use client';

import { useActionState, useState } from 'react';
import type { GroupActionState } from '@/actions/groups-state';
import { EMPTY_GROUP_STATE } from '@/actions/groups-state';
import { Button } from './Button';

interface ConfirmActionFormProps {
  /** The Server Action to run once confirmed. */
  action: (prev: GroupActionState, formData: FormData) => Promise<GroupActionState>;
  /** Hidden fields submitted with the form (e.g. groupId, userId). */
  fields: Record<string, string>;
  /** Label of the initial button. */
  buttonLabel: string;
  /** Question shown in the inline confirmation step. */
  confirmPrompt: string;
  /** Label of the confirming (destructive) button. */
  confirmLabel: string;
  variant?: 'danger' | 'secondary';
}

/**
 * Inline two-step confirmation for destructive Server Actions.
 * Click → prompt + Confirm/Cancel → submit. Inline (not window.confirm)
 * so it's accessible, styleable, and testable in Playwright.
 */
export function ConfirmActionForm({
  action,
  fields,
  buttonLabel,
  confirmPrompt,
  confirmLabel,
  variant = 'danger',
}: ConfirmActionFormProps) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(action, EMPTY_GROUP_STATE);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant={variant === 'danger' ? 'danger' : 'secondary'}
          onClick={() => setConfirming(true)}
        >
          {buttonLabel}
        </Button>
        {state.formError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {state.formError}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p className="text-sm text-content">{confirmPrompt}</p>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="danger" loading={pending}>
          {confirmLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
      {state.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}
    </form>
  );
}
