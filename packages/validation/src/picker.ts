import { z } from 'zod';
import { ideaCategorySchema } from './ideas';

/**
 * Random picker input (Phase 7). Mirrors the run_picker Edge Function
 * contract:
 *   - groupId: which group's ideas to draw from
 *   - category: optional filter; omitted = all categories
 *   - shortlist: optional explicit subset of idea ids to draw from;
 *     omitted/empty = the whole (filtered) on-radar pool
 *
 * The function itself enforces "at least 2 candidates after filtering";
 * we don't duplicate that here because the candidate count isn't known
 * until the server reads the group's ideas under RLS.
 */
export const runPickerSchema = z.object({
  groupId: z.string().uuid('Invalid group id'),
  category: ideaCategorySchema.optional(),
  shortlist: z.array(z.string().uuid('Invalid idea id')).optional(),
});

export type RunPickerInput = z.infer<typeof runPickerSchema>;
