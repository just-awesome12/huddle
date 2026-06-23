// =====================================================================
// send-digest — compose + email the weekly per-user recap (Phase 16e)
// =====================================================================
// Invoked by the weekly pg_cron job (dispatch_weekly_digest → pg_net), not
// users: verify_jwt is off and it authenticates with the shared
// x-huddle-webhook-secret (same secret as send-push). It reads recipients +
// activity as service_role and emails each user a recap of what happened in
// their groups in the last 7 days.
//
// PROVIDER: production sends via Resend (RESEND_API_KEY + RESEND_FROM). With
// no key configured (local/dev) it logs and no-ops — so the whole feature
// builds + tests without an email account, mirroring send-push's posture.
//
// TESTABILITY: `x-huddle-dry-run: 1` (with a valid secret) computes
// recipients + composes emails and returns samples WITHOUT sending or
// stamping last_digest_at — the integration probe asserts selection +
// content with no external call (D67). An optional `{ "user_id": "..." }`
// body scopes the run to one user (used by the probe; the cron sends `{}`).
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.47.10';
import { buildDigestEmail, type UserDigest, type DigestGroup } from '../_shared/digest.ts';

const DEV_WEBHOOK_SECRET = 'local-dev-webhook-secret';
const WINDOW_DAYS = 7;
const COOLDOWN_DAYS = 6;

type Service = ReturnType<typeof createClient>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getService(): Service | null {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Send one email. Resend in prod; a logged no-op when RESEND_API_KEY is
 * absent (local/dev). Never throws — a provider failure is logged and the
 * run continues (best-effort, like send-push dispatch).
 */
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM') ?? 'Powwow <onboarding@resend.dev>';
  if (!apiKey) {
    console.log(`send-digest: would email ${to} — "${subject}" (no RESEND_API_KEY; skipping send)`);
    return { sent: false };
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!resp.ok) {
      console.error(`send-digest: resend ${resp.status}: ${await resp.text()}`);
      return { sent: false, error: `resend_${resp.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error('send-digest: resend threw', e);
    return { sent: false, error: 'resend_threw' };
  }
}

interface EligibleUser {
  user_id: string;
  email: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Auth: fail closed outside local (D65), same shared secret as send-push.
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const isLocal =
    !supabaseUrl.startsWith('https://') ||
    supabaseUrl.includes('127.0.0.1') ||
    supabaseUrl.includes('localhost');
  const configuredSecret = Deno.env.get('HUDDLE_WEBHOOK_SECRET');
  if (!configuredSecret && !isLocal) {
    console.error('send-digest: HUDDLE_WEBHOOK_SECRET is required in production');
    return json({ error: 'misconfigured' }, 500);
  }
  const expected = configuredSecret ?? DEV_WEBHOOK_SECRET;
  if (req.headers.get('x-huddle-webhook-secret') !== expected) {
    return json({ error: 'unauthorized' }, 401);
  }
  const dryRun = req.headers.get('x-huddle-dry-run') === '1';

  // Body is optional ({} from cron); an explicit user_id scopes the run.
  let onlyUserId: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.user_id === 'string') onlyUserId = body.user_id;
  } catch {
    // empty/invalid body → treat as "all users"
  }

  const service = getService();
  if (!service) {
    console.error('send-digest: missing SUPABASE_* env');
    return json({ error: 'internal' }, 500);
  }

  const appUrl = Deno.env.get('DIGEST_APP_URL') ?? 'https://powwow.co';
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const { data: eligibleRaw, error: eligErr } = await service.rpc('digest_eligible_users', {
    p_cooldown_days: COOLDOWN_DAYS,
  });
  if (eligErr) {
    console.error('send-digest: digest_eligible_users failed', eligErr);
    return json({ error: 'internal' }, 500);
  }
  let eligible = (eligibleRaw ?? []) as EligibleUser[];
  if (onlyUserId) eligible = eligible.filter((u) => u.user_id === onlyUserId);

  // Display names for personalization (one read).
  const names = new Map<string, string>();
  if (eligible.length > 0) {
    const { data: profiles } = await service
      .from('profiles')
      .select('id, display_name')
      .in(
        'id',
        eligible.map((u) => u.user_id),
      );
    for (const p of profiles ?? []) names.set(p.id as string, p.display_name as string);
  }

  const samples: { email: string; subject: string; groups: string[] }[] = [];
  const sentUserIds: string[] = [];
  let withActivity = 0;

  for (const u of eligible) {
    const { data: groups, error: digErr } = await service.rpc('get_user_digest', {
      p_user: u.user_id,
      p_since: since,
    });
    if (digErr) {
      console.error(`send-digest: get_user_digest failed for ${u.user_id}`, digErr);
      continue;
    }
    const groupList = (groups ?? []) as DigestGroup[];
    if (groupList.length === 0) continue; // nothing happened — don't email
    withActivity++;

    const digest: UserDigest = {
      email: u.email,
      displayName: names.get(u.user_id) ?? null,
      groups: groupList,
    };
    const { subject, html, text } = buildDigestEmail(digest, appUrl);

    if (samples.length < 10) {
      samples.push({ email: u.email, subject, groups: groupList.map((g) => g.name) });
    }
    if (!dryRun) {
      const { sent } = await sendEmail(u.email, subject, html, text);
      if (sent) sentUserIds.push(u.user_id);
    }
  }

  // Stamp last_digest_at for everyone we actually emailed (live only).
  if (!dryRun && sentUserIds.length > 0) {
    const { error: stampErr } = await service
      .from('profiles')
      .update({ last_digest_at: new Date().toISOString() })
      .in('id', sentUserIds);
    if (stampErr) console.error('send-digest: stamping last_digest_at failed', stampErr);
  }

  return json({
    ok: true,
    dryRun,
    eligible: eligible.length,
    withActivity,
    sent: sentUserIds.length,
    samples,
  });
});
