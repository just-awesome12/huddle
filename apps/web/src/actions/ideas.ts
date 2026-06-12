'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createIdeaSchema,
  updateIdeaSchema,
  updateIdeaStatusSchema,
} from '@huddle/validation';
import { isHuddleError } from '@huddle/api-client/errors';
import {
  createIdea,
  updateIdea,
  updateIdeaStatus,
  deleteIdea,
} from '@huddle/api-client/ideas';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { IdeaActionState } from './ideas-state';

export async function createIdeaAction(
  _prev: IdeaActionState,
  formData: FormData,
): Promise<IdeaActionState> {
  const parsed = createIdeaSchema.safeParse({
    groupId: formData.get('groupId'),
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    category: formData.get('category'),
    link: formData.get('link') ?? '',
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await getSupabaseServerClient();
  let ideaId: string;
  try {
    const idea = await createIdea(supabase, {
      groupId: parsed.data.groupId,
      title: parsed.data.title,
      category: parsed.data.category,
      description: parsed.data.description,
      link: parsed.data.link,
    });
    ideaId = idea.id;
  } catch {
    return { formError: 'Could not add the idea. Please try again.' };
  }

  revalidatePath(`/groups/${parsed.data.groupId}`);
  redirect(`/groups/${parsed.data.groupId}/ideas/${ideaId}`);
}

export async function updateIdeaAction(
  _prev: IdeaActionState,
  formData: FormData,
): Promise<IdeaActionState> {
  const groupId = String(formData.get('groupId') ?? '');
  const ideaId = String(formData.get('ideaId') ?? '');

  const parsed = updateIdeaSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    category: formData.get('category'),
    link: formData.get('link') ?? '',
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await getSupabaseServerClient();
  try {
    await updateIdea(supabase, ideaId, {
      title: parsed.data.title,
      // description/link: undefined here means "cleared", so write null
      // explicitly via empty-string → undefined normalisation upstream.
      description: parsed.data.description,
      category: parsed.data.category,
      link: parsed.data.link,
    });
  } catch {
    return { formError: 'Could not save the idea. Please try again.' };
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/ideas/${ideaId}`);
  redirect(`/groups/${groupId}/ideas/${ideaId}`);
}

/**
 * Status changes are bound into plain RSC forms (no useActionState):
 * signature is (groupId, ideaId, formData). Validation failures and
 * RLS rejections both surface as a no-op + revalidate — status is a
 * single enum field with buttons for each legal value, so the only
 * real failure mode is network.
 */
export async function setIdeaStatusAction(
  groupId: string,
  ideaId: string,
  formData: FormData,
): Promise<void> {
  const parsed = updateIdeaStatusSchema.safeParse({
    status: formData.get('status'),
  });
  if (!parsed.success) return;

  const supabase = await getSupabaseServerClient();
  try {
    await updateIdeaStatus(supabase, ideaId, parsed.data.status);
  } catch {
    // Surfacing inline errors here would need a client component per
    // button row; a silent no-op + fresh data is acceptable for an
    // enum toggle. Revisit if users report confusion.
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/ideas/${ideaId}`);
}

export async function deleteIdeaAction(
  _prev: IdeaActionState,
  formData: FormData,
): Promise<IdeaActionState> {
  const groupId = String(formData.get('groupId') ?? '');
  const ideaId = String(formData.get('ideaId') ?? '');

  const supabase = await getSupabaseServerClient();
  try {
    await deleteIdea(supabase, ideaId);
  } catch (e) {
    if (isHuddleError(e) && e.huddle.kind === 'unauthorized') {
      return { formError: 'Only the proposer or an admin can delete an idea.' };
    }
    return { formError: 'Could not delete the idea. Please try again.' };
  }

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}`);
}
