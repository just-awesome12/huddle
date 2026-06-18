'use server';

import { revalidatePath } from 'next/cache';
import { runPickerSchema } from '@huddle/validation';
import { runPicker, PickerError } from '@huddle/api-client/decisions';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { PickerActionResult } from './picker-state';

/**
 * Run the random picker for a group. Delegates to the run_picker Edge
 * Function via the data layer — the pick is made server-side with a
 * CSPRNG and recorded as a tamper-proof decision (D26/D43: web never
 * calls Supabase from the browser; this goes through a Server Action).
 *
 * We call getUser() first both to authorize and to ensure the ssr
 * client has hydrated the session token, so functions.invoke forwards
 * the caller's JWT to the Edge Function.
 */
export async function runPickerAction(input: {
  groupId: string;
  category?: string | null;
  shortlist?: string[] | null;
}): Promise<PickerActionResult> {
  const parsed = runPickerSchema.safeParse({
    groupId: input.groupId,
    category: input.category ?? undefined,
    shortlist: input.shortlist && input.shortlist.length > 0 ? input.shortlist : undefined,
  });
  if (!parsed.success) return { ok: false, error: 'generic' };

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'forbidden' };

  try {
    const { chosenIdeaId } = await runPicker(supabase, {
      groupId: parsed.data.groupId,
      category: parsed.data.category,
      shortlist: parsed.data.shortlist,
    });

    // History goes live for members via realtime, but revalidate so the
    // caller's own history/detail pages reflect the new pick immediately.
    revalidatePath(`/groups/${parsed.data.groupId}/history`);
    revalidatePath(`/groups/${parsed.data.groupId}`);

    return { ok: true, chosenIdeaId };
  } catch (e) {
    if (e instanceof PickerError) {
      if (e.code === 'too_few_candidates') {
        return { ok: false, error: 'too_few_candidates', count: e.count ?? 0 };
      }
      if (e.code === 'forbidden' || e.code === 'unauthorized') {
        return { ok: false, error: 'forbidden' };
      }
    }
    return { ok: false, error: 'generic' };
  }
}
