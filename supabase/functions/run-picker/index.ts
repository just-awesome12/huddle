// =====================================================================
// run-picker — Huddle's first Edge Function (Phase 7).
// =====================================================================
// Picks one on_radar idea at random from a group and records the outcome
// as an immutable `decisions` row. The pick runs SERVER-SIDE with a
// CSPRNG so a tampering client cannot re-roll, and the decision INSERT
// uses the service-role key (the decisions table has no INSERT policy).
//
// Authorization is layered:
//   1. verify_jwt = true (config.toml) — the gateway rejects anon calls.
//   2. We re-read the user from the JWT and gate on group membership
//      using a USER-SCOPED client, so RLS — not this code — decides what
//      the caller can see. Candidate ideas are read under that same
//      client, so the server can only ever pick from ideas the caller is
//      actually allowed to see (NFR-2).
//
// Response contract (the api-client `runPicker` mirrors this):
//   200 { outcome: 'picked', decision }      — a pick was recorded
//   200 { outcome: 'no_candidates' }         — friendly empty state
//   4xx/5xx { error: { code, message } }     — failures
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.47.10';
import { pickOne } from './picker.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function fail(status: number, code: string, message: string): Response {
  return json(status, { error: { code, message } });
}

// The embed mirrors api-client's DECISION_SELECT so the recorded row
// comes back ready for the History view.
const DECISION_SELECT =
  '*, runner:profiles!decisions_run_by_fkey(id, username, display_name, avatar_url), ' +
  'chosen:ideas!decisions_chosen_idea_id_fkey(id, title, category, status)';

const CATEGORIES = ['food', 'activity', 'place', 'event', 'other'];

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return fail(405, 'method_not_allowed', 'Use POST.');
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return fail(401, 'no_auth', 'Missing Authorization header.');
  }

  // ---- Parse + validate body ----
  let body: { groupId?: unknown; category?: unknown; shortlist?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_body', 'Body must be valid JSON.');
  }

  const groupId = body.groupId;
  if (typeof groupId !== 'string' || groupId.length === 0) {
    return fail(400, 'bad_request', 'groupId is required.');
  }

  let category: string | undefined;
  if (body.category != null) {
    if (typeof body.category !== 'string' || !CATEGORIES.includes(body.category)) {
      return fail(400, 'bad_request', 'category is not a valid idea category.');
    }
    category = body.category;
  }

  let shortlist: string[] | undefined;
  if (body.shortlist != null) {
    if (
      !Array.isArray(body.shortlist) ||
      !body.shortlist.every((x) => typeof x === 'string')
    ) {
      return fail(400, 'bad_request', 'shortlist must be an array of idea ids.');
    }
    if (body.shortlist.length > 0) shortlist = body.shortlist as string[];
  }

  // ---- Env ----
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return fail(500, 'misconfigured', 'Server is missing Supabase credentials.');
  }

  // ---- User-scoped client (RLS applies) ----
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return fail(401, 'no_auth', 'Invalid or expired token.');
  }

  // ---- Membership gate: groups are visible only to members under RLS ----
  const { data: group, error: groupErr } = await userClient
    .from('groups')
    .select('id')
    .eq('id', groupId)
    .maybeSingle();
  if (groupErr) {
    return fail(500, 'query_failed', groupErr.message);
  }
  if (!group) {
    return fail(403, 'not_member', 'You are not a member of this group.');
  }

  // ---- Candidate query (server-authoritative; on_radar only) ----
  let query = userClient
    .from('ideas')
    .select('id')
    .eq('group_id', groupId)
    .eq('status', 'on_radar');
  if (category) query = query.eq('category', category);
  if (shortlist) query = query.in('id', shortlist);

  const { data: ideas, error: ideasErr } = await query;
  if (ideasErr) {
    return fail(500, 'query_failed', ideasErr.message);
  }

  const candidateIds: string[] = (ideas ?? []).map((row: { id: string }) => row.id);
  if (candidateIds.length === 0) {
    return json(200, { outcome: 'no_candidates' });
  }

  // ---- The pick (CSPRNG, server-side) ----
  const chosenId = pickOne(candidateIds);

  // ---- Record the decision with the service role (no INSERT policy) ----
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const filters = {
    category: category ?? null,
    shortlist: shortlist ?? null,
  };

  const { data: decision, error: insertErr } = await serviceClient
    .from('decisions')
    .insert({
      group_id: groupId,
      run_by: user.id,
      chosen_idea_id: chosenId,
      candidate_idea_ids: candidateIds,
      filters,
    })
    .select(DECISION_SELECT)
    .single();

  if (insertErr) {
    return fail(500, 'insert_failed', insertErr.message);
  }

  return json(200, { outcome: 'picked', decision });
});
