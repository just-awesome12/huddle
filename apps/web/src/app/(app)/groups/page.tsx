import Link from 'next/link';
import { fetchMyGroups } from '@huddle/api-client/groups';
import { fetchMyPendingInvites, peekInvite } from '@huddle/api-client/invites';
import { fetchGroupIdeas, type IdeaWithProposer } from '@huddle/api-client/ideas';
import { getSupabaseServerClient } from '@/lib/supabase';
import { RoleBadge } from '@/components/RoleBadge';
import { groupEmoji, groupSoftBg } from '@/lib/group-visuals';

function greetingWord(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default async function GroupsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const groups = await fetchMyGroups(supabase);

  // Greeting name — cheap direct read (no "my profile" fetcher exists).
  let firstName = (user?.email ?? 'there').split('@')[0] ?? 'there';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.display_name) firstName = profile.display_name.split(' ')[0] ?? firstName;
  }

  // Invites addressed to me (add-by-username). Names come from peek_invite
  // — RLS hides the groups table from non-members.
  const pendingInvites = await fetchMyPendingInvites(supabase);
  const pendingWithNames = await Promise.all(
    pendingInvites.map(async (invite) => {
      try {
        const peek = await peekInvite(supabase, invite.token);
        return { invite, groupName: peek.group_name };
      } catch {
        return null; // revoked between queries — just skip it
      }
    }),
  );
  const invitesForMe = pendingWithNames.filter((x) => x !== null);

  // "Up next" — upcoming dated on-radar ideas across the user's groups
  // (bounded fan-out). YYYY-MM-DD string compare is chronological.
  const todayStr = new Date().toLocaleDateString('en-CA');
  const upcomingLists = await Promise.all(
    groups.slice(0, 10).map(async (g) => {
      try {
        const ideas = await fetchGroupIdeas(supabase, g.id);
        return ideas
          .filter((i) => i.status === 'on_radar' && i.event_date && i.event_date >= todayStr)
          .map((i) => ({ idea: i, groupId: g.id, groupName: g.name }));
      } catch {
        return [] as { idea: IdeaWithProposer; groupId: string; groupName: string }[];
      }
    }),
  );
  const upNext = upcomingLists
    .flat()
    .sort((a, b) => (a.idea.event_date! < b.idea.event_date! ? -1 : 1))
    .slice(0, 4);

  const subBits = [
    `${groups.length} ${groups.length === 1 ? 'huddle' : 'huddles'}`,
    invitesForMe.length > 0
      ? `${invitesForMe.length} ${invitesForMe.length === 1 ? 'invite' : 'invites'} waiting`
      : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1080px]">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[clamp(26px,3.4vw,36px)] font-black tracking-[-0.02em] text-content">
            {greetingWord()}, {firstName} 👋
          </h1>
          <p className="mt-2 text-[16px] text-muted">{subBits.join(' · ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-3 font-display text-[14.5px] font-extrabold text-content transition-colors hover:bg-surface-2"
          >
            🧭 Discover
          </Link>
          <Link
            href="/groups/new"
            className="inline-flex items-center gap-2 rounded-full bg-accent-600 px-5 py-3 font-display text-[14.5px] font-extrabold text-white transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: '0 14px 26px -12px var(--color-accent-600)' }}
          >
            Start a huddle
          </Link>
        </div>
      </div>

      {/* Invites */}
      {invitesForMe.length > 0 && (
        <section className="mt-7">
          <div className="font-display text-[12px] font-extrabold uppercase tracking-[0.12em] text-accent-400">
            Invites for you ({invitesForMe.length})
          </div>
          <ul className="mt-3 flex flex-col gap-[10px]" data-testid="pending-invites">
            {invitesForMe.map(({ invite, groupName }) => (
              <li key={invite.id}>
                <div
                  className="flex items-center gap-[14px] rounded-[18px] border border-line bg-surface px-[18px] py-[14px]"
                  style={{ boxShadow: '0 16px 30px -22px rgba(38,33,92,.32)' }}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-accent-50 text-[22px]">
                    {groupEmoji(invite.group_id)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-display text-[16px] font-extrabold text-content">
                      {groupName}
                    </span>
                    <span className="text-[13px] text-muted">
                      Invited by {invite.inviter?.display_name ?? 'someone'}
                    </span>
                  </div>
                  <Link
                    href={`/invites/${invite.token}`}
                    className="rounded-full bg-brand-600 px-[18px] py-[9px] font-display text-[13.5px] font-extrabold text-white transition-colors hover:bg-brand-700"
                  >
                    View invite
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Your huddles */}
      <div className="mt-9 flex items-center justify-between">
        <h2 className="font-display text-[20px] font-black text-content">Your huddles</h2>
        <span className="text-[13.5px] font-bold text-muted">
          {groups.length} {groups.length === 1 ? 'huddle' : 'huddles'}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="mt-4 rounded-[22px] border-2 border-dashed border-line px-6 py-12 text-center">
          <p className="font-display text-[15px] font-extrabold text-content">No groups yet</p>
          <p className="mt-1 text-sm text-muted">
            Create a huddle to start collecting ideas with your people.
          </p>
        </div>
      ) : (
        <div
          className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="group-list"
        >
          {groups.map((group) => (
            <Link
              key={group.id}
              href={`/groups/${group.id}`}
              className="group flex flex-col gap-4 rounded-[22px] border border-line bg-surface p-5 transition-transform hover:-translate-y-[3px]"
              style={{ boxShadow: '0 16px 30px -22px rgba(38,33,92,.32)' }}
            >
              <div className="flex items-start gap-[13px]">
                <span
                  className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[15px] text-[26px]"
                  style={{ background: groupSoftBg(group.id) }}
                >
                  {groupEmoji(group.id)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[18px] font-black text-content">
                    {group.name}
                  </div>
                </div>
                <RoleBadge role={group.myRole} />
              </div>
              <div className="flex items-center justify-between border-t border-line pt-[14px]">
                <span className="text-[13.5px] font-bold text-muted">Open this huddle</span>
                <span className="font-display text-[13.5px] font-extrabold text-brand-ink">
                  Open →
                </span>
              </div>
            </Link>
          ))}

          <Link
            href="/groups/new"
            className="flex min-h-[170px] flex-col items-center justify-center gap-[10px] rounded-[22px] border-2 border-dashed border-line text-muted transition-colors hover:border-accent-400 hover:text-accent-400"
          >
            <span className="grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-surface-2 text-2xl">
              +
            </span>
            <span className="font-display text-[14.5px] font-extrabold">New huddle</span>
          </Link>
        </div>
      )}

      {/* Up next */}
      {upNext.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-[14px] font-display text-[20px] font-black text-content">Up next</h2>
          <div className="flex flex-col gap-[10px]">
            {upNext.map(({ idea, groupId, groupName }) => {
              const d = new Date(`${idea.event_date}T00:00:00`);
              return (
                <Link
                  key={idea.id}
                  href={`/groups/${groupId}/ideas/${idea.id}`}
                  className="flex items-center gap-[14px] rounded-[16px] border border-line bg-surface px-4 py-[13px]"
                  style={{ boxShadow: '0 16px 30px -22px rgba(38,33,92,.32)' }}
                >
                  <span className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-[13px] bg-brand-50">
                    <span className="font-display text-[18px] font-black leading-none text-brand-ink">
                      {d.getDate()}
                    </span>
                    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-brand-ink">
                      {d.toLocaleString('en-US', { month: 'short' })}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[15.5px] font-extrabold text-content">
                      {idea.title}
                    </div>
                    <div className="text-[13px] text-muted">{groupName}</div>
                  </div>
                  {idea.location && (
                    <span className="hidden text-[13px] text-faint sm:inline">{idea.location}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
