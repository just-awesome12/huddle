import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroupMembers } from '@huddle/api-client/groups';
import { fetchIdea, getIdeaPhotoUrl, type IdeaWithProposer } from '@huddle/api-client/ideas';
import { fetchGroupVoteState } from '@huddle/api-client/votes';
import { getSupabaseServerClient } from '@/lib/supabase';
import { setIdeaStatusAction, deleteIdeaAction } from '@/actions/ideas';
import { blockUserAction } from '@/actions/moderation';
import { toggleVoteAction } from '@/actions/votes';
import { CategoryBadge, StatusBadge } from '@/components/IdeaBadges';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';
import { ReportIdeaForm } from '@/components/ReportIdeaForm';
import { VoteButton } from '@/components/VoteButton';
import { GroupRealtime } from '@/components/GroupRealtime';
import { Button } from '@/components/Button';

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
    <div className="mx-auto max-w-2xl">
      <GroupRealtime groupId={id} />
      <Link href={`/groups/${id}`} className="text-sm text-muted hover:text-content">
        &larr; Back to ideas
      </Link>

      <div className="mt-4 rounded-lg border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-medium" data-testid="idea-title">
            {idea.title}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <CategoryBadge category={idea.category} />
            <StatusBadge status={idea.status} />
          </div>
        </div>

        <p className="mt-1 text-sm text-muted">
          Proposed by {idea.proposer?.display_name ?? 'someone'} on{' '}
          {new Date(idea.created_at).toLocaleDateString()}
        </p>

        <div className="mt-4">
          <VoteButton action={voteAction} voted={voted} count={voteCount} />
        </div>

        {photoUrl && (
          <img
            src={photoUrl}
            alt={`Photo for ${idea.title}`}
            data-testid="idea-photo"
            className="mt-4 max-h-96 w-full rounded-lg border border-line object-cover"
          />
        )}

        {idea.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-content">{idea.description}</p>
        )}

        {idea.link && (
          <a
            href={idea.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block break-all text-sm font-medium text-brand-ink underline"
          >
            {idea.link}
          </a>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
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
            className="text-sm font-medium text-muted hover:text-brand-ink"
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
