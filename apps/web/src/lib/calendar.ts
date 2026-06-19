/**
 * Build calendar links for a dated idea. No external API — a Google
 * Calendar "render" URL (opens a pre-filled event) and a downloadable
 * .ics (Apple Calendar / Outlook). Our ideas carry a date only (no
 * time), so events are all-day: DTEND is the day AFTER the start, which
 * is the iCalendar convention for a one-day all-day event.
 */

export interface CalendarEvent {
  title: string;
  /** "YYYY-MM-DD". */
  date: string;
  location?: string | null;
  details?: string | null;
}

/** "2026-07-04" -> "20260704". */
function compact(date: string): string {
  return date.replace(/-/g, '');
}

/** The day after `date`, as "YYYY-MM-DD" (all-day exclusive end). */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** A Google Calendar event-template URL (no API key needed). */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${compact(event.date)}/${compact(nextDay(event.date))}`,
  });
  if (event.location) params.set('location', event.location);
  if (event.details) params.set('details', event.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escape a value per RFC 5545 (commas, semicolons, backslashes, newlines). */
function escapeIcs(value: string): string {
  return value.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
}

/** An .ics document for one all-day event (Apple Calendar / Outlook). */
export function buildIcs(event: CalendarEvent): string {
  const start = compact(event.date);
  const end = compact(nextDay(event.date));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Huddle//Huddle//EN',
    'BEGIN:VEVENT',
    `UID:${start}-${Math.random().toString(36).slice(2)}@huddle`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcs(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  if (event.details) lines.push(`DESCRIPTION:${escapeIcs(event.details)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/** A data: URL holding the .ics, usable as an <a download> href. */
export function icsDataUrl(event: CalendarEvent): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(event))}`;
}
