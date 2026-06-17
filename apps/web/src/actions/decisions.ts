'use server';

import { revalidatePath } from 'next/cache';
import { pickerOptionsSchema } from '@huddle/validation';
import { runPicker } from '@huddle/api-client/decisions';
import { isHuddleError } from '@huddle/api-client/errors';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { PickerActionState } from './decisions-state';

/**
 * Run the picker for a group. Reads options from the form (category +
 * optional shortlist of idea ids) and invokes the run_picker Edge
 * Function through the server client (which forwards the user's session).
 *
 * The decision is recorded server-side; on success we revalidate the
 * group + history pages so the new entry shows up, and hand the chosen
 * idea back to the panel for its animated reveal.
 */
export async function runPickerAction(
  _prev: PickerActionState,
  formData: FormData,
): Promise<PickerActionState> {
  const shortlist = formData.getAll('shortlist').map(String).filter(Boolean);
  const categoryRaw = formData.get('category');

  const parsed = pickerOptionsSchema.safeParse({
    groupId: formData.get('groupId'),
    category: categoryRaw ? String(categoryRaw) : undefined,
    shortlist: shortlist.length > 0 ? shortlist : undefined,
  });
  if (!parsed.success) {
    return { status: 'error', message: 'Those picker options are not valid.' };
  }

  const supabase = await getSupabaseServerClient();
  try {
    const result = await runPicker(supabase, {
      groupId: parsed.data.groupId,
      category: parsed.data.category,
      shortlist: parsed.data.shortlist,
    });

    if (result.outcome === 'no_candidates') {
      return { status: 'no_candidates' };
    }

    const chosen = result.decision.chosen;
    if (!chosen) {
      return { status: 'error', message: 'Picked, but could not load the idea.' };
    }

    revalidatePath(`/groups/${parsed.data.groupId}`);
    revalidatePath(`/groups/${parsed.data.groupId}/history`);
    return { status: 'picked', chosen };
  } catch (e) {
    if (isHuddleError(e) && e.huddle.kind === 'unauthorized') {
      return { status: 'error', message: 'You are not a member of this group.' };
    }
    return { status: 'error', message: 'The picker failed. Please try again.' };
  }
}
