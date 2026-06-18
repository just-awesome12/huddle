'use client';

import { useActionState } from 'react';
import { acceptInviteAction } from '@/actions/invites';
import { EMPTY_INVITE_STATE } from '@/actions/invites-state';
import { Button } from './Button';

interface AcceptInviteFormProps {
  token: string;
}

export function AcceptInviteForm({ token }: AcceptInviteFormProps) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, EMPTY_INVITE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {state.formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.formError}
        </p>
      )}
      <Button type="submit" loading={pending}>
        Accept invite
      </Button>
    </form>
  );
}
