import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  fetchGroup,
  fetchGroupMembers,
  type GroupMemberWithProfile,
} from '@huddle/api-client/groups';
import {
  fetchGroupIdeas,
  type IdeaFilters,
  type IdeaWithProposer,
} from '@huddle/api-client/ideas';
import { ideaFiltersSchema } from '@huddle/validation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { leaveGroupAction, removeMemberAction } from '@/actions/groups';
import { RoleBadge } from '@/components/RoleBadge';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';
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

function FilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-slate-900 text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/groups" className="text-sm text-slate-500 hover:text-slate-700">
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
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Invite
            </Link>
            <Link
              href={`/groups/${id}/settings`}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Settings
            </Link>
          </div>
        )}
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Ideas ({ideas.length})
          </h3>
          <Link
            href={`/groups/${id}/ideas/new`}
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2"
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
          {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map(
            (status) => (
              <FilterChip
                key={status}
                href={filterHref(id, { status, category: filters.category })}
                active={filters.status === status}
                label={STATUS_LABELS[status]}
              />
            ),
          )}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <FilterChip
            href={filterHref(id, { status: filters.status })}
            active={!filters.category}
            label="Any category"
          />
          {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map(
            (category) => (
              <FilterChip
                key={category}
                href={filterHref(id, { status: filters.status, category })}
                active={filters.category === category}
                label={CATEGORY_LABELS[category]}
              />
            ),
          )}
        </div>

        {ideas.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 px-6 py-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              {hasFilters ? 'Nothing matches these filters' : 'No ideas yet'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
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
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {idea.title}
                    </span>
                    <span className="text-xs text-slate-500">
                      by {idea.proposer?.display_name ?? 'someone'} ·{' '}
                      {new Date(idea.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Members ({members.length})
        </h3>
        <ul className="mt-3 flex flex-col gap-2" data-testid="member-list">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-900">
                  {member.profile.display_name}
                  {member.userId === user.id && (
                    <span className="ml-1 text-slate-400">(you)</span>
                  )}
                </span>
                <span className="text-xs text-slate-500">
                  @{member.profile.username}
                </span>
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

      <section className="mt-10 border-t border-slate-200 pt-6">
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
