import { z } from 'zod';

const groupNameSchema = z
  .string({ required_error: 'Group name is required' })
  .trim()
  .min(1, 'Group name is required')
  .max(80, 'Group name must be at most 80 characters');

// Mirrors Database["public"]["Enums"]["group_visibility"].
export const groupVisibilitySchema = z.enum(['invite_only', 'public']);
export type GroupVisibility = z.infer<typeof groupVisibilitySchema>;

export const groupDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'Description must be at most 500 characters');

export const groupLocationSchema = z
  .string()
  .trim()
  .max(120, 'Location must be at most 120 characters');

/** Normalize a raw tag list: trim, lowercase, drop empties, de-duplicate. */
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const v = t.trim().toLowerCase();
    if (!v) continue;
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

// Tags: normalized then bounded (<=8 tags, each <=30 chars) — mirrors the
// DB CHECK + normalize trigger.
export const tagsSchema = z
  .array(z.string())
  .transform(normalizeTags)
  .pipe(
    z.array(z.string().max(30, 'Each tag must be at most 30 characters')).max(8, 'At most 8 tags'),
  );

/** Parse a comma-separated tags string (form input) into normalized tags. */
export const tagsStringSchema = z
  .string()
  .transform((s) => s.split(','))
  .pipe(tagsSchema);

// Group identity (Phase 14) — admin-chosen emoji + accent color. Pickers
// are curated so dark-mode/AA stay safe; the palette mirrors group-visuals.
export const GROUP_EMOJIS = [
  '🌮',
  '🏠',
  '📚',
  '🎬',
  '🎳',
  '☕',
  '🥾',
  '🎤',
  '🍜',
  '🎲',
  '🎉',
  '🍕',
  '⚽',
  '🏀',
  '🎸',
  '🧗',
  '🍻',
  '🎨',
  '🌲',
  '✈️',
  '🐶',
  '💡',
  '🔥',
  '⭐',
] as const;
export const GROUP_COLORS = [
  '#d4537e',
  '#665cc8',
  '#2f9e8f',
  '#7f77dd',
  '#534ab7',
  '#993556',
  '#473e9f',
] as const;

export const groupEmojiSchema = z.string().trim().min(1).max(16);
export const groupColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex code');

export const createGroupSchema = z.object({
  name: groupNameSchema,
  description: groupDescriptionSchema.optional(),
  location: groupLocationSchema.optional(),
  tags: tagsSchema.optional().default([]),
  visibility: groupVisibilitySchema.default('invite_only'),
  emoji: groupEmojiSchema.optional(),
  color: groupColorSchema.optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

// Partial for edits — every field optional; only the provided ones change.
// `liteMode` is edit-only (a group starts standard; an admin opts in later),
// so it lives here rather than on createGroupSchema.
export const updateGroupSchema = createGroupSchema.partial().extend({
  liteMode: z.boolean().optional(),
});

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

// Discovery search: free text + optional tag/location filters.
export const groupSearchSchema = z.object({
  q: z.string().trim().max(80, 'Search is too long').optional().default(''),
  tags: z
    .array(z.string().trim().toLowerCase().min(1))
    .max(8, 'At most 8 tags')
    .optional()
    .default([]),
  location: z.string().trim().max(120, 'Location is too long').optional().default(''),
});

export type GroupSearchInput = z.infer<typeof groupSearchSchema>;

// Optional note attached to a join request.
export const joinRequestMessageSchema = z
  .string()
  .trim()
  .max(300, 'Message must be at most 300 characters')
  .optional();

// Mirrors Database["public"]["Enums"]["group_member_role"].
export const groupMemberRoleSchema = z.enum(['admin', 'member']);
export type GroupMemberRole = z.infer<typeof groupMemberRoleSchema>;
