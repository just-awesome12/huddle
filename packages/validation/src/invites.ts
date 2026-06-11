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
    invitedEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter a valid email address')
      .optional(),
    invitedUserId: z.string().uuid('Invalid user id').optional(),
  })
  .refine((v) => !(v.invitedEmail && v.invitedUserId), {
    message: 'Provide either an email or a user, not both',
    path: ['invitedEmail'],
  });

export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const acceptInviteSchema = z.object({
  token: inviteTokenSchema,
});

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
