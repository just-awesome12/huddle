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
  fetchIdea,
  uploadIdeaPhoto,
  removeIdeaPhoto,
  isAllowedPhotoType,
} from '@huddle/api-client/ideas';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { SupabaseClient, Database } from '@huddle/api-client/server';
import type { IdeaActionState } from './ideas-state';

type HuddleClient = SupabaseClient<Database>;

/** Post-compression ceiling; the bucket itself caps at 10MB. */
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

function photoFromForm(formData: FormData): File | null {
  const value = formData.get('photo');
  if (!(value instanceof File) || value.size === 0) return null;
  return value;
}

/**
 * Validate + upload a photo for an idea. Returns an error string for
 * the form, or null on success/no-op.
 */
async function handlePhotoUpload(
  supabase: HuddleClient,
  groupId: string,
  ideaId: string,
  photo: File,
  previousPath?: string | null,
): Promise<string | null> {
  if (!isAllowedPhotoType(photo.type)) {
    return 'Use a JPEG, PNG, or WebP image.';
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return 'That image is too large even after compression. Try a smaller one.';
  }
  try {
    await uploadIdeaPhoto(supabase, {
      groupId,
      ideaId,
      data: await photo.arrayBuffer(),
      contentType: photo.type,
      previousPath,
    });
    return null;
  } catch {
    return 'The idea was saved, but the photo failed to upload. Try again from Edit.';
  }
}

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

  // Validate the photo BEFORE creating the idea so a bad file fails
  // the whole submission instead of leaving a photo-less idea behind.
  const photo = photoFromForm(formData);
  if (photo && !isAllowedPhotoType(photo.type)) {
    return { formError: 'Use a JPEG, PNG, or WebP image.' };
  }
  if (photo && photo.size > MAX_PHOTO_BYTES) {
    return {
      formError: 'That image is too large even after compression. Try a smaller one.',
    };
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

  if (photo) {
    const photoError = await handlePhotoUpload(
      supabase,
      parsed.data.groupId,
      ideaId,
      photo,
    );
    if (photoError) {
      // The idea exists; surface the photo problem instead of redirecting.
      revalidatePath(`/groups/${parsed.data.groupId}`);
      return { formError: photoError };
    }
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

  // Photo changes: a new file replaces (and cleans up) the old one;
  // the remove checkbox clears it. New file wins if both are set.
  const photo = photoFromForm(formData);
  const removeRequested = formData.get('removePhoto') === '1';
  if (photo || removeRequested) {
    let currentPath: string | null = null;
    try {
      currentPath = (await fetchIdea(supabase, ideaId)).photo_path;
    } catch {
      // Idea readable a moment ago; treat as no current photo.
    }

    if (photo) {
      const photoError = await handlePhotoUpload(
        supabase,
        groupId,
        ideaId,
        photo,
        currentPath,
      );
      if (photoError) return { formError: photoError };
    } else if (removeRequested && currentPath) {
      try {
        await removeIdeaPhoto(supabase, ideaId, currentPath);
      } catch {
        return { formError: 'Could not remove the photo. Please try again.' };
      }
    }
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

  // Look up the photo path before the row disappears so the storage
  // object gets cleaned up too (objects don't cascade).
  let photoPath: string | null = null;
  try {
    photoPath = (await fetchIdea(supabase, ideaId)).photo_path;
  } catch {
    // Fall through — deleting a row we can't read will fail below.
  }

  try {
    await deleteIdea(supabase, ideaId, photoPath);
  } catch (e) {
    if (isHuddleError(e)) {
      if (e.huddle.kind === 'unauthorized') {
        return { formError: 'Only the proposer or an admin can delete an idea.' };
      }
      // NO ACTION FK (migration 015): a chosen idea can't be hard-deleted.
      if (e.huddle.code === '23503') {
        return {
          formError:
            'This idea was chosen in a past pick, so deleting it would erase that history. Dismiss it instead to keep it out of future picks.',
        };
      }
    }
    return { formError: 'Could not delete the idea. Please try again.' };
  }

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}`);
}
