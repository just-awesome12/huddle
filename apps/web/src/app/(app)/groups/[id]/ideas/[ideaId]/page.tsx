import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroupMembers } from '@huddle/api-client/groups';
import { fetchIdea, type IdeaWithProposer } from '@huddle/api-client/ideas';
import { getSupabaseServerClient } from '@/lib/supabase';
import { setIdeaStatusAction, deleteIdeaAction } from '@/actions/ideas';
import { CategoryBadge, StatusBadge } from '@/components/IdeaBadges';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';
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

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/groups/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        &larr; Back to ideas
      </Link>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-medium" data-testid="idea-title">
            {idea.title}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <CategoryBadge category={idea.category} />
            <StatusBadge status={idea.status} />
          </div>
        </div>

        <p className="mt-1 text-sm text-slate-500">
          Proposed by {idea.proposer?.display_name ?? 'someone'} on{' '}
          {new Date(idea.created_at).toLocaleDateString()}
        </p>

        {idea.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">
            {idea.description}
          </p>
        )}

        {idea.link && (
          <a
            href={idea.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block break-all text-sm font-medium text-slate-900 underline"
          >
            {idea.link}
          </a>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
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
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
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
    </div>
  );
}
