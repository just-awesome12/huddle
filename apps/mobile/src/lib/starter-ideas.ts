import type { IdeaCategory } from '@huddle/validation';

/**
 * Starter ideas (Phase 15d). Seeded into a new group on request so it
 * isn't a cold, empty hub — the picker works immediately and there's
 * something to react to. App-local pure data (apps don't depend on
 * @huddle/core, same as lib/relative-dates.ts, D78); mirrors web.
 */
export const STARTER_IDEAS: { title: string; category: IdeaCategory }[] = [
  { title: 'Coffee or brunch', category: 'food' },
  { title: 'Try a new restaurant', category: 'food' },
  { title: 'Movie night', category: 'event' },
  { title: 'Game night', category: 'activity' },
  { title: 'Weekend hike', category: 'activity' },
];
