import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroup } from '@huddle/api-client/groups';
import { fetchGroupDecisions, fetchGroupFairness } from '@huddle/api-client/decisions';
import { fetchGroupIdeas } from '@huddle/api-client/ideas';
import { fetchGroupVoteState } from '@huddle/api-client/votes';
import { getSupabaseServerClient } from '@/lib/supabase';
import { GroupRealtime } from '@/components/GroupRealtime';

/**
 * "The story so far" — an all-time recap of the group's activity, built
 * entirely from existing reads (ideas, decisions, fairness, votes). No
 * new data layer; year-scoping + a shareable image are deferred.
 */
export default async function RecapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  let group;
  let ideas;
  let decisions;
  let fairness;
  let votes;
  try {
    group = await fetchGroup(supabase, id);
    ideas = await fetchGroupIdeas(supabase, id);
    decisions = await fetchGroupDecisions(supabase, id);
    fairness = await fetchGroupFairness(supabase, id);
    votes = await fetchGroupVoteState(supabase, id, user.id);
  } catch {
    notFound();
  }

  const doneCount = ideas.filter((i) => i.status === 'done').length;
  const topProposer = fairness.find((m) => m.picked > 0) ?? null;

  // Most-loved idea = the one with the highest vote count (if any votes).
  let mostLoved: { title: string; count: number } | null = null;
  for (const idea of ideas) {
    const count = votes.countByIdea[idea.id] ?? 0;
    if (count > 0 && (!mostLoved || count > mostLoved.count)) {
      mostLoved = { title: idea.title, count };
    }
  }

  const stats: { label: string; value: string }[] = [
    { label: 'Ideas proposed', value: String(ideas.length) },
    { label: 'Times the picker decided', value: String(decisions.length) },
    { label: 'Ideas done', value: String(doneCount) },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <GroupRealtime groupId={id} />
      <Link href={`/groups/${id}`} className="text-sm text-muted hover:text-content">
        &larr; Back to {group.name}
      </Link>

      <h2 className="mt-4 text-xl font-medium">The story so far</h2>
      <p className="mt-1 text-sm text-muted">{group.name} in numbers.</p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="recap-stats">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-line bg-surface px-4 py-5 text-center"
          >
            <p className="text-3xl font-semibold text-brand-ink">{s.value}</p>
            <p className="mt-1 text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {topProposer && (
          <div
            className="rounded-lg border border-line bg-surface px-4 py-4"
            data-testid="recap-top-proposer"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Most successful proposer
            </p>
            <p className="mt-1 text-sm text-content">
              <span className="font-medium">{topProposer.displayName}</span> — {topProposer.picked}{' '}
              {topProposer.picked === 1 ? 'idea' : 'ideas'} picked
            </p>
          </div>
        )}
        {mostLoved && (
          <div
            className="rounded-lg border border-line bg-surface px-4 py-4"
            data-testid="recap-most-loved"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Most loved idea
            </p>
            <p className="mt-1 text-sm text-content">
              <span className="font-medium">{mostLoved.title}</span> — ❤ {mostLoved.count}
            </p>
          </div>
        )}
      </div>

      {ideas.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          Nothing to recap yet — add some ideas and run the picker.
        </p>
      )}
    </div>
  );
}
