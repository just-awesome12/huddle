// Shared CORS headers for browser-invoked Edge Functions.
// The web app calls run_picker from the browser via supabase-js
// functions.invoke, so preflight + actual responses need these.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
