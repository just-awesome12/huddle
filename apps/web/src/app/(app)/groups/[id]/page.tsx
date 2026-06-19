import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  fetchGroup,
  fetchGroupMembers,
  type GroupMemberWithProfile,
} from '@huddle/api-client/groups';
import { fetchGroupIdeas, type IdeaFilters, type IdeaWithProposer } from '@huddle/api-client/ideas';
import { fetchGroupVoteState } from '@huddle/api-client/votes';
import { fetchGroupCommentCounts } from '@huddle/api-client/comments';
import { ideaFiltersSchema } from '@huddle/validation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { leaveGroupAction, removeMemberAction } from '@/actions/groups';
import { RoleBadge } from '@/components/RoleBadge';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';
import { GroupRealtime } from '@/components/GroupRealtime';
import {
  CategoryBadge,
  StatusBadge,
  CATEGORY_LABELS,
  STATUS_LABELS,
} from '@/components/IdeaBadges';

/** Build a filter-chip href, preserving the other dimension. */
function filterHref(groupId: string, filters: IdeaFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.category) params.set('category', filters.category);
  const qs = params.toString();
  return `/groups/${groupId}${qs ? `?${qs}` : ''}`;
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-brand-600 text-white' : 'bg-surface-2 text-muted hover:bg-line'
      }`}
    >
      {label}
    </Link>
  );
}

export default async function GroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const { id } = await params;
  const rawFilters = await searchParams;

  // Invalid filter params are ignored rather than erroring — they only
  // arrive hand-edited.
  const parsedFilters = ideaFiltersSchema.safeParse(rawFilters);
  const filters: IdeaFilters = parsedFilters.success ? parsedFilters.data : {};

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
  let ideas: IdeaWithProposer[];
  try {
    group = await fetchGroup(supabase, id);
    members = await fetchGroupMembers(supabase, id);
    ideas = await fetchGroupIdeas(supabase, id, filters);
  } catch {
    notFound();
  }

  const myMembership = members.find((m) => m.userId === user.id);
  const isAdmin = myMembership?.role === 'admin';
  const hasFilters = !!(filters.status || filters.category);

  // "Upcoming" = on-radar ideas with a date today-or-later, soonest first.
  // event_date is a YYYY-MM-DD string, so lexical compare == chronological.
  // Derived from the already-fetched list (no extra query); ignores the
  // status filter so what's coming up is always visible.
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
  const upcoming = ideas
    .filter((i) => i.status === 'on_radar' && i.event_date && i.event_date >= todayStr)
    .sort((a, b) => (a.event_date! < b.event_date! ? -1 : 1));

  // Vote + comment counts for the list (Phase 11) — best-effort.
  let voteCounts: Record<string, number> = {};
  let commentCounts: Record<string, number> = {};
  try {
    voteCounts = (await fetchGroupVoteState(supabase, id, user.id)).countByIdea;
    commentCounts = await fetchGroupCommentCounts(supabase, id);
  } catch {
    // leave empty
  }

  return (
    <div className="mx-auto max-w-2xl">
      <GroupRealtime groupId={id} />
      <Link href="/groups" className="text-sm text-muted hover:text-content">
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
              className="text-sm font-medium text-muted hover:text-brand-ink"
            >
              Invite
            </Link>
            <Link
              href={`/groups/${id}/settings`}
              className="text-sm font-medium text-muted hover:text-brand-ink"
            >
              Settings
            </Link>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Link
          href={`/groups/${id}/picker`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          data-testid="picker-link"
        >
          🎲 Pick for us
        </Link>
        <Link
          href={`/groups/${id}/history`}
          className="text-sm font-medium text-muted hover:text-brand-ink"
          data-testid="history-link"
        >
          History
        </Link>
      </div>

      {upcoming.length > 0 && (
        <section className="mt-8" data-testid="upcoming-ideas">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Upcoming</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {upcoming.map((idea) => (
              <li key={idea.id}>
                <Link
                  href={`/groups/${id}/ideas/${idea.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="truncate text-sm font-medium text-content">{idea.title}</span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
                    <span>
                      <span aria-hidden>📅</span>{' '}
                      {new Date(`${idea.event_date}T00:00:00`).toLocaleDateString()}
                    </span>
                    {idea.location && (
                      <span className="hidden max-w-[10rem] truncate sm:inline">
                        <span aria-hidden>📍</span> {idea.location}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Ideas ({ideas.length})
          </h3>
          <Link
            href={`/groups/${id}/ideas/new`}
            className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            New idea
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="idea-filters">
          <FilterChip
            href={filterHref(id, { category: filters.category })}
            active={!filters.status}
            label="Any status"
          />
          {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((status) => (
            <FilterChip
              key={status}
              href={filterHref(id, { status, category: filters.category })}
              active={filters.status === status}
              label={STATUS_LABELS[status]}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          <FilterChip
            href={filterHref(id, { status: filters.status })}
            active={!filters.category}
            label="Any category"
          />
          {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map((category) => (
            <FilterChip
              key={category}
              href={filterHref(id, { status: filters.status, category })}
              active={filters.category === category}
              label={CATEGORY_LABELS[category]}
            />
          ))}
        </div>

        {ideas.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-line px-6 py-8 text-center">
            <p className="text-sm font-medium text-content">
              {hasFilters ? 'Nothing matches these filters' : 'No ideas yet'}
            </p>
            <p className="mt-1 text-sm text-muted">
              {hasFilters
                ? 'Try clearing a filter.'
                : 'Add the first idea — a place to eat, something to do, anything.'}
            </p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2" data-testid="idea-list">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <Link
                  href={`/groups/${id}/ideas/${idea.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-line hover:bg-surface-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-content">{idea.title}</span>
                    <span className="text-xs text-muted">
                      by {idea.proposer?.display_name ?? 'someone'} ·{' '}
                      {new Date(idea.created_at).toLocaleDateString()}
                    </span>
                    {(idea.event_date || idea.location) && (
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                        {idea.event_date && (
                          <span>
                            <span aria-hidden>📅</span>{' '}
                            {new Date(`${idea.event_date}T00:00:00`).toLocaleDateString()}
                          </span>
                        )}
                        {idea.location && (
                          <span className="truncate">
                            <span aria-hidden>📍</span> {idea.location}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {(voteCounts[idea.id] ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted"
                        data-testid="idea-vote-count"
                        title={`${voteCounts[idea.id]} upvote(s)`}
                      >
                        <span aria-hidden>❤</span>
                        {voteCounts[idea.id]}
                      </span>
                    )}
                    {(commentCounts[idea.id] ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted"
                        data-testid="idea-comment-count"
                        title={`${commentCounts[idea.id]} comment(s)`}
                      >
                        <span aria-hidden>💬</span>
                        {commentCounts[idea.id]}
                      </span>
                    )}
                    <CategoryBadge category={idea.category} />
                    <StatusBadge status={idea.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Members ({members.length})
        </h3>
        <ul className="mt-3 flex flex-col gap-2" data-testid="member-list">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-content">
                  {member.profile.display_name}
                  {member.userId === user.id && <span className="ml-1 text-faint">(you)</span>}
                </span>
                <span className="text-xs text-muted">@{member.profile.username}</span>
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

      <section className="mt-10 border-t border-line pt-6">
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
