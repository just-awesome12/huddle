'use client';

import { googleCalendarUrl, icsDataUrl, type CalendarEvent } from '@/lib/calendar';

/**
 * "Add to calendar" links for a dated idea — a Google Calendar template
 * URL and an .ics download (Apple Calendar / Outlook). Pure client; no
 * API keys, no network beyond the user's own click.
 */
export function AddToCalendar({ event }: { event: CalendarEvent }) {
  const fileName = `${event.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 40) || 'event'}.ics`;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3" data-testid="add-to-calendar">
      <span className="text-sm font-medium text-content">Add to calendar:</span>
      <a
        href={googleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-brand-ink underline"
        data-testid="calendar-google"
      >
        Google
      </a>
      <a
        href={icsDataUrl(event)}
        download={fileName}
        className="text-sm font-medium text-brand-ink underline"
        data-testid="calendar-ics"
      >
        Apple / Outlook (.ics)
      </a>
    </div>
  );
}
