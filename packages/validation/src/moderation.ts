import { z } from 'zod';

/**
 * Moderation schemas (Phase 10, OQ-5). Mirrors the report_reason enum
 * and the reports.details length CHECK.
 */

// Mirrors Database["public"]["Enums"]["report_reason"]
export const reportReasonSchema = z.enum(['spam', 'inappropriate', 'harassment', 'other']);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const reportIdeaSchema = z.object({
  ideaId: z.string().uuid('Invalid idea id'),
  reason: reportReasonSchema,
  details: z
    .string()
    .trim()
    .max(1000, 'Please keep details under 1000 characters')
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
});

export type ReportIdeaInput = z.infer<typeof reportIdeaSchema>;
