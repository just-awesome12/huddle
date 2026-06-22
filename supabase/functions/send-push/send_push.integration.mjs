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

  // Seed the idea FIRST, before members/tokens. Inserting an idea fires the
  // ideas_send_push pg_net trigger → a REAL (non-dry-run) send-push that
  // dispatches to the Expo API; the fake tokens come back
  // DeviceNotRegistered and get PRUNED. By creating the idea while there are
  // no members/tokens yet, that real dispatch is a no-op (nothing to prune),
  // and the brief wait lets the async pg_net request drain before we seed the
  // tokens the dry-run assertions depend on. (Was the root cause of flaky
  // low recipient counts — the prune raced the assertions.)
  const { data: idea } = await admin
    .from('ideas')
    .insert({ group_id: groupId, proposed_by: a.user.id, title: 'Tacos', category: 'food' })
    .select('id')
    .single();
  await new Promise((r) => setTimeout(r, 4000));

  // Memberships: a is added as admin by the creator-membership trigger
  // (D45) when the group row is inserted, so only add b and c here.
  const { error: memErr } = await admin.from('group_members').insert([
    { group_id: groupId, user_id: b.user.id, role: 'member' },
    { group_id: groupId, user_id: c.user.id, role: 'member' },
  ]);
  if (memErr) throw new Error(`members: ${memErr.message}`);

  // Tokens: a 1, b 2 (two devices), c 1. No more real ideas are inserted
  // after this, so nothing will prune them.
  const { error: tokErr } = await admin.from('push_tokens').insert([
    { user_id: a.user.id, expo_token: `ExponentPushToken[a-${ts}]`, platform: 'ios' },
    { user_id: b.user.id, expo_token: `ExponentPushToken[b1-${ts}]`, platform: 'ios' },
    { user_id: b.user.id, expo_token: `ExponentPushToken[b2-${ts}]`, platform: 'android' },
    { user_id: c.user.id, expo_token: `ExponentPushToken[c-${ts}]`, platform: 'ios' },
  ]);
  if (tokErr) throw new Error(`tokens: ${tokErr.message}`);

  // Web push (Phase 15): give b one browser subscription. Same selection
  // rules as Expo tokens, so for new_idea (actor a excluded, c opted out)
  // b is the only eligible web subscriber.
  await admin.from('web_push_subscriptions').insert({
    user_id: b.user.id,
    endpoint: `https://push.example/${ts}-b`,
    p256dh: 'p256dh-b',
    auth: 'auth-b',
  });

  // c opts out of new_idea only.
  await admin.from('notification_prefs').insert({
    user_id: c.user.id,
    new_idea: false,
    picker_ran: true,
    group_invite: true,
  });

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
  // Web push (Phase 15): b is the only eligible web subscriber.
  assert(
    r1.json?.webRecipientCount === 1,
    `new_idea: 1 web subscriber (b), got ${r1.json?.webRecipientCount}`,
  );
  assert(
    typeof r1.json?.sampleWebPayload === 'string' &&
      JSON.parse(r1.json.sampleWebPayload)?.data?.path === `/groups/${groupId}/ideas/${idea.id}`,
    'new_idea: web payload carries title/body + deep-link path',
  );

  // --- picker_ran: c did NOT opt out → b(2) + c(1) = 3 ---
  const r2 = await invoke({
    type: 'INSERT',
    table: 'decisions',
    record: { id: `d-${ts}`, group_id: groupId, run_by: a.user.id, chosen_idea_id: idea.id },
  });
  assert(r2.status === 200 && r2.json?.recipientCount === 3, `picker_ran: 3 recipients, got ${r2.json?.recipientCount}`);
  assert(r2.json?.sampleMessage?.body === 'Tacos', 'picker_ran: body is the chosen idea title');

  // --- new_comment: actor (a) excluded → b(2) + c(1) = 3 ---
  // c only opted out of new_idea, so they still get comment pushes.
  const rc = await invoke({
    type: 'INSERT',
    table: 'idea_comments',
    record: {
      id: `cm-${ts}`,
      group_id: groupId,
      idea_id: idea.id,
      author_id: a.user.id,
      body: 'Looks great',
    },
  });
  assert(
    rc.status === 200 && rc.json?.recipientCount === 3,
    `new_comment: 3 recipients, got ${rc.json?.recipientCount}`,
  );
  assert(
    rc.json?.sampleMessage?.title?.includes('New comment') &&
      rc.json?.sampleMessage?.data?.path === `/groups/${groupId}/ideas/${idea.id}`,
    'new_comment: message title + deep-link to the idea',
  );

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

  // --- join_request: requester (c) → group admins (a, 1 device) ---
  const rj1 = await invoke({
    type: 'INSERT',
    table: 'group_join_requests',
    record: { id: `jr-${ts}`, group_id: groupId, user_id: c.user.id, status: 'pending' },
  });
  assert(
    rj1.status === 200 && rj1.json?.recipientCount === 1,
    `join_request: 1 admin recipient (a), got ${rj1.json?.recipientCount}`,
  );
  assert(
    rj1.json?.event === 'join_request' &&
      rj1.json?.sampleMessage?.data?.path === `/groups/${groupId}/settings`,
    'join_request: event + deep-link to settings',
  );

  // --- join_approved: the requester (c) is notified; approver (a) is actor ---
  const rj2 = await invoke({
    type: 'UPDATE',
    table: 'group_join_requests',
    record: {
      id: `jr-${ts}`,
      group_id: groupId,
      user_id: c.user.id,
      status: 'approved',
      decided_by: a.user.id,
    },
  });
  assert(
    rj2.status === 200 && rj2.json?.recipientCount === 1,
    `join_approved: 1 recipient (requester c), got ${rj2.json?.recipientCount}`,
  );
  assert(
    rj2.json?.event === 'join_approved' &&
      rj2.json?.sampleMessage?.data?.path === `/groups/${groupId}`,
    'join_approved: event + deep-link to the group',
  );

  // --- group_nudge (Phase 17): scheduled inactivity nudge → all members ---
  // scope 'members', system-generated (no actor exclusion) → every member's
  // devices: a(1) + b(2) + c(1) = 4. c only opted out of new_idea, so nudge
  // still reaches them.
  const rn = await invoke({
    type: 'SCHEDULED',
    table: 'group_nudge',
    record: { group_id: groupId },
  });
  assert(
    rn.status === 200 && rn.json?.recipientCount === 4,
    `group_nudge: 4 recipients (all members' devices), got ${rn.json?.recipientCount}`,
  );
  assert(
    rn.json?.event === 'nudge' && rn.json?.sampleMessage?.data?.path === `/groups/${groupId}`,
    'group_nudge: nudge event + deep-link to the group',
  );

  // --- reaction (15b.2): targeted to the idea's proposer (a), minus self ---
  const rreact = await invoke({
    type: 'INSERT',
    table: 'reactions',
    record: {
      id: `rx-${ts}`,
      group_id: groupId,
      target_type: 'idea',
      target_id: idea.id,
      user_id: b.user.id,
      emoji: '🔥',
    },
  });
  assert(
    rreact.status === 200 && rreact.json?.event === 'reaction' && rreact.json?.recipientCount === 1,
    `reaction: notifies only the idea proposer (a), got ${rreact.json?.recipientCount}`,
  );
  assert(
    rreact.json?.sampleMessage?.data?.path === `/groups/${groupId}/ideas/${idea.id}`,
    'reaction: deep-link to the reacted idea',
  );

  const rreactSelf = await invoke({
    type: 'INSERT',
    table: 'reactions',
    record: {
      id: `rxs-${ts}`,
      group_id: groupId,
      target_type: 'idea',
      target_id: idea.id,
      user_id: a.user.id,
      emoji: '🔥',
    },
  });
  assert(
    rreactSelf.status === 200 && rreactSelf.json?.recipientCount === 0,
    `reaction: a self-reaction notifies no one, got ${rreactSelf.json?.recipientCount}`,
  );

  // --- rsvp (15b.2): "going" targets the idea's proposer (a) ---
  const rrsvp = await invoke({
    type: 'INSERT',
    table: 'idea_rsvps',
    record: { idea_id: idea.id, group_id: groupId, user_id: b.user.id, status: 'going' },
  });
  assert(
    rrsvp.status === 200 && rrsvp.json?.event === 'rsvp' && rrsvp.json?.recipientCount === 1,
    `rsvp: "going" notifies the proposer (a), got ${rrsvp.json?.recipientCount}`,
  );

  // --- mention (16c): a wall post @mentioning b notifies only b ---
  const rwall = await invoke({
    type: 'INSERT',
    table: 'group_posts',
    record: {
      id: `wp-${ts}`,
      group_id: groupId,
      author_id: a.user.id,
      body: `hey @sp_b_${ts} are you in?`,
    },
  });
  assert(
    rwall.status === 200 && rwall.json?.event === 'mention' && rwall.json?.recipientCount === 2,
    `mention(wall): @b notified (b's 2 devices), got ${rwall.json?.recipientCount}`,
  );
  assert(
    rwall.json?.sampleMessage?.data?.path === `/groups/${groupId}/wall`,
    'mention(wall): deep-link to the wall',
  );

  // A wall post with no @mention pushes nothing (the wall doesn't broadcast).
  const rwall0 = await invoke({
    type: 'INSERT',
    table: 'group_posts',
    record: { id: `wp0-${ts}`, group_id: groupId, author_id: a.user.id, body: 'just chatting' },
  });
  assert(
    rwall0.status === 200 && rwall0.json?.skipped,
    'mention(wall): a post with no mention is skipped',
  );

  // --- mention (16c): a comment @mentioning b → b gets `mention`, others
  // still get `new_comment` (b excluded from the broadcast, no double-ping) ---
  const rcm = await invoke({
    type: 'INSERT',
    table: 'idea_comments',
    record: {
      id: `cm-${ts}`,
      group_id: groupId,
      idea_id: idea.id,
      author_id: a.user.id,
      body: `@sp_b_${ts} what do you think?`,
    },
  });
  const cmDispatches = rcm.json?.dispatches ?? [];
  const cmMention = cmDispatches.find((d) => d.event === 'mention');
  const cmComment = cmDispatches.find((d) => d.event === 'new_comment');
  assert(
    rcm.status === 200 && cmMention?.recipientCount === 2,
    `mention(comment): @b notified via mention (2 devices), got ${cmMention?.recipientCount}`,
  );
  assert(
    cmComment?.recipientCount === 1,
    `mention(comment): new_comment excludes the mentioned b → only c (1), got ${cmComment?.recipientCount}`,
  );

  // --- per-group mute (15b): c mutes the group → excluded from push ---
  await admin
    .from('group_notification_prefs')
    .insert({ user_id: c.user.id, group_id: groupId, muted: true });
  const rmute = await invoke({
    type: 'INSERT',
    table: 'decisions',
    record: { id: `dm-${ts}`, group_id: groupId, run_by: a.user.id, chosen_idea_id: idea.id },
  });
  assert(
    rmute.status === 200 && rmute.json?.recipientCount === 2,
    `mute: c muted the group → picker_ran drops to 2 (b's 2 devices only), got ${rmute.json?.recipientCount}`,
  );

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
