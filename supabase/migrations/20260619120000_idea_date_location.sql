-- Idea date + location (Phase 11.3, mock user-panel backlog).
--
-- Two optional fields so a group can capture WHEN and WHERE an idea
-- happens (events, activities, places):
--   * event_date — a plain DATE (no time / no zone). The form is a
--     date picker and a tz-naive calendar day avoids cross-timezone
--     drift for members who view it from different locales.
--   * location  — free-text place name / address.
--
-- No realtime-publication change is needed: ideas already has
-- REPLICA IDENTITY FULL (migration 014), so new columns ride the
-- existing publication automatically.

alter table public.ideas
  add column event_date date,
  add column location text;

alter table public.ideas
  add constraint ideas_location_length check (
    location is null or length(trim(location)) <= 200
  );

comment on column public.ideas.event_date is
  'Optional target calendar date for the idea (tz-naive, YYYY-MM-DD).';
comment on column public.ideas.location is
  'Optional free-text location / place name for the idea (<=200 chars).';
