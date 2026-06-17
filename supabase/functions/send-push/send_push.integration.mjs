/* eslint-disable no-console -- runnable diagnostic; printing is the point */
/**
 * Phase 8 — send-push Edge Function integration test (selection + payload).
 *
 * Needs a live local stack with the edge runtime serving send-push:
 *
 *     supabase stop && supabase start
 *     node supabase/functions/send-push/send_push.integration.mjs
 *
 * Uses the `x-huddle-dry-run` header so send-push computes recipients and
 * messages WITHOUT dispatching to Expo — no external calls. Asserts:
 *   - new_idea excludes the actor and opted-out users; includes all of a
 *     recipient's devices
 *   - picker_ran reaches users who only opted out of new_idea
 *   - group_invite targets just the invited user; null invitee is skipped
 *   - the wrong webhook secret is rejected (401)
 *   - message payload shape (title/body/data.path)
 *
 * Seeds membership/tokens/prefs with the service role (this is a backend
 * logic test, not an RLS test — pgTAP covers RLS).
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
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
    email: `sp_${tag}_${ts}@huddle.test`,
    password: 'password123',
  });
  if (error) throw new Error(`signUp ${tag}: ${error.message}`);
  await c.from('profiles').update({ username: `sp_${tag}_${ts}`.slice(0, 30) }).eq('id', data.user.id);
  return data;
}

async function invoke(body, { secret = SECRET, dryRun = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-huddle-webhook-secret'] = secret;
  if (dryRun) headers['x-huddle-dry-run'] = '1';
  const resp = await fetch(`${URL}/functions/v1/send-push`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await resp.json();
  } catch {
    json = null;
  }
  return { status: resp.status, json };
}

try {
  const a = await signUp('a'); // actor
  const b = await signUp('b'); // member, default prefs, two devices
  const c = await signUp('c'); // member, opted out of new_idea

  // Seed the group directly with the service role (backend logic test).
  const { data: grp, error: grpErr } = await admin
    .from('groups')
    .insert({ name: `SP ${ts}`, created_by: a.user.id })
    .select('id')
    .single();
  if (grpErr) throw new Error(`group: ${grpErr.message}`);
  const groupId = grp.id;

  // Memberships: a is added as admin by the creator-membership trigger
  // (D45) when the group row is inserted, so only add b and c here.
  const { error: memErr } = await admin.from('group_members').insert([
    { group_id: groupId, user_id: b.user.id, role: 'member' },
    { group_id: groupId, user_id: c.user.id, role: 'member' },
  ]);
  if (memErr) throw new Error(`members: ${memErr.message}`);

  // Tokens: a 1, b 2 (two devices), c 1.
  await admin.from('push_tokens').insert([
    { user_id: a.user.id, expo_token: `ExponentPushToken[a-${ts}]`, platform: 'ios' },
    { user_id: b.user.id, expo_token: `ExponentPushToken[b1-${ts}]`, platform: 'ios' },
    { user_id: b.user.id, expo_token: `ExponentPushToken[b2-${ts}]`, platform: 'android' },
    { user_id: c.user.id, expo_token: `ExponentPushToken[c-${ts}]`, platform: 'ios' },
  ]);

  // c opts out of new_idea only.
  await admin.from('notification_prefs').insert({
    user_id: c.user.id,
    new_idea: false,
    picker_ran: true,
    group_invite: true,
  });

  // An idea + decision to reference.
  const { data: idea } = await admin
    .from('ideas')
    .insert({ group_id: groupId, proposed_by: a.user.id, title: 'Tacos', category: 'food' })
    .select('id')
    .single();

  // --- new_idea: actor (a) excluded, c opted out → only b's two devices ---
  const r1 = await invoke({
    type: 'INSERT',
    table: 'ideas',
    record: { id: idea.id, group_id: groupId, proposed_by: a.user.id, title: 'Tacos' },
  });
  assert(r1.status === 200, 'new_idea: 200');
  assert(r1.json?.recipientCount === 2, `new_idea: 2 recipients (b's two devices), got ${r1.json?.recipientCount}`);
  assert(
    r1.json?.sampleMessage?.title?.includes('New idea') &&
      r1.json?.sampleMessage?.data?.path === `/groups/${groupId}/ideas/${idea.id}`,
    'new_idea: message title + deep-link path',
  );

  // --- picker_ran: c did NOT opt out → b(2) + c(1) = 3 ---
  const r2 = await invoke({
    type: 'INSERT',
    table: 'decisions',
    record: { id: `d-${ts}`, group_id: groupId, run_by: a.user.id, chosen_idea_id: idea.id },
  });
  assert(r2.status === 200 && r2.json?.recipientCount === 3, `picker_ran: 3 recipients, got ${r2.json?.recipientCount}`);
  assert(r2.json?.sampleMessage?.body === 'Tacos', 'picker_ran: body is the chosen idea title');

  // --- group_invite: only the invited user (c, 1 device) ---
  const r3 = await invoke({
    type: 'INSERT',
    table: 'group_invites',
    record: {
      id: `i-${ts}`,
      group_id: groupId,
      invited_by: a.user.id,
      invited_user_id: c.user.id,
      token: 'tok123',
    },
  });
  assert(r3.status === 200 && r3.json?.recipientCount === 1, `group_invite: 1 recipient, got ${r3.json?.recipientCount}`);
  assert(r3.json?.sampleMessage?.data?.path === '/invites/tok123', 'group_invite: deep-link to the invite');

  // --- group_invite with no target user → skipped ---
  const r4 = await invoke({
    type: 'INSERT',
    table: 'group_invites',
    record: { id: `i2-${ts}`, group_id: groupId, invited_by: a.user.id, invited_user_id: null },
  });
  assert(r4.status === 200 && r4.json?.recipientCount === 0 && r4.json?.skipped, 'link/email invite (no user) is skipped');

  // --- wrong secret is rejected ---
  const r5 = await invoke(
    { type: 'INSERT', table: 'ideas', record: { id: idea.id, group_id: groupId, proposed_by: a.user.id } },
    { secret: 'wrong' },
  );
  assert(r5.status === 401, 'wrong webhook secret → 401');
} catch (e) {
  console.error('ERROR:', e.message);
  failed = true;
}

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
