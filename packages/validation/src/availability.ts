import { z } from 'zod';

/**
 * Availability "when's free?" polls (Phase 16b). A title + 1..14 candidate
 * dates (tz-naive YYYY-MM-DD, D75); each member marks yes/maybe/no per date.
 */
export const availabilityTitleSchema = z
  .string({ required_error: 'Give it a title' })
  .trim()
  .min(1, 'Give it a title')
  .max(200, 'Keep the title under 200 characters');

export const availabilityStatusSchema = z.enum(['yes', 'maybe', 'no']);
export type AvailabilityStatus = z.infer<typeof availabilityStatusSchema>;

/** A valid calendar day (YYYY-MM-DD), round-tripped to reject impossible dates. */
const calendarDay = z.string().refine((v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Enter a valid date');

export const createAvailabilityPollSchema = z.object({
  groupId: z.string().uuid(),
  title: availabilityTitleSchema,
  dates: z
    .array(calendarDay)
    .min(1, 'Add at least one date')
    .max(14, 'Up to 14 dates')
    .refine((d) => new Set(d).size === d.length, 'Dates must be unique'),
});

export type CreateAvailabilityPollInput = z.infer<typeof createAvailabilityPollSchema>;
