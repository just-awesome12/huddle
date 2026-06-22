import { z } from 'zod';

/**
 * Saved candidate sets (Phase 15e) — a named, reusable picker shortlist.
 * The id list is validated 2..50 (matches the DB CHECK and the picker's
 * ≥2 rule, D63); ids themselves are UUIDs (intersected with the live
 * on-radar pool at pick time, so stale ids are harmless).
 */
export const candidateSetNameSchema = z
  .string({ required_error: 'Name this set' })
  .trim()
  .min(1, 'Name this set')
  .max(60, 'Keep the name under 60 characters');

export const candidateSetIdeaIdsSchema = z
  .array(z.string().uuid())
  .min(2, 'Pick at least 2 ideas to save a set')
  .max(50, 'A set can hold at most 50 ideas');

export const createCandidateSetSchema = z.object({
  groupId: z.string().uuid(),
  name: candidateSetNameSchema,
  ideaIds: candidateSetIdeaIdsSchema,
});

export type CreateCandidateSetInput = z.infer<typeof createCandidateSetSchema>;
