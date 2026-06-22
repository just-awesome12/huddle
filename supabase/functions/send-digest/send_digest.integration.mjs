/* eslint-disable no-console -- runnable diagnostic; printing is the point */
/**
 * Phase 16e — send-digest Edge Function integration test (selection + content).
 *
 * Needs a live local stack with the edge runtime serving send-digest:
 *
 *     supabase stop && supabase start   (or: docker restart the edge runtime)
 *     node supabase/functions/send-digest/send_digest.integration.mjs
 *
 * Uses `x-huddle-dry-run` so send-digest composes emails WITHOUT sending
 * (no Resend call) and `{ user_id }` to scope each run to one seeded user.
 * Asserts:
 *   - a member of a group with recent activity is selected, with the right
 *     group + subject in the composed sample
 *   - a user who opted out of the digest is NOT eligible
 *   - the wrong webhook secret is rejected (401)
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const SECRET = process.env.HUDDLE_WEBHOOK_SECRET ?? 'local-dev-webhook-secret';

const ts = Date.now();
const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = false;
const assert = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) failed = true;
};

async function signUp(tag) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signUp({
    email: `dg_${tag}_${ts}@huddle.test`,
    password: 'password123',
  });
  if (error) throw new Error(`signUp ${tag}: ${error.message}`);
  // A real (non-placeholder) username so digest_eligible_users includes them.
  await admin.from('profiles').update({ username: `dg_${tag}_${ts}`.slice(0, 30) }).eq('id', data.user.id);
  return data.user;
}

async function invoke(body, { secret = SECRET, dryRun = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-huddle-webhook-secret'] = secret;
  if (dryRun) headers['x-huddle-dry-run'] = '1';
  const resp = await fetch(`${URL}/functions/v1/send-digest`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let jsonBody = null;
  try {
    jsonBody = await resp.json();
  } catch {
    jsonBody = null;
  }
  return { status: resp.status, json: jsonBody };
}

try {
  const a = await signUp('a'); // member of an active group
  const b = await signUp('b'); // opted out of the digest

  // Group with recent activity, created by A (A becomes admin member).
  const { data: grp, error: grpErr } = await admin
    .from('groups')
    .insert({ name: `Digest Crew ${ts}`, created_by: a.id })
    .select('id')
    .single();
  if (grpErr) throw new Error(`group: ${grpErr.message}`);
  const groupId = grp.id;

  const { data: idea } = await admin
    .from('ideas')
    .insert({ group_id: groupId, proposed_by: a.id, title: `Taco night ${ts}`, category: 'food' })
    .select('id')
    .single();
  await admin.from('idea_comments').insert({
    group_id: groupId,
    idea_id: idea.id,
    author_id: a.id,
    body: 'I am in!',
  });

  // B opts out of the digest, and is a member of an active group too.
  await admin.from('notification_prefs').insert({ user_id: b.id, digest: false });
  await admin.from('group_members').insert({ group_id: groupId, user_id: b.id, role: 'member' });

  // --- A: selected, with the group + a recap subject ---
  const ra = await invoke({ user_id: a.id });
  assert(ra.status === 200, 'dry-run: 200');
  assert(ra.json?.eligible === 1, `A eligible (1), got ${ra.json?.eligible}`);
  assert(ra.json?.withActivity === 1, `A has activity (1), got ${ra.json?.withActivity}`);
  assert(ra.json?.sent === 0 && ra.json?.dryRun === true, 'dry-run sends nothing');
  const sampleA = ra.json?.samples?.[0];
  assert(sampleA?.email === `dg_a_${ts}@huddle.test`, "sample is A's email");
  assert(
    Array.isArray(sampleA?.groups) && sampleA.groups.includes(`Digest Crew ${ts}`),
    'sample names the active group',
  );
  assert(typeof sampleA?.subject === 'string' && /week/i.test(sampleA.subject), 'subject reads as a weekly recap');

  // --- B: opted out → not eligible ---
  const rb = await invoke({ user_id: b.id });
  assert(rb.status === 200 && rb.json?.eligible === 0, `B opted out → eligible 0, got ${rb.json?.eligible}`);

  // --- wrong secret → 401 ---
  const rbad = await invoke({ user_id: a.id }, { secret: 'nope' });
  assert(rbad.status === 401, 'wrong webhook secret → 401');
} catch (e) {
  console.error(e);
  failed = true;
}

console.log(`\nRESULT: ${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);
