import { z } from 'zod';

/**
 * Group wall post schema (Phase 14). Mirrors the group_posts.body
 * length CHECK (1–2000 chars after trim).
 */
export const postBodySchema = z
  .string({ required_error: 'Post cannot be empty' })
  .trim()
  .min(1, 'Post cannot be empty')
  .max(2000, 'Post must be at most 2000 characters');

export const createPostSchema = z.object({
  groupId: z.string().uuid('Invalid group id'),
  body: postBodySchema,
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
