import { z } from 'zod';

/**
 * Mirrors the group_invites_token_format CHECK constraint:
 * base64url-encoded 32-byte tokens (43 chars), with headroom the DB
 * allows for. Tokens are generated DB-side by generate_invite_token().
 */
export const inviteTokenSchema = z
  .string({ required_error: 'Invite token is required' })
  .regex(/^[A-Za-z0-9_-]{40,64}$/, 'That invite link is not valid');

/**
 * Creating an invite. Exactly one flavour at a time:
 *   - link invite: neither email nor userId
 *   - email invite: invitedEmail set
 *   - by-user invite (username search): invitedUserId set
 */
export const createInviteSchema = z
  .object({
    groupId: z.string().uuid('Invalid group id'),
    invitedEmail: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
    invitedUserId: z.string().uuid('Invalid user id').optional(),
  })
  .refine((v) => !(v.invitedEmail && v.invitedUserId), {
    message: 'Provide either an email or a user, not both',
    path: ['invitedEmail'],
  });

export type CreateInviteInput = z.infer<typeof createInviteSchema>;

/** Max emails accepted in one bulk-invite submission (15e). */
export const BULK_INVITE_MAX = 50;

const singleEmail = z.string().trim().toLowerCase().email();

/**
 * Bulk invite (Phase 15e): split a free-text blob (commas, semicolons,
 * spaces, or newlines) into a deduped, validated email list. Returns the
 * `valid` set (capped at BULK_INVITE_MAX) and the `invalid` tokens so the
 * caller can invite the good ones and report the rest (partial success).
 */
export function parseEmailList(raw: string): {
  valid: string[];
  invalid: string[];
  overflow: boolean;
} {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const parsed = singleEmail.safeParse(token);
    if (!parsed.success) {
      invalid.push(token);
    } else if (!seen.has(parsed.data)) {
      seen.add(parsed.data);
      valid.push(parsed.data);
    }
  }

  const overflow = valid.length > BULK_INVITE_MAX;
  return { valid: valid.slice(0, BULK_INVITE_MAX), invalid, overflow };
}

export const acceptInviteSchema = z.object({
  token: inviteTokenSchema,
});

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/**
 * Username search query (the "add by username" flow). A PREFIX of a
 * username, so same charset as usernames but any length 1–30. The
 * charset restriction doubles as injection protection for the
 * ILIKE pattern built from it (no % allowed; _ is escaped DB-side).
 */
export const usernameSearchSchema = z.object({
  q: z
    .string({ required_error: 'Search query is required' })
    .trim()
    .toLowerCase()
    .min(1, 'Type at least one character')
    .max(30, 'Usernames are at most 30 characters')
    .regex(/^[a-z0-9_]+$/, 'Usernames contain only letters, digits, and underscores'),
});

export type UsernameSearchInput = z.infer<typeof usernameSearchSchema>;
