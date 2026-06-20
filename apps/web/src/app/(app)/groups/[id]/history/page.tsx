import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroup } from '@huddle/api-client/groups';
import {
  fetchGroupDecisions,
  fetchGroupFairness,
  type MemberFairness,
} from '@huddle/api-client/decisions';
import type { IdeaCategory } from '@huddle/validation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { GroupRealtime } from '@/components/GroupRealtime';
import { CATEGORY_LABELS } from '@/components/IdeaBadges';

const CATEGORY_EMOJI: Record<IdeaCategory, string> = {
  food: '🌮',
  activity: '🎳',
  place: '📍',
  event: '🎬',
  other: '💡',
};

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  let group;
  let decisions;
  let fairness: MemberFairness[] = [];
  try {
    group = await fetchGroup(supabase, id);
    decisions = await fetchGroupDecisions(supabase, id);
    fairness = await fetchGroupFairness(supabase, id);
  } catch {
    notFound();
  }

  const dueForAWin = fairness.filter((m) => m.proposed > 0 && m.picked === 0);

  return (
    <div className="mx-auto max-w-[760px]">
      <GroupRealtime groupId={id} />
      <Link
        href={`/groups/${id}`}
        className="font-display text-[13.5px] font-extrabold text-muted hover:text-content"
      >
        ← {group.name}
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[clamp(26px,3.4vw,34px)] font-black tracking-[-0.02em] text-content">
          Decision log
        </h1>
        <div className="flex items-center gap-3">
          {decisions.length > 0 && (
            <span className="inline-flex items-center gap-[9px] rounded-full bg-brand-50 px-4 py-[9px] font-display text-[13.5px] font-extrabold text-brand-ink">
              🎉 {decisions.length} {decisions.length === 1 ? 'plan' : 'plans'}, finally decided
            </span>
          )}
          <Link
            href={`/groups/${id}/recap`}
            data-testid="recap-link"
            className="font-display text-[13.5px] font-extrabold text-muted hover:text-brand-ink"
          >
            Recap
          </Link>
        </div>
      </div>

      {decisions.length === 0 ? (
        <div className="mt-6 rounded-[18px] border-2 border-dashed border-line px-6 py-9 text-center">
          <p className="font-display text-[15px] font-extrabold text-content">No picks yet</p>
          <p className="mt-1 text-sm text-muted">
            When your group runs the picker, the results show up here.
          </p>
          <Link
            href={`/groups/${id}/picker`}
            className="mt-4 inline-flex rounded-full bg-accent-400 px-5 py-2.5 font-display text-sm font-extrabold text-white"
          >
            Run the picker
          </Link>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3" data-testid="decision-list">
          {decisions.map((d) => {
            const categoryFilter =
              d.filters && typeof d.filters === 'object' && 'category' in d.filters
                ? (d.filters as { category?: string | null }).category
                : null;
            const note = `randomly from ${d.candidate_idea_ids.length} option${
              d.candidate_idea_ids.length === 1 ? '' : 's'
            }${
              categoryFilter
                ? ` · ${CATEGORY_LABELS[categoryFilter as keyof typeof CATEGORY_LABELS] ?? categoryFilter} only`
                : ''
            }`;
            return (
              <li
                key={d.id}
                className="flex items-center gap-4 rounded-[18px] border border-line bg-surface px-[18px] py-4"
                data-testid="decision-row"
                style={{ boxShadow: '0 16px 30px -22px rgba(38,33,92,.32)' }}
              >
                <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[15px] bg-surface-2 text-[26px]">
                  {d.chosen ? CATEGORY_EMOJI[d.chosen.category] : '🎲'}
                </span>
                <div className="min-w-0 flex-1">
                  {d.chosen ? (
                    <Link
                      href={`/groups/${id}/ideas/${d.chosen.id}`}
                      className="font-display text-[16.5px] font-black text-content hover:text-brand-ink"
                    >
                      {d.chosen.title}
                    </Link>
                  ) : (
                    <span className="font-display text-[16.5px] font-black italic text-faint">
                      (idea removed)
                    </span>
                  )}
                  <div className="mt-0.5 text-[13px] text-muted">{note}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-[7px]">
                  <span className="rounded-full bg-accent-50 px-[11px] py-[5px] font-display text-[11.5px] font-extrabold text-accent-600">
                    Picker
                  </span>
                  <span className="text-[12.5px] text-faint">
                    {new Date(d.created_at).toLocaleDateString()}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {fairness.length > 0 && (
        <section className="mt-10" data-testid="fairness">
          <h3 className="font-display text-[13px] font-extrabold uppercase tracking-[0.12em] text-muted">
            Who gets picked
          </h3>
          {dueForAWin.length > 0 && (
            <p className="mt-2 text-sm text-muted" data-testid="fairness-due">
              Due for a win:{' '}
              <span className="font-display font-extrabold text-content">
                {dueForAWin.map((m) => m.displayName).join(', ')}
              </span>{' '}
              — proposed ideas, never picked.
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-2">
            {fairness.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-3 rounded-[16px] border border-line bg-surface px-4 py-3"
              >
                <span className="truncate font-display text-sm font-extrabold text-content">
                  {m.displayName}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  proposed {m.proposed} · picked {m.picked}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
