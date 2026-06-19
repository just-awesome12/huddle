/**
 * Google Calendar event-template URL for a dated idea — opened via
 * Linking so the user lands in their calendar with the event pre-filled.
 * No API key. Ideas carry a date only, so the event is all-day (DTEND is
 * the day after start, the iCalendar convention). Mirrors the web
 * builder in apps/web/src/lib/calendar.ts.
 */

export interface CalendarEvent {
  title: string;
  /** "YYYY-MM-DD". */
  date: string;
  location?: string | null;
  details?: string | null;
}

function compact(date: string): string {
  return date.replace(/-/g, '');
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

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
