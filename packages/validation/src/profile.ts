import { z } from 'zod';
import { usernameSchema } from './username';
import { displayNameSchema } from './display-name';

/**
 * Profile update payload. All fields optional — UI may update one at a
 * time. The avatar URL is validated as a URL when provided; clients
 * upload the binary to Supabase Storage first, then update this field
 * with the public URL.
 */
export const bioSchema = z.string().trim().max(160, 'Bio must be at most 160 characters');

export const profileUpdateSchema = z.object({
  username: usernameSchema.optional(),
  displayName: displayNameSchema.optional(),
  bio: bioSchema.optional(),
  avatarUrl: z
    .string()
    .trim()
    .url('Avatar URL must be a valid URL')
    .max(2048, 'Avatar URL is too long')
    .optional()
    .or(z.literal('')),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/**
 * Onboarding payload — required username and display name, no avatar
 * yet. This is what the post-signup onboarding form submits to replace
 * the placeholder profile created by the handle_new_user trigger.
 */
export const onboardingSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
