'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSupabaseServerClient } from '@/lib/supabase';

/**
 * Initiate the Google OAuth flow.
 *
 * Called from a `<form action={...}>` on the sign-in / sign-up pages.
 * Supabase generates a Google authorization URL; we redirect the
 * browser to it; Google sends the user back to our /auth/callback
 * with a code; the callback route exchanges that code for a session.
 *
 * The redirectTo URL must match an entry in the Supabase project's
 * "Additional redirect URLs" allow-list (configured in supabase/config.toml
 * under [auth] additional_redirect_urls). For local dev this is the
 * site URL by default.
 */
export async function signInWithGoogleAction(): Promise<void> {
  const supabase = await getSupabaseServerClient();

  // Build the absolute callback URL from the request headers so this
  // works regardless of port (3000 in dev, the production host later).
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const protocol = h.get('x-forwarded-proto') ?? 'http';
  const redirectTo = `${protocol}://${host}/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // Always re-prompt for account selection so users can switch
      // between Google accounts without clearing browser state.
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error || !data.url) {
    redirect('/auth/error?reason=oauth_init');
  }

  // Supabase returns the Google authorization URL; redirect there.
  redirect(data.url);
}
