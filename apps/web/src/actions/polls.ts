'use server';

import { revalidatePath } from 'next/cache';
import { createPollSchema } from '@huddle/validation';
import { createPoll, castVote, setPollClosed, deletePoll } from '@huddle/api-client/polls';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { PollActionState } from './polls-state';

/** Create a poll from the question + the repeated `option` fields. */
export async function createPollAction(
  _prev: PollActionState,
  formData: FormData,
): Promise<PollActionState> {
  const groupId = String(formData.get('groupId') ?? '');
  const options = formData
    .getAll('option')
    .map((o) => String(o).trim())
    .filter((o) => o.length > 0);

  const parsed = createPollSchema.safeParse({
    groupId,
    question: formData.get('question'),
    options,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Could not create the poll.' };
  }

  const supabase = await getSupabaseServerClient();
  try {
    await createPoll(supabase, {
      groupId: parsed.data.groupId,
      question: parsed.data.question,
      options: parsed.data.options,
    });
  } catch {
    return { error: 'Could not create the poll. Please try again.' };
  }

  revalidatePath(`/groups/${groupId}/polls`);
  return { ok: true };
}

/** Cast/change the caller's vote (plain action; revalidate refreshes counts). */
export async function votePollAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  const pollId = String(formData.get('pollId') ?? '');
  const optionId = String(formData.get('optionId') ?? '');
  const supabase = await getSupabaseServerClient();
  try {
    await castVote(supabase, { pollId, groupId, optionId });
  } catch {
    // RLS / closed-poll guard; revalidate reflects the truth.
  }
  revalidatePath(`/groups/${groupId}/polls`);
}

/** Close or reopen a poll (creator/admin via RLS). */
export async function setPollClosedAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  const pollId = String(formData.get('pollId') ?? '');
  const closed = String(formData.get('closed') ?? '') === 'true';
  const supabase = await getSupabaseServerClient();
  try {
    await setPollClosed(supabase, pollId, closed);
  } catch {
    // creator/admin-only; revalidate reflects the result.
  }
  revalidatePath(`/groups/${groupId}/polls`);
}

/** Delete a poll (creator/admin via RLS). */
export async function deletePollAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  const pollId = String(formData.get('pollId') ?? '');
  const supabase = await getSupabaseServerClient();
  try {
    await deletePoll(supabase, pollId);
  } catch {
    // creator/admin-only; revalidate reflects the result.
  }
  revalidatePath(`/groups/${groupId}/polls`);
}
