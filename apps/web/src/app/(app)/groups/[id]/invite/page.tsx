import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  fetchGroup,
  fetchGroupMembers,
  type GroupMemberWithProfile,
} from '@huddle/api-client/groups';
import { fetchGroupInvites, type GroupInviteRow } from '@huddle/api-client/invites';
import { getSupabaseServerClient } from '@/lib/supabase';
import { revokeInviteAction } from '@/actions/invites';
import { InviteCreator } from '@/components/InviteCreator';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';

function describeInvite(invite: GroupInviteRow): string {
  if (invite.invited_email) return `For ${invite.invited_email}`;
  if (invite.invited_user_id) return 'For a specific user';
  return 'Open link';
}

export default async function GroupInvitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  let groupName: string;
  let members: GroupMemberWithProfile[];
  let invites: GroupInviteRow[];
  try {
    const group = await fetchGroup(supabase, id);
    groupName = group.name;
    members = await fetchGroupMembers(supabase, id);
    invites = await fetchGroupInvites(supabase, id);
  } catch {
    notFound();
  }

  // Invites are admin-only (RLS enforces; this redirect is UX).
  const myMembership = members.find((m) => m.userId === user.id);
  if (myMembership?.role !== 'admin') {
    redirect(`/groups/${id}`);
  }

  const now = Date.now();

  return (
    <div className="mx-auto max-w-md">
      <Link
        href={`/groups/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        &larr; Back to {groupName}
      </Link>
      <h2 className="mt-4 text-xl font-medium">Invite people</h2>

      <section className="mt-6">
        <InviteCreator groupId={id} />
      </section>

      <section className="mt-10">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Open invites ({invites.length})
        </h3>
        {invites.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No open invites. Generate a link above to invite someone.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2" data-testid="invite-list">
            {invites.map((invite) => {
              const expired = new Date(invite.expires_at).getTime() < now;
              return (
                <li
                  key={invite.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-900">
                      {describeInvite(invite)}
                    </span>
                    <span className={`text-xs ${expired ? 'text-red-600' : 'text-slate-500'}`}>
                      {expired
                        ? 'Expired'
                        : `Expires ${new Date(invite.expires_at).toLocaleDateString()}`}
                      {' · '}…{invite.token.slice(-6)}
                    </span>
                  </div>
                  <ConfirmActionForm
                    action={revokeInviteAction}
                    fields={{ inviteId: invite.id, groupId: id }}
                    buttonLabel="Revoke"
                    confirmPrompt="Revoke this invite? The link will stop working."
                    confirmLabel="Revoke invite"
                    variant="secondary"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
