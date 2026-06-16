import Link from 'next/link';
import { acceptInviteSchema } from '@huddle/validation';
import {
  peekInvite,
  inviteErrorKind,
  type InvitePeek,
} from '@huddle/api-client/invites';
import { getSupabaseServerClient } from '@/lib/supabase';
import { AcceptInviteForm } from '@/components/AcceptInviteForm';

function StatusCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-lg border border-line bg-surface p-6">
        <h2 className="text-lg font-medium" data-testid="invite-status">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <Link
          href="/groups"
          className="mt-4 inline-block text-sm font-medium text-brand-ink underline"
        >
          Go to your groups
        </Link>
      </div>
    </div>
  );
}

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const parsed = acceptInviteSchema.safeParse({ token });
  if (!parsed.success) {
    return (
      <StatusCard
        title="Invalid invite link"
        body="This link doesn't look like a Huddle invite. Check that the full link was copied."
      />
    );
  }

  const supabase = await getSupabaseServerClient();
  let peek: InvitePeek;
  try {
    peek = await peekInvite(supabase, parsed.data.token);
  } catch (e) {
    if (inviteErrorKind(e) === 'not_found') {
      return (
        <StatusCard
          title="Invite not found"
          body="This invite doesn't exist — it may have been revoked. Ask for a new link."
        />
      );
    }
    throw e;
  }

  switch (peek.status) {
    case 'expired':
      return (
        <StatusCard
          title="Invite expired"
          body={`The invite to "${peek.group_name}" has expired. Ask ${peek.inviter_display_name} for a new one.`}
        />
      );
    case 'accepted':
      return (
        <StatusCard
          title="Invite already used"
          body={`This invite to "${peek.group_name}" has already been used. Ask ${peek.inviter_display_name} for a new one.`}
        />
      );
    case 'already_member':
      return (
        <StatusCard
          title="You're already in"
          body={`You're already a member of "${peek.group_name}".`}
        />
      );
    case 'wrong_user':
      return (
        <StatusCard
          title="Wrong account"
          body="This invite was sent to a different account. Check that you're signed in with the right one."
        />
      );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-lg border border-line bg-surface p-6">
        <p className="text-sm text-muted">You&apos;ve been invited</p>
        <h2 className="mt-1 text-xl font-medium" data-testid="invite-group-name">
          {peek.group_name}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Invited by {peek.inviter_display_name}
        </p>
        <div className="mt-6">
          <AcceptInviteForm token={parsed.data.token} />
        </div>
      </div>
    </div>
  );
}
