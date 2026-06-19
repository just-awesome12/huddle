/* eslint-disable no-console -- this is a runnable diagnostic script; printing is the point */
/**
 * Phase 6 — Realtime RLS integration test (risk R-4).
 *
 * NOT part of `vitest run` — it needs a live local Supabase stack
 * (DB + realtime websocket reachable on 54321). Run on demand:
 *
 *     supabase start
 *     node packages/api-client/tests/realtime-rls.integration.mjs
 *
 * Asserts the empirical facts the Phase 6 architecture relies on:
 *   1. Postgres Changes DELIVERS to a member of the group (positive).
 *   2. Postgres Changes does NOT deliver a group's row changes to an
 *      AUTHENTICATED NON-member (the leak that R-4 warns about).
 *
 * (2) is the security property: it proves Realtime applies the table's
 * SELECT policy per subscriber, so we can use plain Postgres Changes
 * channels rather than a private-channel broadcast workaround.
 *
 * Exit code is non-zero on any failed assertion.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const WINDOW_MS = 4000;

const ts = Date.now();
const mkClient = () =>
  createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function signUpUser(client, tag) {
  const { data, error } = await client.auth.signUp({
    email: `rt_${tag}_${ts}@huddle.test`,
    password: 'password123',
  });
  if (error) throw new Error(`signUp(${tag}): ${error.message}`);
  await client
    .from('profiles')
    .update({ username: `rt_${tag}_${ts}`.slice(0, 30), display_name: `RT ${tag}` })
    .eq('id', data.user.id);
  return data;
}

function collectInserts(channel, groupId) {
  const hits = [];
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'ideas', filter: `group_id=eq.${groupId}` },
    (payload) => hits.push(payload.new?.title ?? '(no title)'),
  );
  return hits;
}

function awaitSubscribed(channel) {
  return new Promise((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') resolve();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`subscribe: ${status}${err ? ` (${err})` : ''}`));
      }
    });
  });
}

const A = mkClient();
const B = mkClient();
let failed = false;
const assert = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) failed = true;
};

try {
  const aSign = await signUpUser(A, 'a');
  const bSign = await signUpUser(B, 'b');

  const { data: group, error: gErr } = await A.rpc('create_group', {
    p_name: `RT Group ${ts}`,
  });
  if (gErr) throw new Error(`create_group: ${gErr.message}`);

  // Authenticate each realtime socket as its user — without this the
  // sockets are anon and the test proves nothing.
  await A.realtime.setAuth(aSign.session.access_token);
  await B.realtime.setAuth(bSign.session.access_token);

  const aChan = A.channel(`rt-test:${group.id}:a`);
  const bChan = B.channel(`rt-test:${group.id}:b`);
  const aHits = collectInserts(aChan, group.id);
  const bHits = collectInserts(bChan, group.id);
  await Promise.all([awaitSubscribed(aChan), awaitSubscribed(bChan)]);

  // A channel reports SUBSCRIBED as soon as it JOINS, but the server-side
  // postgres_changes replication takes a moment more to actually start
  // flowing — and a row inserted before it's ready is missed entirely, not
  // buffered. So insert in a retry loop until the member sees one (this is
  // pronounced right after a cold `supabase start`). The non-member must
  // still receive nothing throughout — that's the RLS property under test.
  let delivered = false;
  const deadline = Date.now() + 30000;
  let n = 0;
  while (!delivered && Date.now() < deadline) {
    n += 1;
    const { error: iErr } = await A.from('ideas').insert({
      group_id: group.id,
      proposed_by: aSign.user.id,
      title: `SECRET idea ${n}`,
      category: 'food',
    });
    if (iErr) throw new Error(`insert idea: ${iErr.message}`);
    await new Promise((r) => setTimeout(r, WINDOW_MS));
    delivered = aHits.length > 0;
  }
  // Give any (incorrect) leak to the non-member a beat to surface too.
  await new Promise((r) => setTimeout(r, 500));

  assert(delivered, 'member receives their group’s INSERT (delivery works)');
  assert(bHits.length === 0, 'authenticated NON-member receives nothing (RLS enforced, no leak)');

  await A.removeAllChannels();
  await B.removeAllChannels();
} catch (e) {
  console.error('ERROR:', e.message);
  failed = true;
}

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
