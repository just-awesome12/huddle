import { z } from 'zod';
import { ideaCategorySchema } from './ideas';

/**
 * Random-picker options (Phase 7). The picker always draws from a group's
 * on_radar ideas; these options narrow that candidate pool:
 *   - category: restrict candidates to one category (optional)
 *   - shortlist: restrict candidates to a hand-picked set of idea ids
 *     (optional). The server still intersects this with on_radar +
 *     RLS-visible ideas, so a tampering client cannot smuggle in ideas
 *     it shouldn't see or that aren't actually candidates.
 *
 * groupId/shortlist ids are uuids; category mirrors the idea_category
 * enum. This shape is the body sent to the run_picker Edge Function.
 */
export const pickerOptionsSchema = z.object({
  groupId: z.string().uuid('Invalid group id'),
  category: ideaCategorySchema.optional(),
  shortlist: z
    .array(z.string().uuid('Invalid idea id'))
    .min(1, 'Pick at least one idea for the shortlist')
    .max(100, 'Shortlist is too large')
    .optional(),
});

export type PickerOptionsInput = z.infer<typeof pickerOptionsSchema>;
