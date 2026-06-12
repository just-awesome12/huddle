import { z } from 'zod';

/**
 * Idea schemas. Mirror the DB constraints exactly:
 *   - title: 1–200 chars after trim (ideas_title_length CHECK)
 *   - description: ≤ 4000 chars, optional
 *   - link: ≤ 2048 chars, optional, must parse as http(s) URL
 *   - category / status: Postgres enums
 * photo_path is NOT here — it's written by the photo-upload flow
 * (Phase 5.3), never directly from a form payload.
 */

// Mirrors Database["public"]["Enums"]["idea_category"]
export const ideaCategorySchema = z.enum([
  'food',
  'activity',
  'place',
  'event',
  'other',
]);
export type IdeaCategory = z.infer<typeof ideaCategorySchema>;

// Mirrors Database["public"]["Enums"]["idea_status"]
export const ideaStatusSchema = z.enum(['on_radar', 'done', 'dismissed']);
export type IdeaStatus = z.infer<typeof ideaStatusSchema>;

const ideaTitleSchema = z
  .string({ required_error: 'Title is required' })
  .trim()
  .min(1, 'Title is required')
  .max(200, 'Title must be at most 200 characters');

const ideaDescriptionSchema = z
  .string()
  .trim()
  .max(4000, 'Description must be at most 4000 characters')
  // Treat a cleared textarea as "no description", not an empty string.
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const ideaLinkSchema = z
  .string()
  .trim()
  .max(2048, 'Link must be at most 2048 characters')
  .transform((v) => (v === '' ? undefined : v))
  .optional()
  .refine(
    (v) => {
      if (v === undefined) return true;
      try {
        const url = new URL(v);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Enter a valid http(s) link' },
  );

export const createIdeaSchema = z.object({
  groupId: z.string().uuid('Invalid group id'),
  title: ideaTitleSchema,
  description: ideaDescriptionSchema,
  category: ideaCategorySchema,
  link: ideaLinkSchema,
});

export type CreateIdeaInput = z.infer<typeof createIdeaSchema>;

/** Editable fields. Status changes go through updateIdeaStatusSchema. */
export const updateIdeaSchema = z.object({
  title: ideaTitleSchema.optional(),
  description: ideaDescriptionSchema,
  category: ideaCategorySchema.optional(),
  link: ideaLinkSchema,
});

export type UpdateIdeaInput = z.infer<typeof updateIdeaSchema>;

export const updateIdeaStatusSchema = z.object({
  status: ideaStatusSchema,
});

export type UpdateIdeaStatusInput = z.infer<typeof updateIdeaStatusSchema>;

/** List filters (FR-10). Both optional; omitted = no filter. */
export const ideaFiltersSchema = z.object({
  status: ideaStatusSchema.optional(),
  category: ideaCategorySchema.optional(),
});

export type IdeaFilters = z.infer<typeof ideaFiltersSchema>;
