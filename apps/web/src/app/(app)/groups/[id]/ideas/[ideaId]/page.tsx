import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroupMembers } from '@huddle/api-client/groups';
import { fetchIdea, getIdeaPhotoUrl, type IdeaWithProposer } from '@huddle/api-client/ideas';
import { fetchGroupVoteState } from '@huddle/api-client/votes';
import { fetchIdeaComments, type CommentWithAuthor } from '@huddle/api-client/comments';
import { fetchIdeaRsvps, type IdeaRsvp, type RsvpStatus } from '@huddle/api-client/rsvps';
import {
  fetchGroupReactions,
  reactionTargetKey,
  type ReactionSummary,
} from '@huddle/api-client/reactions';
import { ReactionBar } from '@/components/ReactionBar';
import { getSupabaseServerClient } from '@/lib/supabase';
import { setIdeaStatusAction, deleteIdeaAction } from '@/actions/ideas';
import { setRsvpAction, removeRsvpAction } from '@/actions/rsvps';
import { blockUserAction } from '@/actions/moderation';
import { toggleVoteAction } from '@/actions/votes';
import { deleteCommentAction } from '@/actions/comments';
import { CategoryBadge, StatusBadge } from '@/components/IdeaBadges';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';
import { ReportIdeaForm } from '@/components/ReportIdeaForm';
import { AddCommentForm } from '@/components/AddCommentForm';
import { AddToCalendar } from '@/components/AddToCalendar';
import { VoteButton } from '@/components/VoteButton';
import { GroupRealtime } from '@/components/GroupRealtime';
import { MentionText } from '@/components/MentionText';
import { Button } from '@/components/Button';
import { personColor } from '@/lib/group-visuals';
import type { IdeaCategory } from '@huddle/validation';

const CATEGORY_EMOJI: Record<IdeaCategory, string> = {
  food: '🌮',
  activity: '🎳',
  place: '📍',
  event: '🎬',
  other: '💡',
};

export default async function IdeaDetailPage({
  params,
}: {
  params: Promise<{ id: string; ideaId: string }>;
}) {
  const { id, ideaId } = await params;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  let idea: IdeaWithProposer;
  let isAdmin = false;
  try {
    idea = await fetchIdea(supabase, ideaId);
    if (idea.group_id !== id) notFound();
    const members = await fetchGroupMembers(supabase, id);
    isAdmin = members.find((m) => m.userId === user.id)?.role === 'admin';
  } catch {
    notFound();
  }

  // UI convention only — RLS allows any member to edit (Phase 1 model,
  // upheld in Phase 5). Delete IS RLS-enforced to proposer/admin.
  const canManage = isAdmin || idea.proposed_by === user.id;

  const statusAction = setIdeaStatusAction.bind(null, id, ideaId);

  // Vote state (Phase 11). Best-effort — render zero if it fails.
  let voteCount = 0;
  let voted = false;
  try {
    const votes = await fetchGroupVoteState(supabase, id, user.id);
    voteCount = votes.countByIdea[ideaId] ?? 0;
    voted = votes.myVotes.includes(ideaId);
  } catch {
    // leave defaults
  }
  const voteAction = toggleVoteAction.bind(null, id, ideaId, voted);

  // Comments (Phase 11). Best-effort — empty thread if it fails.
  let comments: CommentWithAuthor[] = [];
  try {
    comments = await fetchIdeaComments(supabase, ideaId);
  } catch {
    // leave empty
  }

  // RSVPs (Phase 13). Best-effort.
  let rsvps: IdeaRsvp[] = [];
  try {
    rsvps = await fetchIdeaRsvps(supabase, ideaId);
  } catch {
    // leave empty
  }
  const myRsvp: RsvpStatus | null = rsvps.find((r) => r.userId === user.id)?.status ?? null;
  const going = rsvps.filter((r) => r.status === 'going');
  const rsvpOptions: [RsvpStatus, string][] = [
    ['going', "✅ I'm in"],
    ['maybe', '🤔 Maybe'],
    ['not_going', "🙅 Can't"],
  ];

  // Reactions (Phase 13). Best-effort; keyed by `${type}:${id}`.
  let reactions: Record<string, ReactionSummary[]> = {};
  try {
    reactions = await fetchGroupReactions(supabase, id, user.id);
  } catch {
    // leave empty
  }
  const reactionPath = `/groups/${id}/ideas/${ideaId}`;

  // Private bucket → short-lived signed URL, minted per render.
  let photoUrl: string | null = null;
  if (idea.photo_path) {
    try {
      photoUrl = await getIdeaPhotoUrl(supabase, idea.photo_path);
    } catch {
      // Render without the photo rather than failing the page.
    }
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <GroupRealtime groupId={id} />
      <Link
        href={`/groups/${id}`}
        className="font-display text-[13.5px] font-extrabold text-muted hover:text-content"
      >
        ← Back to ideas
      </Link>

      {/* ===== Hero card ===== */}
      <div
        className="mt-4 rounded-[24px] border border-line bg-surface p-7"
        style={{ boxShadow: '0 16px 30px -22px rgba(38,33,92,.32)' }}
      >
        <div className="flex items-start gap-[18px]">
          <span className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[20px] bg-accent-50 text-[38px]">
            {CATEGORY_EMOJI[idea.category]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-[9px]">
              <StatusBadge status={idea.status} />
              <CategoryBadge category={idea.category} />
            </div>
            <h1
              className="mt-3 font-display text-[clamp(24px,3.2vw,30px)] font-black tracking-[-0.01em] text-content"
              data-testid="idea-title"
            >
              {idea.title}
            </h1>
            <div className="mt-[10px] flex items-center gap-[9px]">
              <span
                aria-hidden
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-display text-[11px] font-extrabold text-white"
                style={{ background: personColor(idea.proposed_by ?? idea.id) }}
              >
                {(idea.proposer?.display_name?.[0] ?? '?').toUpperCase()}
              </span>
              <span className="text-[13.5px] font-bold text-muted">
                Proposed by {idea.proposer?.display_name ?? 'someone'}
              </span>
            </div>
          </div>
        </div>

        {photoUrl && (
          <img
            src={photoUrl}
            alt={`Photo for ${idea.title}`}
            data-testid="idea-photo"
            className="mt-5 max-h-96 w-full rounded-[16px] border border-line object-cover"
          />
        )}

        {idea.description && (
          <p className="mt-5 whitespace-pre-wrap text-[16px] leading-[1.6] text-content">
            {idea.description}
          </p>
        )}

        {idea.link && (
          <a
            href={idea.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block break-all font-display text-sm font-extrabold text-brand-ink underline"
          >
            {idea.link}
          </a>
        )}

        {(idea.event_date || idea.location) && (
          <div className="mt-[18px] flex flex-wrap gap-[10px]" data-testid="idea-details">
            {idea.event_date && (
              <span
                className="inline-flex items-center gap-[7px] rounded-[12px] bg-surface-2 px-[14px] py-[9px] text-[13.5px] font-bold text-muted"
                data-testid="idea-date"
              >
                📅 {new Date(`${idea.event_date}T00:00:00`).toLocaleDateString()}
              </span>
            )}
            {idea.location && (
              <span
                className="inline-flex items-center gap-[7px] rounded-[12px] bg-surface-2 px-[14px] py-[9px] text-[13.5px] font-bold text-muted"
                data-testid="idea-location"
              >
                📍 {idea.location}
              </span>
            )}
          </div>
        )}

        {idea.event_date && (
          <AddToCalendar
            event={{
              title: idea.title,
              date: idea.event_date,
              location: idea.location,
              details: idea.description,
            }}
          />
        )}

        <div className="mt-[22px] flex flex-wrap items-center gap-[14px] border-t border-line pt-5">
          <VoteButton action={voteAction} voted={voted} count={voteCount} />
        </div>

        <div className="mt-3">
          <ReactionBar
            groupId={id}
            targetType="idea"
            targetId={ideaId}
            summaries={reactions[reactionTargetKey('idea', ideaId)] ?? []}
            path={reactionPath}
          />
        </div>

        {/* Who's in? — RSVP */}
        <div className="mt-[22px] border-t border-line pt-5" data-testid="rsvp">
          <p className="font-display text-[13px] font-extrabold uppercase tracking-[0.12em] text-muted">
            Who&apos;s in?{going.length > 0 ? ` · ${going.length} going` : ''}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {rsvpOptions.map(([status, label]) => (
              <form key={status} action={setRsvpAction}>
                <input type="hidden" name="ideaId" value={ideaId} />
                <input type="hidden" name="groupId" value={id} />
                <input type="hidden" name="status" value={status} />
                <button
                  type="submit"
                  data-testid={`rsvp-${status}`}
                  className={`rounded-full px-4 py-2 font-display text-sm font-bold transition-colors ${
                    myRsvp === status
                      ? 'bg-accent-600 text-white'
                      : 'bg-surface-2 text-muted hover:bg-line'
                  }`}
                >
                  {label}
                </button>
              </form>
            ))}
            {myRsvp && (
              <form action={removeRsvpAction}>
                <input type="hidden" name="ideaId" value={ideaId} />
                <input type="hidden" name="groupId" value={id} />
                <button
                  type="submit"
                  data-testid="rsvp-clear"
                  className="text-sm font-medium text-muted hover:text-content"
                >
                  Clear
                </button>
              </form>
            )}
          </div>
          {going.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="rsvp-going-list">
              {going.map((r) => (
                <span
                  key={r.userId}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[13px] text-content"
                >
                  <span
                    aria-hidden
                    className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold text-white"
                    style={{ background: personColor(r.userId) }}
                  >
                    {(r.profile.display_name[0] ?? '?').toUpperCase()}
                  </span>
                  {r.profile.display_name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {idea.status !== 'done' && (
            <form action={statusAction}>
              <input type="hidden" name="status" value="done" />
              <Button type="submit" variant="secondary">
                Mark done
              </Button>
            </form>
          )}
          {idea.status !== 'dismissed' && (
            <form action={statusAction}>
              <input type="hidden" name="status" value="dismissed" />
              <Button type="submit" variant="ghost">
                Dismiss
              </Button>
            </form>
          )}
          {idea.status !== 'on_radar' && (
            <form action={statusAction}>
              <input type="hidden" name="status" value="on_radar" />
              <Button type="submit" variant="secondary">
                Back on the radar
              </Button>
            </form>
          )}
        </div>
      </div>

      {canManage && (
        <div className="mt-6 flex items-center gap-4">
          <Link
            href={`/groups/${id}/ideas/${ideaId}/edit`}
            className="font-display text-sm font-extrabold text-muted hover:text-brand-ink"
          >
            Edit idea
          </Link>
          <ConfirmActionForm
            action={deleteIdeaAction}
            fields={{ groupId: id, ideaId }}
            buttonLabel="Delete idea"
            confirmPrompt="Delete this idea? This cannot be undone."
            confirmLabel="Delete idea"
            variant="secondary"
          />
        </div>
      )}

      <section className="mt-8" data-testid="comments">
        <h3 className="font-display text-[18px] font-black text-content">
          Comments ({comments.length})
        </h3>

        {idea.status === 'done' && (
          <p
            className="mt-3 rounded-[12px] bg-surface-2 px-4 py-3 text-sm text-content"
            data-testid="completion-prompt"
          >
            How was it? Drop a quick note for the group — what to remember for next time.
          </p>
        )}

        {comments.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No comments yet. Start the discussion.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3" data-testid="comment-list">
            {comments.map((comment) => {
              const canDelete = comment.author?.id === user.id || isAdmin;
              return (
                <li key={comment.id} className="flex gap-3">
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-[13px] font-extrabold text-white"
                    style={{ background: personColor(comment.author?.id ?? comment.id) }}
                  >
                    {(comment.author?.display_name?.[0] ?? '?').toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1 rounded-[16px] rounded-tl-[4px] border border-line bg-surface px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-display text-[13.5px] font-extrabold text-content">
                        {comment.author?.display_name ?? 'A former member'}
                      </span>
                      <span className="text-xs text-faint">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[14.5px] leading-[1.5] text-muted">
                      <MentionText text={comment.body} />
                    </p>
                    <div className="mt-2">
                      <ReactionBar
                        groupId={id}
                        targetType="comment"
                        targetId={comment.id}
                        summaries={reactions[reactionTargetKey('comment', comment.id)] ?? []}
                        path={reactionPath}
                      />
                    </div>
                    {canDelete && (
                      <form
                        action={deleteCommentAction.bind(null, id, ideaId, comment.id)}
                        className="mt-2"
                      >
                        <button
                          type="submit"
                          aria-label="Delete comment"
                          className="text-xs font-medium text-muted hover:text-red-700"
                        >
                          Delete
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <AddCommentForm ideaId={ideaId} groupId={id} />
      </section>

      {/* Moderation (OQ-5): report the content, or block its author.
          Only for other people's ideas. */}
      {idea.proposed_by && idea.proposed_by !== user.id && (
        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-6">
          <ReportIdeaForm ideaId={ideaId} />
          <ConfirmActionForm
            action={blockUserAction}
            fields={{ groupId: id, blockedId: idea.proposed_by }}
            buttonLabel={`Block @${idea.proposer?.username ?? 'this user'}`}
            confirmPrompt="Block this person? You won't see their ideas anymore. You can undo this in Account."
            confirmLabel="Block"
            variant="secondary"
          />
        </div>
      )}
    </div>
  );
}
