/**
 * Relative-date quick-fill chips (Phase 15c). Pure, app-local (apps don't
 * depend on @huddle/core, same as lib/calendar.ts). Returns YYYY-MM-DD
 * strings in LOCAL time so they match the tz-naive `event_date` column (D75).
 * Especially handy on mobile, where the date field is a typed YYYY-MM-DD.
 */

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface DateChip {
  label: string;
  value: string;
}

/** Today, Tomorrow, and the coming Saturday (today if it's already Saturday). */
export function relativeDateChips(now: Date = new Date()): DateChip[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const daysUntilSat = (6 - today.getDay() + 7) % 7;
  const weekend = new Date(today);
  weekend.setDate(today.getDate() + daysUntilSat);
  return [
    { label: 'Today', value: toYMD(today) },
    { label: 'Tomorrow', value: toYMD(tomorrow) },
    { label: 'This weekend', value: toYMD(weekend) },
  ];
}
