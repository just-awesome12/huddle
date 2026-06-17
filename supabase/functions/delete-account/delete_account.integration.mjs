/* eslint-disable no-console -- runnable diagnostic; printing is the point */
/**
 * Phase 10 — delete-account Edge Function integration test.
 *
 * Needs a live local stack serving the function:
 *   supabase stop && supabase start
 *   node supabase/functions/delete-account/delete_account.integration.mjs
 *
 * Asserts:
 *   1. Sole admin of a SHARED group is refused (409 sole_admin + names).
 *   2. A plain member can delete (200) and is fully removed.
 *   3. Deleting a user de-attributes their content (idea.proposed_by NULL,
 *      idea survives), removes their membership, and deletes their SOLO
 *      group — while a shared group they belonged to remains.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const ts = Date.now();
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let failed = false;
const assert = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) failed = true;
};

async function signUp(tag) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signUp({
    email: `del_${tag}_${ts}@huddle.test`,
    password: 'password123',
  });
  if (error) throw new Error(`signUp ${tag}: ${error.message}`);
  await c.from('profiles').update({ username: `del_${tag}_${ts}`.slice(0, 30) }).eq('id', data.user.id);
  return { client: c, user: data.user, token: data.session.access_token };
}

async function callDelete(actor) {
  const { data, error } = await actor.client.functions.invoke('delete-account', {
    body: {},
    headers: { Authorization: `Bearer ${actor.token}` },
  });
  if (error) {
    const ctx = error.context;
    let body = null;
    if (ctx && typeof ctx.json === 'function') {
      try {
        body = await ctx.json();
      } catch {
        body = null;
      }
    }
    return { status: ctx?.status ?? 0, body };
  }
  return { status: 200, body: data };
}

try {
  const a = await signUp('a');
  const b = await signUp('b');
  const c = await signUp('c');

  // A owns shared group G1 (admin); B and C are members.
  const { data: g1, error: g1e } = await a.client.rpc('create_group', { p_name: `G1 ${ts}` });
  if (g1e) throw new Error(`create G1: ${g1e.message}`);
  await admin.from('group_members').insert([
    { group_id: g1.id, user_id: b.user.id, role: 'member' },
    { group_id: g1.id, user_id: c.user.id, role: 'member' },
  ]);

  // C also owns a SOLO group G2 (only member) and proposes an idea in G1.
  const { data: g2, error: g2e } = await c.client.rpc('create_group', { p_name: `G2 ${ts}` });
  if (g2e) throw new Error(`create G2: ${g2e.message}`);
  const { data: idea, error: ie } = await c.client
    .from('ideas')
    .insert({ group_id: g1.id, proposed_by: c.user.id, title: 'C idea', category: 'food' })
    .select('id')
    .single();
  if (ie) throw new Error(`C idea: ${ie.message}`);

  // (1) A is the sole admin of shared G1 → refused.
  const r1 = await callDelete(a);
  assert(
    r1.status === 409 && r1.body?.error === 'sole_admin' &&
      (r1.body?.groups ?? []).some((g) => g.id === g1.id),
    'sole admin of a shared group is refused (409 sole_admin, names G1)',
  );

  // (2) B is a plain member → can delete.
  const r2 = await callDelete(b);
  assert(r2.status === 200 && r2.body?.ok, 'plain member can delete (200)');
  const { data: bProfile } = await admin.from('profiles').select('id').eq('id', b.user.id).maybeSingle();
  assert(!bProfile, 'deleted member profile is gone');

  // (3) C deletes → solo group removed, content de-attributed, shared group kept.
  const r3 = await callDelete(c);
  assert(r3.status === 200 && r3.body?.ok, 'member-with-solo-group can delete (200)');

  const { data: cProfile } = await admin.from('profiles').select('id').eq('id', c.user.id).maybeSingle();
  assert(!cProfile, 'C profile gone');
  const { data: g2row } = await admin.from('groups').select('id').eq('id', g2.id).maybeSingle();
  assert(!g2row, 'C solo group G2 deleted');
  const { data: g1row } = await admin.from('groups').select('id').eq('id', g1.id).maybeSingle();
  assert(!!g1row, 'shared group G1 survives');
  const { data: ideaRow } = await admin
    .from('ideas')
    .select('id, proposed_by')
    .eq('id', idea.id)
    .maybeSingle();
  assert(!!ideaRow, 'C idea survives in G1 (de-attributed, not deleted)');
  assert(ideaRow?.proposed_by === null, 'C idea.proposed_by is NULL');
  const { data: cMember } = await admin
    .from('group_members')
    .select('user_id')
    .eq('user_id', c.user.id)
    .maybeSingle();
  assert(!cMember, 'C membership cascaded away');
} catch (e) {
  console.error('ERROR:', e.message);
  failed = true;
}

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
