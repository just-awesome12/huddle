import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  fetchGroup,
  fetchGroupMembers,
  fetchJoinRequests,
  type GroupMemberWithProfile,
} from '@huddle/api-client/groups';
import { fetchGroupIdeas, type IdeaFilters, type IdeaWithProposer } from '@huddle/api-client/ideas';
import {
  fetchGroupActivity,
  type ActivityItem,
  type ActivityKind,
} from '@huddle/api-client/activity';
import { fetchGroupVoteState } from '@huddle/api-client/votes';
import { fetchGroupMute } from '@huddle/api-client/push';
import { fetchGroupRsvpState } from '@huddle/api-client/rsvps';
import { fetchGroupCommentCounts } from '@huddle/api-client/comments';
import { ideaFiltersSchema, type IdeaCategory } from '@huddle/validation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { leaveGroupAction, removeMemberAction } from '@/actions/groups';
import { addStarterIdeasAction } from '@/actions/ideas';
import { RoleBadge } from '@/components/RoleBadge';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';
import { GroupRealtime } from '@/components/GroupRealtime';
import { GroupPresence } from '@/components/GroupPresence';
import { GroupMuteToggle } from '@/components/GroupMuteToggle';
import { QuickAddIdea } from '@/components/QuickAddIdea';
import {
  CategoryBadge,
  StatusBadge,
  CATEGORY_LABELS,
  STATUS_LABELS,
} from '@/components/IdeaBadges';
import { groupEmojiFor, groupColorFor, personColor } from '@/lib/group-visuals';

const CATEGORY_EMOJI: Record<IdeaCategory, string> = {
  food: '🌮',
  activity: '🎳',
  place: '📍',
  event: '🎬',
  other: '💡',
};

const ACTIVITY_META: Record<ActivityKind, { emoji: string; verb: string }> = {
  idea_added: { emoji: '💡', verb: 'added' },
  idea_voted: { emoji: '❤', verb: 'loved' },
  comment_added: { emoji: '💬', verb: 'commented on' },
  picker_ran: { emoji: '🎲', verb: 'ran the picker →' },
  member_joined: { emoji: '👋', verb: 'joined the huddle' },
};

/** Compact relative time ("just now", "5m ago", "3d ago", then a date). */
function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

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
      className={`whitespace-nowrap rounded-full px-4 py-2 font-display text-[13px] font-extrabold transition-colors ${
        active ? 'bg-brand-600 text-white' : 'bg-surface-2 text-muted hover:brightness-95'
      }`}
    >
      {label}
    </Link>
  );
}

function MiniAvatar({
  seed,
  initial,
  ring,
  avatarUrl,
}: {
  seed: string;
  initial: string;
  ring?: boolean;
  avatarUrl?: string | null;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        aria-hidden
        className={`h-8 w-8 shrink-0 rounded-full object-cover ${ring ? 'ring-2 ring-white/60' : ''}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`grid h-8 w-8 place-items-center rounded-full font-display text-[11px] font-extrabold text-white ${ring ? 'ring-2 ring-white/60' : ''}`}
      style={{ background: personColor(seed) }}
    >
      {initial}
    </span>
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

  const parsedFilters = ideaFiltersSchema.safeParse(rawFilters);
  const filters: IdeaFilters = parsedFilters.success ? parsedFilters.data : {};

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

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

  // A public group's row is now visible to non-members (discovery), but the
  // hub is for members only — bounce non-members to the discovery flow,
  // where they can request to join. (invite_only groups already 404'd above
  // because fetchGroup throws for non-members.)
  const myMembership = members.find((m) => m.userId === user.id);
  if (!myMembership) {
    redirect('/discover');
  }
  const isAdmin = myMembership.role === 'admin';
  const hasFilters = !!(filters.status || filters.category);

  let voteCounts: Record<string, number> = {};
  let commentCounts: Record<string, number> = {};
  let goingByIdea: Record<string, number> = {};
  try {
    voteCounts = (await fetchGroupVoteState(supabase, id, user.id)).countByIdea;
    commentCounts = await fetchGroupCommentCounts(supabase, id);
    goingByIdea = (await fetchGroupRsvpState(supabase, id, user.id)).goingByIdea;
  } catch {
    // leave empty
  }

  let activity: ActivityItem[] = [];
  try {
    activity = await fetchGroupActivity(supabase, id, 8);
  } catch {
    // leave empty
  }

  // Admins see a pending-join-request count (public groups).
  let pendingRequestCount = 0;
  if (isAdmin) {
    try {
      pendingRequestCount = (await fetchJoinRequests(supabase, id)).length;
    } catch {
      // leave 0
    }
  }

  // Per-group push mute (15b) — the member's own setting.
  let muted = false;
  try {
    muted = await fetchGroupMute(supabase, id);
  } catch {
    // leave false
  }

  const onRadarCount = ideas.filter((i) => i.status === 'on_radar').length;
  const todayStr = new Date().toLocaleDateString('en-CA');
  const upcoming = ideas
    .filter((i) => i.status === 'on_radar' && i.event_date && i.event_date >= todayStr)
    .sort((a, b) => (a.event_date! < b.event_date! ? -1 : 1));
  const doAgain = ideas
    .filter((i) => i.status === 'done')
    .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1))
    .slice(0, 3);
  const reignite = ideas
    .filter((i) => i.status === 'on_radar' && (voteCounts[i.id] ?? 0) > 0)
    .sort((a, b) => (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0))
    .slice(0, 3);

  const accent = groupColorFor(id, group.color);
  const bannerGradient = `linear-gradient(140deg, var(--color-brand-900) 0%, var(--color-brand-800) 48%, ${accent} 120%)`;

  return (
    <div className="-mx-6 -my-8 md:-mx-8">
      <GroupRealtime groupId={id} />

      {/* ===== Gradient banner ===== */}
      <div
        className="relative overflow-hidden px-6 pb-7 pt-8 text-white md:px-8"
        style={{ background: bannerGradient }}
      >
        {group.cover_photo_path && (
          <>
            <img
              src={group.cover_photo_path}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'linear-gradient(140deg, rgba(20,16,48,.78), rgba(20,16,48,.45))',
              }}
            />
          </>
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute right-[6%] top-[-50px] h-[200px] w-[200px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(212,83,126,.4), transparent 70%)',
            animation: 'hud-float 10s ease-in-out infinite',
          }}
        />
        <div className="relative mx-auto max-w-[1080px]">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-[62px] w-[62px] shrink-0 place-items-center rounded-[18px] bg-white/15 text-[30px]">
              {groupEmojiFor(id, group.emoji)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-[11px]">
                <h1
                  className="font-display text-[clamp(26px,3.2vw,34px)] font-black tracking-[-0.02em]"
                  data-testid="group-name"
                >
                  {group.name}
                </h1>
                {myMembership && (
                  <span className="rounded-full bg-white/15 px-[11px] py-[5px] font-display text-[11.5px] font-extrabold uppercase tracking-[0.06em]">
                    {myMembership.role}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-brand-100">
                <span>
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </span>
                <span
                  className="rounded-full bg-white/15 px-2.5 py-0.5 font-display text-[11px] font-extrabold uppercase tracking-[0.06em]"
                  data-testid="visibility-badge"
                >
                  {group.visibility === 'public' ? '🌍 Public' : '🔒 Invite-only'}
                </span>
                {group.location && <span>📍 {group.location}</span>}
              </div>
              {group.description && (
                <p className="mt-2 max-w-[60ch] text-[14px] text-brand-100/90">
                  {group.description}
                </p>
              )}
              {group.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-white/10 px-2.5 py-0.5 text-[12px] font-medium text-white/90"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden -space-x-2 sm:flex">
                {members.slice(0, 4).map((m) => (
                  <MiniAvatar
                    key={m.userId}
                    seed={m.userId}
                    initial={(m.profile.display_name[0] ?? '?').toUpperCase()}
                    avatarUrl={m.profile.avatar_url}
                    ring
                  />
                ))}
              </span>
              <GroupPresence
                groupId={id}
                me={{ userId: user.id, displayName: myMembership.profile.display_name }}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={`/groups/${id}/picker`}
              data-testid="picker-link"
              className="inline-flex items-center gap-[9px] rounded-full bg-accent-600 px-6 py-[13px] font-display text-[15.5px] font-black text-white transition-transform hover:-translate-y-0.5"
              style={{ boxShadow: '0 16px 30px -12px var(--color-accent-600)' }}
            >
              🎲 Pick for us
            </Link>
            <Link
              href={`/groups/${id}/ideas/new`}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-[13px] font-display text-[15px] font-extrabold text-white transition-colors hover:bg-white/20"
            >
              + New idea
            </Link>
            <Link
              href={`/groups/${id}/wall`}
              data-testid="wall-link"
              className="rounded-full border border-white/25 px-5 py-[13px] font-display text-[15px] font-extrabold text-white transition-colors hover:bg-white/10"
            >
              Wall
            </Link>
            <Link
              href={`/groups/${id}/history`}
              data-testid="history-link"
              className="rounded-full border border-white/25 px-5 py-[13px] font-display text-[15px] font-extrabold text-white transition-colors hover:bg-white/10"
            >
              History
            </Link>
            <GroupMuteToggle groupId={id} initialMuted={muted} />
            {isAdmin && (
              <>
                <Link
                  href={`/groups/${id}/invite`}
                  className="rounded-full border border-white/25 px-5 py-[13px] font-display text-[15px] font-extrabold text-white transition-colors hover:bg-white/10"
                >
                  Invite
                </Link>
                {pendingRequestCount > 0 && (
                  <Link
                    href={`/groups/${id}/settings`}
                    data-testid="requests-link"
                    className="inline-flex items-center gap-2 rounded-full bg-accent-600 px-5 py-[13px] font-display text-[15px] font-extrabold text-white transition-transform hover:-translate-y-0.5"
                  >
                    Requests
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[12px] font-black text-accent-600">
                      {pendingRequestCount}
                    </span>
                  </Link>
                )}
                <Link
                  href={`/groups/${id}/settings`}
                  className="rounded-full border border-white/25 px-5 py-[13px] font-display text-[15px] font-extrabold text-white transition-colors hover:bg-white/10"
                >
                  Settings
                </Link>
              </>
            )}
            <span className="ml-auto inline-flex items-center gap-[9px] rounded-full border border-white/20 bg-white/10 px-4 py-[9px] font-display text-[13.5px] font-extrabold">
              <span
                className="h-2 w-2 rounded-full bg-online"
                style={{ animation: 'hud-pulse 1.8s ease-in-out infinite' }}
              />
              {onRadarCount} ideas in play
            </span>
          </div>
        </div>
      </div>

      {/* ===== Body ===== */}
      <div className="mx-auto max-w-[1080px] px-6 pb-20 pt-6 md:px-8">
        {/* What's happening — activity feed */}
        {activity.length > 0 && (
          <section className="mb-7" data-testid="activity-feed">
            <h3 className="font-display text-[13px] font-extrabold uppercase tracking-[0.12em] text-muted">
              What&apos;s happening
            </h3>
            <ul className="mt-3 flex flex-col gap-1.5">
              {activity.map((a) => {
                const meta = ACTIVITY_META[a.kind];
                const snippet =
                  a.snippet && a.snippet.length > 60 ? `${a.snippet.slice(0, 60)}…` : a.snippet;
                return (
                  <li
                    key={a.id}
                    className="flex items-baseline gap-2 text-[14px] text-content"
                    data-testid="activity-item"
                  >
                    <span aria-hidden className="text-[15px] leading-none">
                      {meta.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-display font-extrabold">{a.actorName}</span>{' '}
                      <span className="text-muted">{meta.verb}</span>
                      {a.ideaTitle ? <span className="font-medium"> {a.ideaTitle}</span> : null}
                      {a.kind === 'comment_added' && snippet ? (
                        <span className="text-muted"> — “{snippet}”</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted">{timeAgo(a.timestamp)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2" data-testid="idea-filters">
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
          <span className="mx-1 h-5 w-px bg-line" />
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

        <p className="mt-5 font-display text-[13px] font-extrabold uppercase tracking-[0.12em] text-muted">
          Ideas ({ideas.length})
        </p>

        {/* Quick-add (15c) — fast, name-only path; full form is "+ New idea" above */}
        <div className="mt-3">
          <QuickAddIdea groupId={id} />
        </div>

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <section className="mt-4" data-testid="upcoming-ideas">
            <h3 className="font-display text-[13px] font-extrabold uppercase tracking-[0.12em] text-accent-400">
              Upcoming
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {upcoming.map((idea) => (
                <li key={idea.id}>
                  <Link
                    href={`/groups/${id}/ideas/${idea.id}`}
                    className="flex items-center justify-between gap-3 rounded-[16px] border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="truncate font-display text-sm font-extrabold text-content">
                      {idea.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
                      {(goingByIdea[idea.id] ?? 0) > 0 && (
                        <span className="font-bold text-content">✅ {goingByIdea[idea.id]}</span>
                      )}
                      <span>📅 {new Date(`${idea.event_date}T00:00:00`).toLocaleDateString()}</span>
                      {idea.location && (
                        <span className="hidden max-w-[10rem] truncate sm:inline">
                          📍 {idea.location}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Idea list */}
        {ideas.length === 0 ? (
          <div className="mt-4 rounded-[18px] border-2 border-dashed border-line px-6 py-9 text-center">
            <div className="text-[30px]">💭</div>
            <p className="mt-2.5 font-display text-[15px] font-extrabold text-content">
              {hasFilters ? 'Nothing matches this filter' : 'No ideas yet'}
            </p>
            <p className="mt-1 text-[13.5px] text-muted">
              {hasFilters ? 'Try clearing a filter.' : 'A place to eat, something to do, anything.'}
            </p>
            {!hasFilters && (
              <form action={addStarterIdeasAction} className="mt-4">
                <input type="hidden" name="groupId" value={id} />
                <button
                  type="submit"
                  className="rounded-full bg-brand-600 px-4 py-2 font-display text-[13.5px] font-extrabold text-white transition-colors hover:bg-brand-700"
                >
                  ✨ Add starter ideas
                </button>
              </form>
            )}
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3.5" data-testid="idea-list">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <Link
                  href={`/groups/${id}/ideas/${idea.id}`}
                  className="block rounded-[20px] border border-line bg-surface px-[22px] py-5 transition-transform hover:-translate-y-0.5"
                  style={{ boxShadow: '0 16px 30px -22px rgba(38,33,92,.32)' }}
                >
                  <div className="flex items-start gap-[15px]">
                    <span className="text-[34px] leading-none">
                      {CATEGORY_EMOJI[idea.category]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-[19px] font-black text-content">
                        {idea.title}
                      </div>
                      <div className="mt-[5px] flex items-center gap-[9px]">
                        <MiniAvatar
                          seed={idea.proposed_by ?? idea.id}
                          initial={(idea.proposer?.display_name?.[0] ?? '?').toUpperCase()}
                        />
                        <span className="text-[13px] font-bold text-muted">
                          by {idea.proposer?.display_name ?? 'someone'}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={idea.status} />
                  </div>
                  {idea.description && (
                    <p className="mt-[13px] line-clamp-2 text-[14.5px] leading-[1.5] text-muted">
                      {idea.description}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-[10px]">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-[14px] py-[7px] font-display text-[13px] font-extrabold text-muted"
                      data-testid="idea-vote-count"
                    >
                      ▲ {voteCounts[idea.id] ?? 0}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 text-[13px] font-bold text-faint"
                      data-testid="idea-comment-count"
                    >
                      💬 {commentCounts[idea.id] ?? 0}
                    </span>
                    <CategoryBadge category={idea.category} />
                    {idea.event_date && (
                      <span className="text-[12.5px] text-muted">
                        📅 {new Date(`${idea.event_date}T00:00:00`).toLocaleDateString()}
                      </span>
                    )}
                    {idea.location && (
                      <span className="max-w-[12rem] truncate text-[12.5px] text-muted">
                        📍 {idea.location}
                      </span>
                    )}
                    <span className="ml-auto font-display text-[13px] font-extrabold text-brand-ink">
                      Open →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Do it again? */}
        {doAgain.length > 0 && (
          <section className="mt-10" data-testid="do-again">
            <h3 className="font-display text-[13px] font-extrabold uppercase tracking-[0.12em] text-muted">
              Do it again?
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {doAgain.map((idea) => (
                <li key={idea.id}>
                  <Link
                    href={`/groups/${id}/ideas/${idea.id}`}
                    className="flex items-center justify-between gap-3 rounded-[16px] border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="truncate font-display text-sm font-extrabold text-content">
                      {idea.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      done {new Date(idea.updated_at).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Unfinished business */}
        {reignite.length > 0 && (
          <section className="mt-10" data-testid="reignite">
            <h3 className="font-display text-[13px] font-extrabold uppercase tracking-[0.12em] text-muted">
              Unfinished business
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {reignite.map((idea) => (
                <li key={idea.id}>
                  <Link
                    href={`/groups/${id}/ideas/${idea.id}`}
                    className="flex items-center justify-between gap-3 rounded-[16px] border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="truncate font-display text-sm font-extrabold text-content">
                      {idea.title}
                    </span>
                    <span className="shrink-0 text-xs font-extrabold text-muted">
                      ❤ {voteCounts[idea.id]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Members */}
        <h3 className="mt-10 font-display text-[18px] font-black text-content">
          Members ({members.length})
        </h3>
        <ul
          className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="member-list"
        >
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center gap-3 rounded-[16px] border border-line bg-surface px-[14px] py-3"
            >
              <MiniAvatar
                seed={member.userId}
                initial={(member.profile.display_name[0] ?? '?').toUpperCase()}
                avatarUrl={member.profile.avatar_url}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[14px] font-extrabold text-content">
                  {member.profile.display_name}
                  {member.userId === user.id && <span className="ml-1 text-faint">(you)</span>}
                </div>
                <div className="truncate text-xs text-faint">@{member.profile.username}</div>
              </div>
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
            </li>
          ))}
        </ul>

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
    </div>
  );
}
