import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  fetchGroup,
  fetchGroupMembers,
  type GroupMemberWithProfile,
} from '@huddle/api-client/groups';
import { getSupabaseServerClient } from '@/lib/supabase';
import { leaveGroupAction, removeMemberAction } from '@/actions/groups';
import { RoleBadge } from '@/components/RoleBadge';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';

export default async function GroupDetailPage({
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

  // RLS hides groups the user isn't a member of, so a forbidden group
  // and a nonexistent group both surface here as "no row" — render 404
  // for both rather than leaking which ids exist.
  let group;
  let members: GroupMemberWithProfile[];
  try {
    group = await fetchGroup(supabase, id);
    members = await fetchGroupMembers(supabase, id);
  } catch {
    notFound();
  }

  const myMembership = members.find((m) => m.userId === user.id);
  const isAdmin = myMembership?.role === 'admin';

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/groups" className="text-sm text-slate-500 hover:text-slate-700">
        &larr; Back to groups
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h2 className="text-xl font-medium" data-testid="group-name">
          {group.name}
        </h2>
        {isAdmin && (
          <div className="flex items-center gap-4">
            <Link
              href={`/groups/${id}/invite`}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Invite
            </Link>
            <Link
              href={`/groups/${id}/settings`}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Settings
            </Link>
          </div>
        )}
      </div>

      <section className="mt-8">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Members ({members.length})
        </h3>
        <ul className="mt-3 flex flex-col gap-2" data-testid="member-list">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-900">
                  {member.profile.display_name}
                  {member.userId === user.id && (
                    <span className="ml-1 text-slate-400">(you)</span>
                  )}
                </span>
                <span className="text-xs text-slate-500">
                  @{member.profile.username}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <RoleBadge role={member.role} />
                {isAdmin && member.userId !== user.id && (
                  <ConfirmActionForm
                    action={removeMemberAction}
                    fields={{ groupId: id, userId: member.userId }}
                    buttonLabel="Remove"
                    confirmPrompt={`Remove ${member.profile.display_name} from this group?`}
                    confirmLabel="Remove member"
                    variant="secondary"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 border-t border-slate-200 pt-6">
        <ConfirmActionForm
          action={leaveGroupAction}
          fields={{ groupId: id }}
          buttonLabel="Leave group"
          confirmPrompt="Leave this group? You'll need a new invite to rejoin."
          confirmLabel="Leave group"
          variant="secondary"
        />
      </section>
    </div>
  );
}
