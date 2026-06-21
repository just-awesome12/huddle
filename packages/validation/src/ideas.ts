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
export const ideaCategorySchema = z.enum(['food', 'activity', 'place', 'event', 'other']);
export type IdeaCategory = z.infer<typeof ideaCategorySchema>;

// Mirrors Database["public"]["Enums"]["idea_status"]
export const ideaStatusSchema = z.enum(['on_radar', 'done', 'dismissed']);
export type IdeaStatus = z.infer<typeof ideaStatusSchema>;

export const ideaTitleSchema = z
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

// A plain calendar day, "YYYY-MM-DD" — matches the DB `date` column and
// the native <input type="date"> value. Empty → "no date".
const ideaEventDateSchema = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional()
  .refine(
    (v) => {
      if (v === undefined) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      // Reject impossible dates (e.g. 2026-02-31) by round-tripping.
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    },
    { message: 'Enter a valid date' },
  );

const ideaLocationSchema = z
  .string()
  .trim()
  .max(200, 'Location must be at most 200 characters')
  .transform((v) => (v === '' ? undefined : v))
  .optional();

export const createIdeaSchema = z.object({
  groupId: z.string().uuid('Invalid group id'),
  title: ideaTitleSchema,
  description: ideaDescriptionSchema,
  category: ideaCategorySchema,
  link: ideaLinkSchema,
  eventDate: ideaEventDateSchema,
  location: ideaLocationSchema,
});

export type CreateIdeaInput = z.infer<typeof createIdeaSchema>;

/** Editable fields. Status changes go through updateIdeaStatusSchema. */
export const updateIdeaSchema = z.object({
  title: ideaTitleSchema.optional(),
  description: ideaDescriptionSchema,
  category: ideaCategorySchema.optional(),
  link: ideaLinkSchema,
  eventDate: ideaEventDateSchema,
  location: ideaLocationSchema,
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

// Mirrors Database["public"]["Enums"]["rsvp_status"] (Phase 13 RSVP).
export const rsvpStatusSchema = z.enum(['going', 'maybe', 'not_going']);
export type RsvpStatus = z.infer<typeof rsvpStatusSchema>;

// Emoji reactions (Phase 13). Mirrors the DB CHECK + reaction_target enum.
export const REACTION_EMOJIS = ['👍', '🎉', '🔥', '😂', '😮', '🙌'] as const;
export const reactionEmojiSchema = z.enum(REACTION_EMOJIS);
export type ReactionEmoji = z.infer<typeof reactionEmojiSchema>;
export const reactionTargetSchema = z.enum(['idea', 'decision', 'comment']);
export type ReactionTargetType = z.infer<typeof reactionTargetSchema>;
