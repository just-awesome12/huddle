'use server';

import { revalidatePath } from 'next/cache';
import { displayNameSchema, bioSchema } from '@huddle/validation';
import { updateProfile, uploadAvatar, type UpdateProfileInput } from '@huddle/api-client/profiles';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { GroupActionState } from './groups-state';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Update the caller's profile (display name, bio, optional avatar upload).
 * Avatar bytes arrive as FormData (client-compressed); we upload to the
 * public avatars bucket and save the URL. Reuses GroupActionState.
 */
export async function updateProfileAction(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const dn = displayNameSchema.safeParse(formData.get('displayName'));
  if (!dn.success) {
    return { fieldErrors: { displayName: [dn.error.issues[0]?.message ?? 'Invalid name'] } };
  }
  const bio = bioSchema.safeParse(String(formData.get('bio') ?? ''));
  if (!bio.success) {
    return { fieldErrors: { bio: [bio.error.issues[0]?.message ?? 'Invalid bio'] } };
  }

  const supabase = await getSupabaseServerClient();
  const patch: UpdateProfileInput = { display_name: dn.data, bio: bio.data || null };

  const file = formData.get('avatar');
  if (file instanceof File && file.size > 0) {
    const ext = EXT[file.type];
    if (!ext) return { formError: 'Avatar must be a JPEG, PNG, or WebP image.' };
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      patch.avatar_url = await uploadAvatar(supabase, { data: bytes, contentType: file.type, ext });
    } catch {
      return { formError: 'Could not upload the avatar. Please try again.' };
    }
  }

  try {
    await updateProfile(supabase, patch);
  } catch {
    return { formError: 'Could not save your profile. Please try again.' };
  }

  revalidatePath('/account');
  // The sidebar/footer + member lists read the avatar via the app layout.
  revalidatePath('/groups', 'layout');
  return { success: true };
}
