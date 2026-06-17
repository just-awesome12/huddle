import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroup } from '@huddle/api-client/groups';
import { fetchGroupIdeas } from '@huddle/api-client/ideas';
import { getSupabaseServerClient } from '@/lib/supabase';
import { PickerPanel, type PickerCandidate } from '@/components/PickerPanel';

export default async function PickPage({
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
  let candidates: PickerCandidate[];
  try {
    const group = await fetchGroup(supabase, id);
    groupName = group.name;
    const ideas = await fetchGroupIdeas(supabase, id, { status: 'on_radar' });
    candidates = ideas.map((i) => ({ id: i.id, title: i.title, category: i.category }));
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center justify-between">
        <Link
          href={`/groups/${id}`}
          className="text-sm text-muted hover:text-content"
        >
          &larr; Back to {groupName}
        </Link>
        <Link
          href={`/groups/${id}/history`}
          className="text-sm font-medium text-muted hover:text-brand-ink"
        >
          History
        </Link>
      </div>

      <h2 className="mt-4 text-xl font-medium">Pick for us</h2>
      <p className="mt-1 text-sm text-muted">
        Draws one idea at random from the {candidates.length} on the radar.
      </p>

      <div className="mt-6">
        {candidates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-6 py-8 text-center">
            <p className="text-sm font-medium text-content">
              Nothing on the radar yet
            </p>
            <p className="mt-1 text-sm text-muted">
              Add an idea first, then come back and let Huddle choose.
            </p>
            <Link
              href={`/groups/${id}/ideas/new`}
              className="mt-3 inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Add an idea
            </Link>
          </div>
        ) : (
          <PickerPanel groupId={id} candidates={candidates} />
        )}
      </div>
    </div>
  );
}
