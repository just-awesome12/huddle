import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroup } from '@huddle/api-client/groups';
import { fetchGroupIdeas } from '@huddle/api-client/ideas';
import { getSupabaseServerClient } from '@/lib/supabase';
import { GroupRealtime } from '@/components/GroupRealtime';
import { PickerClient, type PickableIdea } from '@/components/PickerClient';

export default async function PickerPage({
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

  // RLS hides non-member groups; both "forbidden" and "missing" surface
  // as a thrown read → 404 (don't leak which ids exist).
  let group;
  let pickable: PickableIdea[];
  try {
    group = await fetchGroup(supabase, id);
    const ideas = await fetchGroupIdeas(supabase, id, { status: 'on_radar' });
    pickable = ideas.map((i) => ({ id: i.id, title: i.title, category: i.category }));
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <GroupRealtime groupId={id} />
      <Link
        href={`/groups/${id}`}
        className="text-sm text-muted hover:text-content"
      >
        &larr; Back to {group.name}
      </Link>

      <div className="mt-4">
        <h2 className="text-xl font-medium">Random picker</h2>
        <p className="mt-1 text-sm text-muted">
          Can&rsquo;t agree? Let Huddle choose from your on-the-radar ideas.
        </p>
      </div>

      <PickerClient groupId={id} ideas={pickable} />
    </div>
  );
}
