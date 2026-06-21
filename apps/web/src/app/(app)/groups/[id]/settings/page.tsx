import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  fetchGroup,
  fetchGroupMembers,
  fetchJoinRequests,
  type GroupMemberWithProfile,
  type JoinRequestWithProfile,
} from '@huddle/api-client/groups';
import { getSupabaseServerClient } from '@/lib/supabase';
import { deleteGroupAction, respondJoinRequestAction } from '@/actions/groups';
import { EditGroupForm } from '@/components/EditGroupForm';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';

export default async function GroupSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  let group;
  let members: GroupMemberWithProfile[];
  try {
    group = await fetchGroup(supabase, id);
    members = await fetchGroupMembers(supabase, id);
  } catch {
    notFound();
  }

  // Settings is admin-only. RLS would reject the mutations anyway;
  // this redirect is UX, not security.
  const myMembership = members.find((m) => m.userId === user.id);
  if (myMembership?.role !== 'admin') {
    redirect(`/groups/${id}`);
  }

  let requests: JoinRequestWithProfile[] = [];
  try {
    requests = await fetchJoinRequests(supabase, id);
  } catch {
    // leave empty
  }

  return (
    <div className="mx-auto max-w-md">
      <Link href={`/groups/${id}`} className="text-sm text-muted hover:text-content">
        &larr; Back to {group.name}
      </Link>
      <h2 className="mt-4 text-xl font-medium">Group settings</h2>

      <section className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Details</h3>
        <div className="mt-3">
          <EditGroupForm
            groupId={id}
            name={group.name}
            defaults={{
              description: group.description,
              location: group.location,
              tags: group.tags,
              visibility: group.visibility,
            }}
            storedEmoji={group.emoji}
            storedColor={group.color}
            coverUrl={group.cover_photo_path}
          />
        </div>
      </section>

      {/* Join requests (public groups) */}
      <section className="mt-10" data-testid="join-requests">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Join requests ({requests.length})
        </h3>
        {requests.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No pending requests.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3"
                data-testid="join-request-row"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-content">
                    {r.profile.display_name}
                  </p>
                  <p className="truncate text-xs text-muted">@{r.profile.username}</p>
                  {r.message && <p className="mt-1 text-xs text-muted">“{r.message}”</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <form action={respondJoinRequestAction}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="groupId" value={id} />
                    <input type="hidden" name="approve" value="true" />
                    <button
                      type="submit"
                      className="rounded-md bg-accent-600 px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-accent-900"
                      data-testid="approve-request"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={respondJoinRequestAction}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="groupId" value={id} />
                    <input type="hidden" name="approve" value="false" />
                    <button
                      type="submit"
                      className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2"
                      data-testid="reject-request"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-red-200 bg-red-50/50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-red-700">Danger zone</h3>
        <p className="mt-2 text-sm text-muted">
          Deleting a group permanently removes its members, ideas, and decision history.
        </p>
        <div className="mt-4">
          <ConfirmActionForm
            action={deleteGroupAction}
            fields={{ groupId: id }}
            buttonLabel="Delete group"
            confirmPrompt={`Delete "${group.name}" and everything in it? This cannot be undone.`}
            confirmLabel="Delete group"
          />
        </div>
      </section>
    </div>
  );
}
