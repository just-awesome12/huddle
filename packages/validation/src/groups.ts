import { z } from 'zod';

const groupNameSchema = z
  .string({ required_error: 'Group name is required' })
  .trim()
  .min(1, 'Group name is required')
  .max(80, 'Group name must be at most 80 characters');

export const createGroupSchema = z.object({
  name: groupNameSchema,
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

// Rename-only for now; other group settings live in later phases.
export const updateGroupSchema = createGroupSchema.partial();

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

// Mirrors Database["public"]["Enums"]["group_member_role"]
export const groupMemberRoleSchema = z.enum(['admin', 'member']);
export type GroupMemberRole = z.infer<typeof groupMemberRoleSchema>;
