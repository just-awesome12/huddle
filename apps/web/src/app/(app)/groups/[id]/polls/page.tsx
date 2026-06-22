import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroup, fetchGroupMembers } from '@huddle/api-client/groups';
import { fetchGroupPolls, type PollWithResults } from '@huddle/api-client/polls';
import { getSupabaseServerClient } from '@/lib/supabase';
import { GroupRealtime } from '@/components/GroupRealtime';
import { PollComposer } from '@/components/PollComposer';
import { votePollAction, setPollClosedAction, deletePollAction } from '@/actions/polls';

export default async function GroupPollsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  let group;
  let members;
  let polls: PollWithResults[];
  try {
    group = await fetchGroup(supabase, id);
    members = await fetchGroupMembers(supabase, id);
    polls = await fetchGroupPolls(supabase, id, user.id);
  } catch {
    notFound();
  }

  const myMembership = members.find((m) => m.userId === user.id);
  if (!myMembership) redirect('/discover');
  const isAdmin = myMembership.role === 'admin';

  return (
    <div className="mx-auto max-w-2xl">
      <GroupRealtime groupId={id} />
      <Link href={`/groups/${id}`} className="text-sm text-muted hover:text-content">
        &larr; Back to {group.name}
      </Link>

      <h2 className="mt-4 font-display text-xl font-extrabold text-content">Polls</h2>
      <p className="mt-1 text-sm text-muted">
        Put it to a vote when the group should decide together.
      </p>

      <div className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <PollComposer groupId={id} />
      </div>

      <ul className="mt-6 flex flex-col gap-4" data-testid="poll-list">
        {polls.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            No polls yet. Ask the group something above.
          </li>
        ) : (
          polls.map((poll) => {
            const canManage = poll.createdBy === user.id || isAdmin;
            const closed = poll.closedAt !== null;
            const leadCount = Math.max(0, ...poll.options.map((o) => o.count));
            return (
              <li
                key={poll.id}
                className="rounded-2xl border border-line bg-surface p-4"
                data-testid="poll"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-base font-extrabold text-content">
                    {poll.question}
                  </h3>
                  {closed && (
                    <span className="shrink-0 rounded-full bg-line px-2 py-0.5 text-[11px] font-bold uppercase text-muted">
                      Closed
                    </span>
                  )}
                </div>

                <ul className="mt-3 flex flex-col gap-2">
                  {poll.options.map((opt) => {
                    const mine = poll.myOptionId === opt.id;
                    const pct =
                      poll.totalVotes > 0 ? Math.round((opt.count / poll.totalVotes) * 100) : 0;
                    const leading = opt.count > 0 && opt.count === leadCount;
                    return (
                      <li key={opt.id}>
                        <form action={votePollAction}>
                          <input type="hidden" name="groupId" value={id} />
                          <input type="hidden" name="pollId" value={poll.id} />
                          <input type="hidden" name="optionId" value={opt.id} />
                          <button
                            type="submit"
                            disabled={closed}
                            aria-label={`Vote ${opt.label}`}
                            data-voted={mine ? 'true' : 'false'}
                            className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${
                              mine
                                ? 'border-brand-500 bg-brand-50'
                                : 'border-line bg-surface hover:bg-brand-50'
                            }`}
                          >
                            <span
                              aria-hidden
                              className={`absolute inset-y-0 left-0 ${leading ? 'bg-brand-200/60' : 'bg-line/50'}`}
                              style={{ width: `${pct}%` }}
                            />
                            <span className="relative flex items-center justify-between gap-2">
                              <span className="font-medium text-content">
                                {mine ? '✓ ' : ''}
                                {opt.label}
                              </span>
                              <span className="text-xs text-muted">
                                {opt.count} · {pct}%
                              </span>
                            </span>
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                  <span>
                    {poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}
                  </span>
                  {canManage && (
                    <>
                      <form action={setPollClosedAction}>
                        <input type="hidden" name="groupId" value={id} />
                        <input type="hidden" name="pollId" value={poll.id} />
                        <input type="hidden" name="closed" value={closed ? 'false' : 'true'} />
                        <button type="submit" className="font-semibold hover:text-content">
                          {closed ? 'Reopen' : 'Close'}
                        </button>
                      </form>
                      <form action={deletePollAction}>
                        <input type="hidden" name="groupId" value={id} />
                        <input type="hidden" name="pollId" value={poll.id} />
                        <button type="submit" className="font-semibold hover:text-red-600">
                          Delete
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
