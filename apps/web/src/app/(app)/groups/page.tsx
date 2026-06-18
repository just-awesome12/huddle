import Link from 'next/link';
import { fetchMyGroups } from '@huddle/api-client/groups';
import { fetchMyPendingInvites, peekInvite } from '@huddle/api-client/invites';
import { getSupabaseServerClient } from '@/lib/supabase';
import { RoleBadge } from '@/components/RoleBadge';

export default async function GroupsPage() {
  const supabase = await getSupabaseServerClient();
  const groups = await fetchMyGroups(supabase);

  // Invites addressed to me (add-by-username). The group name comes
  // from peek_invite — RLS hides the groups table from non-members.
  const pendingInvites = await fetchMyPendingInvites(supabase);
  const pendingWithNames = await Promise.all(
    pendingInvites.map(async (invite) => {
      try {
        const peek = await peekInvite(supabase, invite.token);
        return { invite, groupName: peek.group_name };
      } catch {
        return null; // revoked between queries — just skip it
      }
    }),
  );
  const invitesForMe = pendingWithNames.filter((x) => x !== null);

  return (
    <div className="mx-auto max-w-2xl">
      {invitesForMe.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Invites for you ({invitesForMe.length})
          </h2>
          <ul className="mt-3 flex flex-col gap-2" data-testid="pending-invites">
            {invitesForMe.map(({ invite, groupName }) => (
              <li key={invite.id}>
                <Link
                  href={`/invites/${invite.token}`}
                  className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-4 py-3 transition-colors hover:border-brand-300"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-content">{groupName}</span>
                    <span className="text-xs text-muted">
                      Invited by {invite.inviter?.display_name ?? 'someone'}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-content">View invite →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">Your groups</h2>
        <Link
          href="/groups/new"
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          New group
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-line px-6 py-10 text-center">
          <p className="text-sm font-medium text-content">No groups yet</p>
          <p className="mt-1 text-sm text-muted">
            Create a group to start collecting ideas with your people.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2" data-testid="group-list">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-line hover:bg-surface-2"
              >
                <span className="text-sm font-medium text-content">{group.name}</span>
                <RoleBadge role={group.myRole} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
