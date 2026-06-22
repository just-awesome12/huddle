'use client';

import { useActionState } from 'react';
import { bulkInviteAction } from '@/actions/invites';
import { EMPTY_BULK_INVITE_STATE } from '@/actions/invites-state';
import { Button } from './Button';

/**
 * Bulk invite (15e): paste many emails (commas, spaces, or newlines) and
 * send email invites in one go. Partial success — the result lists what
 * sent, what was unparseable, and what was skipped (already a member).
 */
export function BulkInviteForm({ groupId }: { groupId: string }) {
  const [state, formAction, pending] = useActionState(bulkInviteAction, EMPTY_BULK_INVITE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-emails" className="text-sm font-medium text-content">
          Invite several people
        </label>
        <textarea
          id="bulk-emails"
          name="emails"
          rows={3}
          placeholder="alice@example.com, bob@example.com…"
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
        <p className="text-xs text-muted">
          Separate emails with commas, spaces, or new lines. Each gets their own invite.
        </p>
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}

      {typeof state.sent === 'number' && (
        <div
          className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800"
          role="status"
          data-testid="bulk-invite-result"
        >
          <p className="font-semibold">
            Sent {state.sent} invite{state.sent === 1 ? '' : 's'}.
          </p>
          {state.skipped && state.skipped.length > 0 && (
            <p className="mt-1 text-xs text-green-900">
              Skipped (already members): {state.skipped.join(', ')}
            </p>
          )}
          {state.invalid && state.invalid.length > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              Not valid emails: {state.invalid.join(', ')}
            </p>
          )}
        </div>
      )}

      <div>
        <Button type="submit" loading={pending}>
          Send invites
        </Button>
      </div>
    </form>
  );
}
