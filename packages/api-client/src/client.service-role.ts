import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import { resolveServiceEnv } from './env';

/**
 * Service-role Supabase client. BYPASSES ALL ROW-LEVEL SECURITY.
 *
 * NEVER use this from:
 *   - React components (Client OR Server)
 *   - Browser code
 *   - Any code path that processes data from the user without
 *     explicit, audited authorization checks of its own
 *
 * DO use this from:
 *   - Supabase Edge Functions (run on the Supabase side; the secret
 *     key never leaves the Supabase platform)
 *   - Trusted server-side scripts (migrations, cron, admin tools)
 *   - The accept-invite Edge Function in Phase 4
 *   - The run-picker Edge Function in Phase 7
 *
 * The factory does NOT cache. Service-role clients are short-lived by
 * design; you create one for a specific task and let it be GC'd.
 */
export function createServiceRoleSupabaseClient(): SupabaseClient<Database> {
  const { url, secretKey } = resolveServiceEnv();
  return createClient<Database>(url, secretKey, {
    auth: {
      // Service role doesn't sign in; disable session features that
      // would otherwise try to persist or refresh tokens.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
