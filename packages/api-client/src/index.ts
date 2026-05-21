// =====================================================================
// @huddle/api-client — Supabase client factories + error mapping
// =====================================================================
// Apps NEVER import from @supabase/supabase-js or @supabase/ssr
// directly. They always go through one of these factories so that:
//
//   - Auth-cookie handling is consistent across the codebase
//   - Token storage uses the right backend per platform
//   - The Database<...> generic type is wired up everywhere
//   - Errors are normalised via mapSupabaseError / unwrap
//
// Subpath exports (preferred — better tree-shaking):
//
//   import { createBrowserSupabaseClient } from '@huddle/api-client/browser';
//   import { createServerSupabaseClient } from '@huddle/api-client/server';
//   import { createServiceRoleSupabaseClient } from '@huddle/api-client/service-role';
//   import { createNativeSupabaseClient } from '@huddle/api-client/native';
//   import { mapSupabaseError, unwrap, isHuddleError } from '@huddle/api-client/errors';
//
// The root export re-exports everything for convenience.
// =====================================================================

export * from './client.browser';
export * from './client.server';
export * from './client.service-role';
export * from './client.native';
export * from './errors';
export * from './env';
