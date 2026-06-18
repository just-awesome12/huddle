// =====================================================================
// run_picker — Huddle's first Edge Function (Phase 7)
// =====================================================================
// Why an Edge Function and not a client call: the pick must be made on
// the server with a CSPRNG so a tampering client can't keep re-rolling
// until it gets the answer it wants, and the resulting `decisions` row
// must be written authoritatively. `decisions` has no INSERT RLS policy
// (migration 010), so only this function — running as service_role —
// can record a run.
//
// Flow:
//   1. Authenticate the caller from the Authorization header.
//   2. Read candidate ideas through a USER-SCOPED client, so RLS limits
//      the pool to ideas the caller can actually see (member-only) and a
//      non-member gets an empty set. Confirm membership explicitly so we
//      can return 403 rather than a confusing "too few candidates".
//   3. Apply the category filter and optional shortlist; require >= 2
//      candidates for a meaningful pick.
//   4. Pick one with the shared, unbiased picker.
//   5. Record the decision with a SERVICE-ROLE client (bypasses RLS).
//
// Error contract (JSON body { error: <code> }, mapped by the client):
//   bad_request | unauthorized | forbidden | too_few_candidates | internal
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.47.10';
import { cryptoRandomUint32, pickOne } from '../_shared/picker.ts';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PickerBody {
  groupId?: unknown;
  filters?: { category?: unknown; shortlist?: unknown } | null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'bad_request' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    let body: PickerBody;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'bad_request' }, 400);
    }

    const groupId = body.groupId;
    if (typeof groupId !== 'string' || !UUID_RE.test(groupId)) {
      return json({ error: 'bad_request' }, 400);
    }

    const category = typeof body.filters?.category === 'string' ? body.filters.category : null;
    const shortlist =
      Array.isArray(body.filters?.shortlist) &&
      body.filters.shortlist.every((v) => typeof v === 'string')
        ? (body.filters.shortlist as string[])
        : null;

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) {
      console.error('run_picker: missing SUPABASE_* env');
      return json({ error: 'internal' }, 500);
    }

    // User-scoped client: identifies the caller AND scopes every read to
    // what RLS permits them to see.
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'unauthorized' }, 401);

    // Explicit membership check so a non-member gets 403 (not 422).
    const { data: membership, error: memErr } = await userClient
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (memErr) {
      console.error('run_picker: membership query failed', memErr.message);
      return json({ error: 'internal' }, 500);
    }
    if (!membership) return json({ error: 'forbidden' }, 403);

    // Candidate pool: on-radar ideas in the group, RLS-scoped, optionally
    // narrowed by category.
    let query = userClient
      .from('ideas')
      .select('id')
      .eq('group_id', groupId)
      .eq('status', 'on_radar');
    if (category) query = query.eq('category', category);

    const { data: ideas, error: ideasErr } = await query;
    if (ideasErr) {
      console.error('run_picker: ideas query failed', ideasErr.message);
      return json({ error: 'internal' }, 500);
    }

    let candidateIds = (ideas ?? []).map((i) => i.id as string);
    if (shortlist && shortlist.length > 0) {
      const allowed = new Set(shortlist);
      candidateIds = candidateIds.filter((id) => allowed.has(id));
    }

    if (candidateIds.length < 2) {
      return json({ error: 'too_few_candidates', count: candidateIds.length }, 422);
    }

    const chosenIdeaId = pickOne(candidateIds, cryptoRandomUint32);

    // Record the run with service_role (decisions has no INSERT policy).
    const adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: decision, error: insErr } = await adminClient
      .from('decisions')
      .insert({
        group_id: groupId,
        run_by: user.id,
        chosen_idea_id: chosenIdeaId,
        candidate_idea_ids: candidateIds,
        filters: { category, shortlist: shortlist ?? null },
      })
      .select()
      .single();
    if (insErr) {
      console.error('run_picker: decision insert failed', insErr.message);
      return json({ error: 'internal' }, 500);
    }

    return json({ decision, chosenIdeaId }, 200);
  } catch (e) {
    console.error('run_picker: unhandled', e);
    return json({ error: 'internal' }, 500);
  }
});
