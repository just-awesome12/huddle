'use server';

import { revalidatePath } from 'next/cache';
import { createAvailabilityPollSchema, availabilityStatusSchema } from '@huddle/validation';
import {
  createAvailabilityPoll,
  setAvailability,
  setAvailabilityClosed,
  deleteAvailabilityPoll,
} from '@huddle/api-client/availability';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { PollActionState } from './polls-state';

/** Create an availability poll from the title + repeated `date` fields. */
export async function createAvailabilityPollAction(
  _prev: PollActionState,
  formData: FormData,
): Promise<PollActionState> {
  const groupId = String(formData.get('groupId') ?? '');
  const dates = formData
    .getAll('date')
    .map((d) => String(d).trim())
    .filter((d) => d.length > 0);

  const parsed = createAvailabilityPollSchema.safeParse({
    groupId,
    title: formData.get('title'),
    dates,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Could not create the poll.' };
  }

  const supabase = await getSupabaseServerClient();
  try {
    await createAvailabilityPoll(supabase, {
      groupId: parsed.data.groupId,
      title: parsed.data.title,
      dates: parsed.data.dates,
    });
  } catch {
    return { error: 'Could not create the poll. Please try again.' };
  }

  revalidatePath(`/groups/${groupId}/polls`);
  return { ok: true };
}

/** Set/change the caller's status for a date (plain action). */
export async function setAvailabilityAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  const pollId = String(formData.get('pollId') ?? '');
  const dateId = String(formData.get('dateId') ?? '');
  const status = availabilityStatusSchema.safeParse(formData.get('status'));
  if (!status.success) return;
  const supabase = await getSupabaseServerClient();
  try {
    await setAvailability(supabase, { pollId, dateId, groupId, status: status.data });
  } catch {
    // RLS / closed guard; revalidate reflects the truth.
  }
  revalidatePath(`/groups/${groupId}/polls`);
}

/** Close or reopen an availability poll (creator/admin via RLS). */
export async function setAvailabilityClosedAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  const pollId = String(formData.get('pollId') ?? '');
  const closed = String(formData.get('closed') ?? '') === 'true';
  const supabase = await getSupabaseServerClient();
  try {
    await setAvailabilityClosed(supabase, pollId, closed);
  } catch {
    // creator/admin-only; revalidate reflects the result.
  }
  revalidatePath(`/groups/${groupId}/polls`);
}

/** Delete an availability poll (creator/admin via RLS). */
export async function deleteAvailabilityPollAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  const pollId = String(formData.get('pollId') ?? '');
  const supabase = await getSupabaseServerClient();
  try {
    await deleteAvailabilityPoll(supabase, pollId);
  } catch {
    // creator/admin-only; revalidate reflects the result.
  }
  revalidatePath(`/groups/${groupId}/polls`);
}
