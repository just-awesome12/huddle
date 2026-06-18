import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroup } from '@huddle/api-client/groups';
import { getSupabaseServerClient } from '@/lib/supabase';
import { IdeaForm } from '@/components/IdeaForm';

export default async function NewIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  let groupName: string;
  try {
    const group = await fetchGroup(supabase, id);
    groupName = group.name;
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-md">
      <Link href={`/groups/${id}`} className="text-sm text-muted hover:text-content">
        &larr; Back to {groupName}
      </Link>
      <h2 className="mt-4 text-xl font-medium">Add an idea</h2>
      <div className="mt-6">
        <IdeaForm groupId={id} />
      </div>
    </div>
  );
}
