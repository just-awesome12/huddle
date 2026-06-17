import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroup } from '@huddle/api-client/groups';
import {
  fetchGroupDecisions,
  type DecisionWithDetails,
} from '@huddle/api-client/decisions';
import { getSupabaseServerClient } from '@/lib/supabase';
import { GroupRealtime } from '@/components/GroupRealtime';
import { CategoryBadge, CATEGORY_LABELS } from '@/components/IdeaBadges';

/** Pull a readable category-filter label off a decision's filters jsonb. */
function filterLabel(decision: DecisionWithDetails): string | null {
  const filters = decision.filters as { category?: string | null } | null;
  const category = filters?.category;
  if (category && category in CATEGORY_LABELS) {
    return CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS];
  }
  return null;
}

export default async function HistoryPage({
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
  let decisions: DecisionWithDetails[];
  try {
    const group = await fetchGroup(supabase, id);
    groupName = group.name;
    decisions = await fetchGroupDecisions(supabase, id);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <GroupRealtime groupId={id} />
      <div className="flex items-center justify-between">
        <Link href={`/groups/${id}`} className="text-sm text-muted hover:text-content">
          &larr; Back to {groupName}
        </Link>
        <Link
          href={`/groups/${id}/pick`}
          className="text-sm font-medium text-muted hover:text-brand-ink"
        >
          Pick for us
        </Link>
      </div>

      <h2 className="mt-4 text-xl font-medium">History</h2>
      <p className="mt-1 text-sm text-muted">
        Every time the group let the picker decide.
      </p>

      {decisions.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line px-6 py-8 text-center">
          <p className="text-sm font-medium text-content">No picks yet</p>
          <p className="mt-1 text-sm text-muted">
            When you run the picker, the results show up here.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2" data-testid="history-list">
          {decisions.map((decision) => {
            const label = filterLabel(decision);
            return (
              <li
                key={decision.id}
                className="rounded-lg border border-line bg-surface px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    {decision.chosen ? (
                      <Link
                        href={`/groups/${id}/ideas/${decision.chosen.id}`}
                        className="truncate text-sm font-medium text-content hover:underline"
                      >
                        {decision.chosen.title}
                      </Link>
                    ) : (
                      <span className="truncate text-sm font-medium text-faint italic">
                        (idea removed)
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      picked by {decision.runner?.display_name ?? 'someone'} ·{' '}
                      {new Date(decision.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {decision.chosen && (
                      <CategoryBadge category={decision.chosen.category} />
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-faint">
                  from {decision.candidate_idea_ids.length} candidate
                  {decision.candidate_idea_ids.length === 1 ? '' : 's'}
                  {label ? ` · ${label} only` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
