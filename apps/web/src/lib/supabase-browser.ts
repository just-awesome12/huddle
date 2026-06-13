import { createBrowserSupabaseClient } from '@huddle/api-client/browser';

/**
 * Browser Supabase client for Client Components.
 *
 * The env vars are referenced STATICALLY here (`process.env.NEXT_PUBLIC_*`
 * as literal member expressions) so Next inlines them into the client
 * bundle. The api-client env helper reads `process.env[key]` dynamically,
 * which Next cannot inline — in the browser that yields undefined. So
 * the app resolves the values and hands them to the factory.
 */
export function getBrowserSupabaseClient() {
  return createBrowserSupabaseClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
  });
}
