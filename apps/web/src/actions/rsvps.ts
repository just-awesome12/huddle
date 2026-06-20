'use server';

import { revalidatePath } from 'next/cache';
import { rsvpStatusSchema } from '@huddle/validation';
import { setRsvp, removeRsvp } from '@huddle/api-client/rsvps';
import { getSupabaseServerClient } from '@/lib/supabase';

/** Set/change the caller's RSVP on an idea (plain action). */
export async function setRsvpAction(formData: FormData): Promise<void> {
  const ideaId = String(formData.get('ideaId') ?? '');
  const groupId = String(formData.get('groupId') ?? '');
  const parsed = rsvpStatusSchema.safeParse(formData.get('status'));
  if (!ideaId || !groupId || !parsed.success) return;

  const supabase = await getSupabaseServerClient();
  try {
    await setRsvp(supabase, ideaId, groupId, parsed.data);
  } catch {
    // RLS / membership — the recomputed page reflects the truth.
  }
  revalidatePath(`/groups/${groupId}/ideas/${ideaId}`);
  revalidatePath(`/groups/${groupId}`);
}

/** Withdraw the caller's RSVP (plain action). */
export async function removeRsvpAction(formData: FormData): Promise<void> {
  const ideaId = String(formData.get('ideaId') ?? '');
  const groupId = String(formData.get('groupId') ?? '');
  if (!ideaId || !groupId) return;

  const supabase = await getSupabaseServerClient();
  try {
    await removeRsvp(supabase, ideaId);
  } catch {
    // ignore — revalidate reflects the result
  }
  revalidatePath(`/groups/${groupId}/ideas/${ideaId}`);
  revalidatePath(`/groups/${groupId}`);
}
