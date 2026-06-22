import { z } from 'zod';

/**
 * Counted majority polls (Phase 16). A poll is a question plus 2..10
 * text options; mirrors the DB CHECKs (question 1..200, label 1..100).
 */
export const pollQuestionSchema = z
  .string({ required_error: 'Ask a question' })
  .trim()
  .min(1, 'Ask a question')
  .max(200, 'Keep the question under 200 characters');

export const pollOptionLabelSchema = z
  .string()
  .trim()
  .min(1, 'Options cannot be empty')
  .max(100, 'Keep options under 100 characters');

export const createPollSchema = z.object({
  groupId: z.string().uuid(),
  question: pollQuestionSchema,
  options: z
    .array(pollOptionLabelSchema)
    .min(2, 'Add at least 2 options')
    .max(10, 'A poll can have at most 10 options')
    // Reject duplicate option labels (case-insensitive).
    .refine(
      (opts) => new Set(opts.map((o) => o.toLowerCase())).size === opts.length,
      'Options must be unique',
    ),
});

export type CreatePollInput = z.infer<typeof createPollSchema>;
