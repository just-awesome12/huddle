import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroupMembers } from '@huddle/api-client/groups';
import {
  fetchIdea,
  getIdeaPhotoUrl,
  type IdeaWithProposer,
} from '@huddle/api-client/ideas';
import { getSupabaseServerClient } from '@/lib/supabase';
import { IdeaForm } from '@/components/IdeaForm';

export default async function EditIdeaPage({
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
    const members = await fetchGroupMembers(supabase, id);
    isAdmin = members.find((m) => m.userId === user.id)?.role === 'admin';
  } catch {
    notFound();
  }
  if (idea.group_id !== id) notFound();

  // UI convention: only the proposer or an admin sees the edit screen
  // (RLS itself allows any member — Phase 1 model, upheld in Phase 5).
  if (!isAdmin && idea.proposed_by !== user.id) {
    redirect(`/groups/${id}/ideas/${ideaId}`);
  }

  let currentPhotoUrl: string | null = null;
  if (idea.photo_path) {
    try {
      currentPhotoUrl = await getIdeaPhotoUrl(supabase, idea.photo_path);
    } catch {
      // Render the form without the thumbnail rather than failing.
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Link
        href={`/groups/${id}/ideas/${ideaId}`}
        className="text-sm text-muted hover:text-content"
      >
        &larr; Back to idea
      </Link>
      <h2 className="mt-4 text-xl font-medium">Edit idea</h2>
      <div className="mt-6">
        <IdeaForm
          groupId={id}
          idea={{
            id: idea.id,
            title: idea.title,
            description: idea.description,
            category: idea.category,
            link: idea.link,
            photoPath: idea.photo_path,
          }}
          currentPhotoUrl={currentPhotoUrl}
        />
      </div>
    </div>
  );
}
