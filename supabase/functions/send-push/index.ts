// =====================================================================
// send-push — fan out push notifications (Phase 8)
// =====================================================================
// Invoked by Postgres Database Webhooks (pg_net) on INSERT into ideas,
// decisions, and group_invites (migration 017). It is NOT user-facing:
// `verify_jwt = false`, and it authenticates the caller with a shared
// secret header (`x-huddle-webhook-secret`). It reads recipients as
// service_role and dispatches to the Expo Push API.
//
// SECURITY (mirrors Turnstile D35/D37/D38): locally the secret falls
// back to a well-known dev value so no env wiring is needed; PRODUCTION
// MUST set HUDDLE_WEBHOOK_SECRET. Phase 9 adds a boot assertion that
// refuses the dev fallback outside local — until then this is a
// documented deferral.
//
// Testability: a request carrying `x-huddle-dry-run: 1` (with a valid
// secret) computes recipients + messages and returns them WITHOUT
// dispatching — the integration probe uses this to assert selection and
// payload shape with no external calls.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.47.10';
import {
  selectRecipientTokens,
  buildExpoMessages,
  chunk,
  EXPO_PUSH_CHUNK_SIZE,
  type NotificationEvent,
  type NotificationPrefs,
  type Recipient,
  type NotificationContent,
} from '../_shared/notifications.ts';

const DEV_WEBHOOK_SECRET = 'local-dev-webhook-secret';
const DEFAULT_EXPO_URL = 'https://exp.host/--/api/v2/push/send';

interface WebhookPayload {
  type?: string;
  table?: string;
  schema?: string;
  record?: Record<string, unknown> | null;
}

type Service = ReturnType<typeof createClient>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Group-name lookup (used in two event types). */
async function groupName(service: Service, groupId: string): Promise<string> {
  const { data } = await service.from('groups').select('name').eq('id', groupId).maybeSingle();
  return (data?.name as string) ?? 'your group';
}

/** Build Recipient[] for a set of user ids (their tokens × their prefs). */
async function recipientsForUsers(service: Service, userIds: string[]): Promise<Recipient[]> {
  if (userIds.length === 0) return [];
  const [{ data: tokens }, { data: prefs }] = await Promise.all([
    service.from('push_tokens').select('user_id, expo_token').in('user_id', userIds),
    service.from('notification_prefs').select('*').in('user_id', userIds),
  ]);
  const prefsByUser = new Map<string, NotificationPrefs>();
  for (const p of prefs ?? []) {
    prefsByUser.set(p.user_id as string, {
      new_idea: p.new_idea as boolean,
      picker_ran: p.picker_ran as boolean,
      group_invite: p.group_invite as boolean,
      new_comment: p.new_comment as boolean,
    });
  }
  return (tokens ?? []).map((t) => ({
    userId: t.user_id as string,
    expoToken: t.expo_token as string,
    prefs: prefsByUser.get(t.user_id as string) ?? null,
  }));
}

async function memberIds(service: Service, groupId: string): Promise<string[]> {
  const { data } = await service.from('group_members').select('user_id').eq('group_id', groupId);
  return (data ?? []).map((m) => m.user_id as string);
}

interface Resolved {
  event: NotificationEvent;
  actorId: string | null;
  recipientUserIds: string[];
  content: NotificationContent;
}

/** Turn a webhook record into the event, recipients, and message content. */
async function resolve(
  service: Service,
  table: string,
  record: Record<string, unknown>,
): Promise<Resolved | { skip: string }> {
  if (table === 'ideas') {
    const groupId = str(record.group_id);
    const ideaId = str(record.id);
    if (!groupId || !ideaId) return { skip: 'missing ideas fields' };
    const name = await groupName(service, groupId);
    return {
      event: 'new_idea',
      actorId: str(record.proposed_by),
      recipientUserIds: await memberIds(service, groupId),
      content: {
        title: `New idea in ${name}`,
        body: str(record.title) ?? 'A new idea was added',
        data: { path: `/groups/${groupId}/ideas/${ideaId}` },
      },
    };
  }

  if (table === 'idea_comments') {
    const groupId = str(record.group_id);
    const ideaId = str(record.idea_id);
    if (!groupId || !ideaId) return { skip: 'missing idea_comments fields' };
    const [name, idea] = await Promise.all([
      groupName(service, groupId),
      service.from('ideas').select('title').eq('id', ideaId).maybeSingle(),
    ]);
    const ideaTitle = (idea.data?.title as string) ?? 'an idea';
    const body = str(record.body) ?? 'New comment';
    return {
      event: 'new_comment',
      actorId: str(record.author_id),
      recipientUserIds: await memberIds(service, groupId),
      content: {
        title: `New comment in ${name}`,
        body: `${ideaTitle}: ${body}`,
        data: { path: `/groups/${groupId}/ideas/${ideaId}` },
      },
    };
  }

  if (table === 'decisions') {
    const groupId = str(record.group_id);
    const chosenId = str(record.chosen_idea_id);
    if (!groupId) return { skip: 'missing decisions fields' };
    const [name, chosen] = await Promise.all([
      groupName(service, groupId),
      chosenId
        ? service.from('ideas').select('title').eq('id', chosenId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const chosenTitle = (chosen.data?.title as string) ?? 'an idea';
    return {
      event: 'picker_ran',
      actorId: str(record.run_by),
      recipientUserIds: await memberIds(service, groupId),
      content: {
        title: `The picker chose for ${name}`,
        body: chosenTitle,
        data: { path: `/groups/${groupId}/history` },
      },
    };
  }

  if (table === 'group_invites') {
    const invitedUserId = str(record.invited_user_id);
    // Link / email invites have no in-app recipient — nothing to push.
    if (!invitedUserId) return { skip: 'invite has no target user' };
    const groupId = str(record.group_id);
    const invitedBy = str(record.invited_by);
    const [name, inviter] = await Promise.all([
      groupId ? groupName(service, groupId) : Promise.resolve('a group'),
      invitedBy
        ? service.from('profiles').select('display_name').eq('id', invitedBy).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const inviterName = (inviter.data?.display_name as string) ?? 'Someone';
    const token = str(record.token);
    return {
      event: 'group_invite',
      actorId: invitedBy, // the inviter; the invitee is the recipient
      recipientUserIds: [invitedUserId],
      content: {
        title: 'Group invite',
        body: `${inviterName} invited you to ${name}`,
        data: { path: token ? `/invites/${token}` : `/groups` },
      },
    };
  }

  return { skip: `unsupported table: ${table}` };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // --- Authenticate the webhook ---
  // Fail closed (Phase 9, D65): outside local the dev fallback secret is
  // NOT allowed — production must set HUDDLE_WEBHOOK_SECRET explicitly.
  // Local Supabase serves over http (kong/127.0.0.1); hosted is https.
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const isLocal =
    !supabaseUrl.startsWith('https://') ||
    supabaseUrl.includes('127.0.0.1') ||
    supabaseUrl.includes('localhost');
  const configuredSecret = Deno.env.get('HUDDLE_WEBHOOK_SECRET');
  if (!configuredSecret && !isLocal) {
    console.error('send-push: HUDDLE_WEBHOOK_SECRET is required in production');
    return json({ error: 'misconfigured' }, 500);
  }
  const expected = configuredSecret ?? DEV_WEBHOOK_SECRET;
  if (req.headers.get('x-huddle-webhook-secret') !== expected) {
    return json({ error: 'unauthorized' }, 401);
  }
  const dryRun = req.headers.get('x-huddle-dry-run') === '1';

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const table = str(payload.table);
  const record = payload.record;
  if (!table || !record || typeof record !== 'object') {
    return json({ error: 'bad_request' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    console.error('send-push: missing SUPABASE_* env');
    return json({ error: 'internal' }, 500);
  }
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const resolved = await resolve(service, table, record);
    if ('skip' in resolved) {
      return json({ ok: true, skipped: resolved.skip, recipientCount: 0 });
    }

    const recipients = await recipientsForUsers(service, resolved.recipientUserIds);
    const tokens = selectRecipientTokens(recipients, resolved.event, resolved.actorId);
    const messages = buildExpoMessages(tokens, resolved.content);

    if (dryRun) {
      return json({
        ok: true,
        event: resolved.event,
        recipientCount: tokens.length,
        dispatched: false,
        selectedTokens: tokens,
        sampleMessage: messages[0] ?? null,
      });
    }

    // --- Dispatch to Expo, chunked; prune dead tokens ---
    const expoUrl = Deno.env.get('EXPO_PUSH_URL') ?? DEFAULT_EXPO_URL;
    const deadTokens: string[] = [];
    for (const batch of chunk(messages, EXPO_PUSH_CHUNK_SIZE)) {
      try {
        const resp = await fetch(expoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch),
        });
        const body = await resp.json().catch(() => null);
        const tickets = Array.isArray(body?.data) ? body.data : [];
        tickets.forEach((ticket: { status?: string; details?: { error?: string } }, i: number) => {
          if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            const dead = batch[i]?.to;
            if (dead) deadTokens.push(dead);
          }
        });
      } catch (e) {
        // A dispatch failure must not 500 the webhook (it can't retry the
        // INSERT). Log and move on; receipts/cleanup are best-effort.
        console.error('send-push: Expo dispatch failed', e);
      }
    }
    if (deadTokens.length > 0) {
      await service.from('push_tokens').delete().in('expo_token', deadTokens);
    }

    return json({
      ok: true,
      event: resolved.event,
      recipientCount: tokens.length,
      dispatched: true,
      pruned: deadTokens.length,
    });
  } catch (e) {
    console.error('send-push: unhandled', e);
    return json({ error: 'internal' }, 500);
  }
});
