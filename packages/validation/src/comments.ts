import { z } from 'zod';

/**
 * Comment schemas (Phase 11). Mirrors the idea_comments.body length
 * CHECK (1–2000 chars after trim).
 */
export const commentBodySchema = z
  .string({ required_error: 'Comment cannot be empty' })
  .trim()
  .min(1, 'Comment cannot be empty')
  .max(2000, 'Comment must be at most 2000 characters');

export const createCommentSchema = z.object({
  ideaId: z.string().uuid('Invalid idea id'),
  groupId: z.string().uuid('Invalid group id'),
  body: commentBodySchema,
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
