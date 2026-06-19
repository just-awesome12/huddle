import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroup } from '@huddle/api-client/groups';
import { fetchGroupDecisions } from '@huddle/api-client/decisions';
import { getSupabaseServerClient } from '@/lib/supabase';
import { GroupRealtime } from '@/components/GroupRealtime';
import { CategoryBadge, CATEGORY_LABELS } from '@/components/IdeaBadges';

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  let group;
  let decisions;
  try {
    group = await fetchGroup(supabase, id);
    decisions = await fetchGroupDecisions(supabase, id);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <GroupRealtime groupId={id} />
      <Link href={`/groups/${id}`} className="text-sm text-muted hover:text-content">
        &larr; Back to {group.name}
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h2 className="text-xl font-medium">Decision history</h2>
        <Link
          href={`/groups/${id}/picker`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          Run the picker
        </Link>
      </div>

      {decisions.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line px-6 py-8 text-center">
          <p className="text-sm font-medium text-content">No picks yet</p>
          <p className="mt-1 text-sm text-muted">
            When your group runs the picker, the results show up here.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3" data-testid="decision-list">
          {decisions.map((d) => {
            const categoryFilter =
              d.filters && typeof d.filters === 'object' && 'category' in d.filters
                ? (d.filters as { category?: string | null }).category
                : null;
            return (
              <li
                key={d.id}
                className="rounded-lg border border-line bg-surface px-4 py-3"
                data-testid="decision-row"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Picked
                    </p>
                    {d.chosen ? (
                      <Link
                        href={`/groups/${id}/ideas/${d.chosen.id}`}
                        className="text-sm font-medium text-content hover:text-brand-ink"
                      >
                        {d.chosen.title}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-faint italic">(idea removed)</span>
                    )}
                  </div>
                  {d.chosen && <CategoryBadge category={d.chosen.category} />}
                </div>
                <p className="mt-2 text-xs text-muted">
                  by {d.runner?.display_name ?? 'someone'} ·{' '}
                  {new Date(d.created_at).toLocaleString()} · randomly from{' '}
                  {d.candidate_idea_ids.length} option
                  {d.candidate_idea_ids.length === 1 ? '' : 's'}
                  {categoryFilter
                    ? ` · ${CATEGORY_LABELS[categoryFilter as keyof typeof CATEGORY_LABELS] ?? categoryFilter} only`
                    : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
