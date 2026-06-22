'use server';

import { revalidatePath } from 'next/cache';
import { createCandidateSetSchema } from '@huddle/validation';
import { createCandidateSet, deleteCandidateSet } from '@huddle/api-client/candidate-sets';
import { getSupabaseServerClient } from '@/lib/supabase';

/** Result the picker inspects to surface a save error inline. */
export interface CandidateSetActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Save the current shortlist as a reusable set (Phase 15e). Validated
 * against the same 2..50 / name rules as the DB CHECK; RLS enforces
 * membership + self-authorship.
 */
export async function saveCandidateSetAction(input: {
  groupId: string;
  name: string;
  ideaIds: string[];
}): Promise<CandidateSetActionResult> {
  const parsed = createCandidateSetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Could not save that set.' };
  }

  const supabase = await getSupabaseServerClient();
  try {
    await createCandidateSet(supabase, {
      groupId: parsed.data.groupId,
      name: parsed.data.name,
      ideaIds: parsed.data.ideaIds,
    });
  } catch {
    return { ok: false, error: 'Could not save that set. Please try again.' };
  }

  revalidatePath(`/groups/${parsed.data.groupId}/picker`);
  return { ok: true };
}

/** Delete a saved set (RLS: author or admin). */
export async function deleteCandidateSetAction(input: {
  groupId: string;
  setId: string;
}): Promise<CandidateSetActionResult> {
  const supabase = await getSupabaseServerClient();
  try {
    await deleteCandidateSet(supabase, input.setId);
  } catch {
    return { ok: false, error: 'Could not delete that set.' };
  }
  revalidatePath(`/groups/${input.groupId}/picker`);
  return { ok: true };
}
