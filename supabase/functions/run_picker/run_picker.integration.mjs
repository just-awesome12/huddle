/* eslint-disable no-console -- runnable diagnostic; printing is the point */
/**
 * Phase 7 — run_picker Edge Function integration test.
 *
 * NOT part of `vitest run` — it needs a live local Supabase stack with
 * the edge runtime serving functions. After any change to the function
 * or to config.toml's [edge_runtime]/[functions] blocks:
 *
 *     supabase stop && supabase start
 *     node supabase/functions/run_picker/run_picker.integration.mjs
 *
 * Asserts the behaviour the picker UI relies on:
 *   1. A member gets a recorded decision whose chosen idea is one of the
 *      candidates (the happy path; also proves the service-role insert).
 *   2. A NON-member is refused (403 forbidden) — RLS membership gate.
 *   3. Too few candidates after filtering → 422 too_few_candidates.
 *   4. A shortlist actually narrows the candidate pool.
 *
 * Exit code is non-zero on any failed assertion.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const ts = Date.now();
const mkClient = () =>
  createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function signUpUser(client, tag) {
  const { data, error } = await client.auth.signUp({
    email: `pick_${tag}_${ts}@huddle.test`,
    password: 'password123',
  });
  if (error) throw new Error(`signUp(${tag}): ${error.message}`);
  await client
    .from('profiles')
    .update({ username: `pick_${tag}_${ts}`.slice(0, 30), display_name: `Pick ${tag}` })
    .eq('id', data.user.id);
  return data;
}

/** Invoke run_picker, returning { status, body } regardless of outcome. */
async function invoke(client, body) {
  const { data, error } = await client.functions.invoke('run_picker', { body });
  if (error) {
    const ctx = error.context;
    let parsed = null;
    if (ctx && typeof ctx.json === 'function') {
      try {
        parsed = await ctx.json();
      } catch {
        parsed = null;
      }
    }
    return { status: ctx?.status ?? 0, body: parsed };
  }
  return { status: 200, body: data };
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
  await signUpUser(B, 'b');

  const { data: group, error: gErr } = await A.rpc('create_group', {
    p_name: `Pick Group ${ts}`,
  });
  if (gErr) throw new Error(`create_group: ${gErr.message}`);

  // Three on-radar ideas: two food, one activity.
  const ideaSpecs = [
    { title: 'Tacos', category: 'food' },
    { title: 'Ramen', category: 'food' },
    { title: 'Bowling', category: 'activity' },
  ];
  const ideaIds = {};
  for (const spec of ideaSpecs) {
    const { data, error } = await A.from('ideas')
      .insert({ group_id: group.id, proposed_by: aSign.user.id, ...spec })
      .select('id')
      .single();
    if (error) throw new Error(`insert idea ${spec.title}: ${error.message}`);
    ideaIds[spec.title] = data.id;
  }
  const allIds = Object.values(ideaIds);

  // (1) Happy path — member, no filters.
  const r1 = await invoke(A, { groupId: group.id, filters: { category: null, shortlist: null } });
  assert(r1.status === 200, 'member receives 200 from run_picker');
  assert(
    r1.body?.chosenIdeaId && allIds.includes(r1.body.chosenIdeaId),
    'chosen idea is one of the candidates',
  );
  assert(
    r1.body?.decision?.candidate_idea_ids?.length === 3,
    'decision records all 3 candidates',
  );
  assert(
    r1.body?.decision?.chosen_idea_id === r1.body?.chosenIdeaId,
    'decision row chosen_idea_id matches returned chosenIdeaId',
  );

  // (2) Non-member is refused.
  const r2 = await invoke(B, { groupId: group.id, filters: {} });
  assert(r2.status === 403 && r2.body?.error === 'forbidden', 'non-member gets 403 forbidden');

  // (3) Category filter that leaves only 1 candidate → too few.
  const r3 = await invoke(A, { groupId: group.id, filters: { category: 'activity' } });
  assert(
    r3.status === 422 && r3.body?.error === 'too_few_candidates' && r3.body?.count === 1,
    'single-candidate filter → 422 too_few_candidates (count 1)',
  );

  // (4) Shortlist narrows the pool to exactly the two listed ideas.
  const shortlist = [ideaIds.Tacos, ideaIds.Ramen];
  const r4 = await invoke(A, { groupId: group.id, filters: { shortlist } });
  assert(r4.status === 200, 'shortlisted pick returns 200');
  assert(
    r4.body?.decision?.candidate_idea_ids?.length === 2 &&
      shortlist.includes(r4.body?.chosenIdeaId),
    'shortlist narrows candidates to the 2 listed ideas',
  );

  // (5) Fair mode runs, returns a valid pick, and records the flag. (The
  // weighting math itself is unit-tested deterministically in @huddle/core;
  // here we just verify the Edge Function wiring.)
  const r5 = await invoke(A, {
    groupId: group.id,
    fair: true,
    filters: { category: null, shortlist: null, fair: true },
  });
  assert(
    r5.status === 200 && allIds.includes(r5.body?.chosenIdeaId),
    'fair mode returns 200 with a valid pick',
  );
  assert(r5.body?.decision?.filters?.fair === true, 'fair mode records filters.fair = true');

  // (6) "Just decide" fallback (15c): a group with only 1 on-radar idea but
  // a past `done` pick. Unfiltered run without fallback → too few; WITH
  // fallback → the done idea joins the pool and a pick is made.
  const { data: fgroup, error: fgErr } = await A.rpc('create_group', {
    p_name: `Fallback Group ${ts}`,
  });
  if (fgErr) throw new Error(`create_group(fallback): ${fgErr.message}`);
  const { data: onRadar } = await A.from('ideas')
    .insert({ group_id: fgroup.id, proposed_by: aSign.user.id, title: 'Sushi', category: 'food' })
    .select('id')
    .single();
  await A.from('ideas').insert({
    group_id: fgroup.id,
    proposed_by: aSign.user.id,
    title: 'Past pizza',
    category: 'food',
    status: 'done',
  });

  const rNoFb = await invoke(A, { groupId: fgroup.id, filters: {} });
  assert(
    rNoFb.status === 422 && rNoFb.body?.error === 'too_few_candidates',
    'fallback off: 1 on-radar idea → 422 too_few_candidates',
  );

  const rFb = await invoke(A, { groupId: fgroup.id, fallback: true, filters: {} });
  assert(
    rFb.status === 200 && rFb.body?.decision?.candidate_idea_ids?.length === 2,
    `fallback on: done idea joins the pool → pick from 2, got ${rFb.body?.decision?.candidate_idea_ids?.length}`,
  );
  assert(
    rFb.body?.decision?.filters?.fallback === true && allIds.indexOf(rFb.body?.chosenIdeaId) === -1,
    'fallback records filters.fallback = true and can pick the on-radar or done idea',
  );
  // Sanity: the on-radar idea is among the candidates.
  assert(
    rFb.body?.decision?.candidate_idea_ids?.includes(onRadar.id),
    'fallback pool includes the on-radar idea',
  );

  // The chosen idea now has history → it cannot be hard-deleted (NO ACTION).
  const { error: delErr } = await A.from('ideas').delete().eq('id', r1.body.chosenIdeaId);
  assert(
    !!delErr && delErr.code === '23503',
    'a chosen idea cannot be hard-deleted (FK 23503 — dismiss instead)',
  );
} catch (e) {
  console.error('ERROR:', e.message);
  failed = true;
}

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
