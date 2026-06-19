'use client';

import { useActionState, useState } from 'react';
import { createInviteAction } from '@/actions/invites';
import { EMPTY_INVITE_STATE } from '@/actions/invites-state';
import { Button } from './Button';
import { FormField } from './FormField';

interface InviteCreatorProps {
  groupId: string;
}

/**
 * Generates an invite and shows the shareable URL with copy-to-clipboard.
 * The URL is built client-side from location.origin so it works on any
 * deployment (local, preview, production) without server config.
 */
export function InviteCreator({ groupId }: InviteCreatorProps) {
  const [state, formAction, pending] = useActionState(createInviteAction, EMPTY_INVITE_STATE);
  const [copied, setCopied] = useState(false);

  const inviteUrl = state.createdToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/invites/${state.createdToken}`
    : null;

  const copy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (permissions, http origin). The
      // URL is selectable text right above the button; no further
      // handling needed.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="groupId" value={groupId} />
        <FormField
          label="Email (optional)"
          name="invitedEmail"
          type="email"
          autoComplete="off"
          hint="Leave empty for an open link anyone can use. With an email, only that account can accept."
          error={state.fieldErrors?.invitedEmail?.[0]}
        />
        {state.formError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {state.formError}
          </p>
        )}
        <div>
          <Button type="submit" loading={pending}>
            Generate invite link
          </Button>
        </div>
      </form>

      {inviteUrl && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Invite link — valid for 7 days
          </p>
          <code
            data-testid="invite-url"
            className="break-all rounded bg-surface px-2 py-1 text-xs text-content"
          >
            {inviteUrl}
          </code>
          <div>
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? 'Copied!' : 'Copy link'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
