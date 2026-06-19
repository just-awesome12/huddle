// =====================================================================
// @huddle/types — public surface
// =====================================================================
// Re-exports the generated Database type plus a few helpers that make
// it ergonomic to use in app code without needing to know the deep
// type paths.
//
// Example usage:
//
//   import type { Tables, Enums } from '@huddle/types';
//
//   const idea: Tables<'ideas'> = ...;
//   const status: Enums<'idea_status'> = 'on_radar';
// =====================================================================

export type { Database } from './database';
import type { Database } from './database';

/**
 * Row type for a given public-schema table. Equivalent to:
 *   Database['public']['Tables'][T]['Row']
 */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/**
 * Insert type (columns required when inserting) for a given table.
 */
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/**
 * Update type (partial columns for UPDATE statements) for a given table.
 */
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

/**
 * Enum value type. Example: `Enums<'idea_status'>` resolves to
 * `'on_radar' | 'done' | 'dismissed'`.
 */
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
