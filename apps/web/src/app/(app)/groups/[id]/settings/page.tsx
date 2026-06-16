import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  fetchGroup,
  fetchGroupMembers,
  type GroupMemberWithProfile,
} from '@huddle/api-client/groups';
import { getSupabaseServerClient } from '@/lib/supabase';
import { deleteGroupAction } from '@/actions/groups';
import { RenameGroupForm } from '@/components/RenameGroupForm';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';

export default async function GroupSettingsPage({
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

  return (
    <div className="mx-auto max-w-md">
      <Link
        href={`/groups/${id}`}
        className="text-sm text-muted hover:text-content"
      >
        &larr; Back to {group.name}
      </Link>
      <h2 className="mt-4 text-xl font-medium">Group settings</h2>

      <section className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Rename
        </h3>
        <div className="mt-3">
          <RenameGroupForm groupId={id} currentName={group.name} />
        </div>
      </section>

      <section className="mt-10 rounded-lg border border-red-200 bg-red-50/50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-red-700">
          Danger zone
        </h3>
        <p className="mt-2 text-sm text-muted">
          Deleting a group permanently removes its members, ideas, and
          decision history.
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
