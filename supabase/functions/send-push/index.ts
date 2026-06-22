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
  selectWebSubscriptions,
  buildWebPushPayload,
  chunk,
  extractMentions,
  EXPO_PUSH_CHUNK_SIZE,
  type NotificationEvent,
  type NotificationPrefs,
  type Recipient,
  type WebSubscriptionRecipient,
  type NotificationContent,
} from '../_shared/notifications.ts';

const DEV_WEBHOOK_SECRET = 'local-dev-webhook-secret';
const DEFAULT_EXPO_URL = 'https://exp.host/--/api/v2/push/send';

// Dev VAPID keypair (Phase 15). Mirrors the webhook-secret pattern: a
// well-known dev fallback so local needs no env wiring; PRODUCTION must
// set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (the private key is sensitive).
// Unlike the webhook secret (auth → fail closed), a missing prod VAPID key
// just disables the web channel (Expo still fires) rather than 500-ing.
const DEV_VAPID_PUBLIC =
  'BKdy5OAxfwCSCpqXCdtl7yvMHUEEavOdo-VLrVj7Qc-pPfjuXiywVdEdcEHPil6dKhzSoX9GcGVCg_cLHkeTjLw';
const DEV_VAPID_PRIVATE = 'E94wHsvKv2FlSGIqxXFshO4KXGYagDwDX84DNmi3N-U';

interface WebhookPayload {
  type?: string;
  table?: string;
  schema?: string;
  record?: Record<string, unknown> | null;
}

type Service = ReturnType<typeof createClient>;

// A fresh service-role client per request. A module-scope singleton was
// tried, but a reused supabase-js client in the edge runtime returned
// degraded results on calls after the first (the integration probe's 2nd+
// invocations under-reported). One client per webhook is correct.
function getService(): Service | null {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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

/**
 * Fetch both delivery channels for a set of users in ONE round trip:
 * Expo tokens, web subscriptions, and prefs (fetched once and shared).
 * Doing this as a single Promise.all keeps the per-request query count
 * low — the edge runtime intermittently returned partial results when
 * tokens/prefs and subs/prefs were fetched as two separate round trips.
 */
type RecipientScope = 'members' | 'admins' | 'explicit';

async function gatherRecipients(
  service: Service,
  groupId: string,
  scope: RecipientScope,
  explicitUserIds: string[],
): Promise<{ recipients: Recipient[]; webRecipients: WebSubscriptionRecipient[] }> {
  // ONE round trip (migration 034): a SECURITY DEFINER RPC resolves the
  // target set (members/admins/explicit) AND returns their tokens, web
  // subs, prefs, and mutes as a single jsonb value. Replaces several
  // separate multi-row PostgREST reads that the edge runtime intermittently
  // truncated.
  const { data, error } = await service.rpc('get_push_recipients', {
    p_group_id: groupId || null,
    p_scope: scope,
    p_explicit_user_ids: explicitUserIds,
  });
  if (error || !data) {
    console.error('send-push: get_push_recipients failed', error);
    return { recipients: [], webRecipients: [] };
  }
  const gathered = data as {
    tokens: { user_id: string; expo_token: string }[];
    subs: { user_id: string; endpoint: string; p256dh: string; auth: string }[];
    prefs: (NotificationPrefs & { user_id: string })[];
    muted: string[];
  };

  const prefsByUser = new Map<string, NotificationPrefs>();
  for (const p of gathered.prefs ?? []) {
    prefsByUser.set(p.user_id, {
      new_idea: p.new_idea,
      picker_ran: p.picker_ran,
      group_invite: p.group_invite,
      new_comment: p.new_comment,
      join_request: p.join_request,
      join_approved: p.join_approved,
      reaction: p.reaction,
      rsvp: p.rsvp,
      mention: p.mention,
      nudge: p.nudge,
    });
  }
  const mutedUsers = new Set<string>(gathered.muted ?? []);
  const recipients = (gathered.tokens ?? []).map((t) => ({
    userId: t.user_id,
    expoToken: t.expo_token,
    prefs: prefsByUser.get(t.user_id) ?? null,
    muted: mutedUsers.has(t.user_id),
  }));
  const webRecipients = (gathered.subs ?? []).map((s) => ({
    userId: s.user_id,
    subscription: { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
    prefs: prefsByUser.get(s.user_id) ?? null,
    muted: mutedUsers.has(s.user_id),
  }));
  return { recipients, webRecipients };
}

/** Display name for one user (falls back to "Someone"). */
async function displayName(service: Service, userId: string): Promise<string> {
  const { data } = await service
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  return (data?.display_name as string) ?? 'Someone';
}

interface Resolved {
  event: NotificationEvent;
  actorId: string | null;
  /** How the RPC resolves recipients: the group's members, its admins, or
   * an explicit list (single-user events). */
  scope: RecipientScope;
  explicitUserIds: string[];
  /** The group the push originates in — used for per-group mute (15b). */
  groupId: string;
  content: NotificationContent;
  /** Users to drop from this dispatch — used so a mentioned member gets the
   * `mention` push, not also the broadcast `new_comment` (16c). */
  excludeUserIds?: string[];
}

/**
 * Resolve @usernames in `body` to the ids of group members (minus the
 * author). Used to target the `mention` event (16c).
 */
async function mentionedMemberIds(
  service: Service,
  groupId: string,
  body: string,
  authorId: string | null,
): Promise<string[]> {
  const usernames = extractMentions(body);
  if (usernames.length === 0) return [];
  const { data: profiles } = await service
    .from('profiles')
    .select('id, username')
    .in('username', usernames);
  const candidateIds = (profiles ?? []).map((p) => p.id as string).filter((id) => id !== authorId);
  if (candidateIds.length === 0) return [];
  const { data: members } = await service
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .in('user_id', candidateIds);
  return (members ?? []).map((m) => m.user_id as string);
}

/**
 * Turn a webhook record into one OR MORE dispatches. Most events are a
 * single dispatch; a comment with @mentions is two (mention + the
 * broadcast new_comment, with the mentioned members excluded from the
 * latter so they aren't double-notified).
 */
async function resolve(
  service: Service,
  table: string,
  record: Record<string, unknown>,
): Promise<Resolved | Resolved[] | { skip: string }> {
  if (table === 'ideas') {
    const groupId = str(record.group_id);
    const ideaId = str(record.id);
    if (!groupId || !ideaId) return { skip: 'missing ideas fields' };
    const name = await groupName(service, groupId);
    return {
      event: 'new_idea',
      actorId: str(record.proposed_by),
      scope: 'members',
      explicitUserIds: [],
      groupId,
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
    const authorId = str(record.author_id);
    const body = str(record.body) ?? 'New comment';
    const [name, idea, mentioned] = await Promise.all([
      groupName(service, groupId),
      service.from('ideas').select('title').eq('id', ideaId).maybeSingle(),
      mentionedMemberIds(service, groupId, body, authorId),
    ]);
    const ideaTitle = (idea.data?.title as string) ?? 'an idea';
    const path = `/groups/${groupId}/ideas/${ideaId}`;
    // Broadcast new_comment to members, minus anyone we'll @mention.
    const dispatches: Resolved[] = [
      {
        event: 'new_comment',
        actorId: authorId,
        scope: 'members',
        explicitUserIds: [],
        groupId,
        excludeUserIds: mentioned,
        content: {
          title: `New comment in ${name}`,
          body: `${ideaTitle}: ${body}`,
          data: { path },
        },
      },
    ];
    if (mentioned.length > 0) {
      const who = authorId ? await displayName(service, authorId) : 'Someone';
      dispatches.push({
        event: 'mention',
        actorId: authorId,
        scope: 'explicit',
        explicitUserIds: mentioned,
        groupId,
        content: {
          title: `${who} mentioned you in ${name}`,
          body: `${ideaTitle}: ${body}`,
          data: { path },
        },
      });
    }
    return dispatches;
  }

  if (table === 'group_posts') {
    // The wall doesn't broadcast — only @mentions ping (16c).
    const groupId = str(record.group_id);
    if (!groupId) return { skip: 'missing group_posts fields' };
    const authorId = str(record.author_id);
    const body = str(record.body) ?? '';
    const mentioned = await mentionedMemberIds(service, groupId, body, authorId);
    if (mentioned.length === 0) return { skip: 'wall post has no mentions' };
    const [name, who] = await Promise.all([
      groupName(service, groupId),
      authorId ? displayName(service, authorId) : Promise.resolve('Someone'),
    ]);
    return {
      event: 'mention',
      actorId: authorId,
      scope: 'explicit',
      explicitUserIds: mentioned,
      groupId,
      content: {
        title: `${who} mentioned you in ${name}`,
        body,
        data: { path: `/groups/${groupId}/wall` },
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
      scope: 'members',
      explicitUserIds: [],
      groupId,
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
      scope: 'explicit',
      explicitUserIds: [invitedUserId],
      groupId: groupId ?? '',
      content: {
        title: 'Group invite',
        body: `${inviterName} invited you to ${name}`,
        data: { path: token ? `/invites/${token}` : `/groups` },
      },
    };
  }

  if (table === 'group_join_requests') {
    const groupId = str(record.group_id);
    const requesterId = str(record.user_id);
    const status = str(record.status);
    if (!groupId || !requesterId) return { skip: 'missing join-request fields' };
    const name = await groupName(service, groupId);

    if (status === 'pending') {
      // New request → notify the group's admins (minus the requester).
      const who = await displayName(service, requesterId);
      return {
        event: 'join_request',
        actorId: requesterId,
        scope: 'admins',
        explicitUserIds: [],
        groupId,
        content: {
          title: `Join request for ${name}`,
          body: `${who} wants to join`,
          data: { path: `/groups/${groupId}/settings` },
        },
      };
    }

    if (status === 'approved') {
      // Approved → notify the requester. The approving admin is the actor,
      // but the recipient is the requester, so no self-exclusion conflict.
      return {
        event: 'join_approved',
        actorId: str(record.decided_by),
        scope: 'explicit',
        explicitUserIds: [requesterId],
        groupId,
        content: {
          title: `You're in!`,
          body: `Your request to join ${name} was approved`,
          data: { path: `/groups/${groupId}` },
        },
      };
    }

    return { skip: `join-request status not notifiable: ${status}` };
  }

  if (table === 'reactions') {
    const groupId = str(record.group_id);
    const targetType = str(record.target_type);
    const targetId = str(record.target_id);
    const actorId = str(record.user_id);
    const emoji = str(record.emoji) ?? '';
    if (!groupId || !targetType || !targetId) return { skip: 'missing reaction fields' };

    // Targeted: notify only the AUTHOR of the reacted-to target.
    let authorId: string | null = null;
    let path = `/groups/${groupId}`;
    let noun = 'your post';
    if (targetType === 'idea') {
      const { data } = await service
        .from('ideas')
        .select('proposed_by, title')
        .eq('id', targetId)
        .maybeSingle();
      authorId = (data?.proposed_by as string) ?? null;
      path = `/groups/${groupId}/ideas/${targetId}`;
      noun = data?.title ? `your idea "${data.title}"` : 'your idea';
    } else if (targetType === 'decision') {
      const { data } = await service
        .from('decisions')
        .select('run_by')
        .eq('id', targetId)
        .maybeSingle();
      authorId = (data?.run_by as string) ?? null;
      path = `/groups/${groupId}/history`;
      noun = 'your pick';
    } else if (targetType === 'comment') {
      const { data } = await service
        .from('idea_comments')
        .select('author_id, idea_id')
        .eq('id', targetId)
        .maybeSingle();
      authorId = (data?.author_id as string) ?? null;
      if (data?.idea_id) path = `/groups/${groupId}/ideas/${data.idea_id}`;
      noun = 'your comment';
    }
    if (!authorId) return { skip: 'reaction target has no author' };

    const name = await groupName(service, groupId);
    const who = actorId ? await displayName(service, actorId) : 'Someone';
    return {
      event: 'reaction',
      actorId, // a self-reaction is dropped by actor exclusion
      scope: 'explicit',
      explicitUserIds: [authorId],
      groupId,
      content: {
        title: `New reaction in ${name}`,
        body: `${who} reacted ${emoji} to ${noun}`,
        data: { path },
      },
    };
  }

  if (table === 'idea_rsvps') {
    // Triggers only fire this for status='going', so notify the idea's
    // proposer that someone's in. (Targeted, not the whole group.)
    const groupId = str(record.group_id);
    const ideaId = str(record.idea_id);
    const actorId = str(record.user_id);
    if (!groupId || !ideaId) return { skip: 'missing rsvp fields' };
    const [name, idea] = await Promise.all([
      groupName(service, groupId),
      service.from('ideas').select('proposed_by, title').eq('id', ideaId).maybeSingle(),
    ]);
    const proposerId = (idea.data?.proposed_by as string) ?? null;
    if (!proposerId) return { skip: 'rsvp idea has no proposer' };
    const who = actorId ? await displayName(service, actorId) : 'Someone';
    const title = (idea.data?.title as string) ?? 'an idea';
    return {
      event: 'rsvp',
      actorId,
      scope: 'explicit',
      explicitUserIds: [proposerId],
      groupId,
      content: {
        title: `Someone's in — ${name}`,
        body: `${who} is going to ${title}`,
        data: { path: `/groups/${groupId}/ideas/${ideaId}` },
      },
    };
  }

  if (table === 'group_nudge') {
    // Synthetic payload from the pg_cron inactivity-nudge job (Phase 17) —
    // not a real row. System-generated, so there's no actor to exclude.
    const groupId = str(record.group_id);
    if (!groupId) return { skip: 'missing group_nudge fields' };
    const name = await groupName(service, groupId);
    return {
      event: 'nudge',
      actorId: null,
      scope: 'members',
      explicitUserIds: [],
      groupId,
      content: {
        title: `${name} has been quiet`,
        body: `It's been a while — got plans? Pick something to do.`,
        data: { path: `/groups/${groupId}` },
      },
    };
  }

  return { skip: `unsupported table: ${table}` };
}

interface DispatchResult {
  event: NotificationEvent;
  recipientCount: number;
  webRecipientCount: number;
  dispatched: boolean;
  selectedTokens: string[];
  sampleMessage: unknown;
  sampleWebSubscription: unknown;
  sampleWebPayload: string | null;
  pruned: number;
  prunedWeb: number;
}

/**
 * Gather + select + (send or dry-run) a single dispatch. Selection honours
 * the actor exclusion, prefs, mutes (in @huddle/core) AND this dispatch's
 * excludeUserIds (mention dual-dispatch, 16c). Side-effecting sends never
 * throw out — failures are logged + best-effort, like before.
 */
async function processDispatch(
  service: Service,
  d: Resolved,
  dryRun: boolean,
  isLocal: boolean,
): Promise<DispatchResult> {
  const { recipients, webRecipients } = await gatherRecipients(
    service,
    d.groupId,
    d.scope,
    d.explicitUserIds,
  );
  const exclude = d.excludeUserIds ?? [];
  const tokens = selectRecipientTokens(recipients, d.event, d.actorId, exclude);
  const messages = buildExpoMessages(tokens, d.content);
  const webSubs = selectWebSubscriptions(webRecipients, d.event, d.actorId, exclude);
  const webPayload = buildWebPushPayload(d.content);

  const summary = {
    event: d.event,
    recipientCount: tokens.length,
    webRecipientCount: webSubs.length,
    selectedTokens: tokens,
    sampleMessage: messages[0] ?? null,
    sampleWebSubscription: webSubs[0] ?? null,
    sampleWebPayload: webSubs.length > 0 ? webPayload : null,
  };
  if (dryRun) {
    return { ...summary, dispatched: false, pruned: 0, prunedWeb: 0 };
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
      console.error('send-push: Expo dispatch failed', e);
    }
  }
  if (deadTokens.length > 0) {
    await service.from('push_tokens').delete().in('expo_token', deadTokens);
  }

  // --- Dispatch to web subscribers via VAPID; prune gone (404/410) ---
  const deadWeb: string[] = [];
  if (webSubs.length > 0) {
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') ?? (isLocal ? DEV_VAPID_PUBLIC : '');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? (isLocal ? DEV_VAPID_PRIVATE : '');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:notifications@huddleapp.local';
    if (!vapidPublic || !vapidPrivate) {
      console.error(
        'send-push: VAPID keys required for web push in production; skipping web channel',
      );
    } else {
      try {
        const webpush = (await import('npm:web-push@3.6.7')).default;
        webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
        for (const s of webSubs) {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              webPayload,
            );
          } catch (err) {
            const status = (err as { statusCode?: number })?.statusCode;
            if (status === 404 || status === 410) deadWeb.push(s.endpoint);
            else console.error('send-push: web push send failed', status, err);
          }
        }
      } catch (e) {
        console.error('send-push: web-push module/dispatch failed', e);
      }
    }
    if (deadWeb.length > 0) {
      await service.from('web_push_subscriptions').delete().in('endpoint', deadWeb);
    }
  }

  return { ...summary, dispatched: true, pruned: deadTokens.length, prunedWeb: deadWeb.length };
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

  const service = getService();
  if (!service) {
    console.error('send-push: missing SUPABASE_* env');
    return json({ error: 'internal' }, 500);
  }

  try {
    const resolved = await resolve(service, table, record);
    if (!Array.isArray(resolved) && 'skip' in resolved) {
      return json({ ok: true, skipped: resolved.skip, recipientCount: 0 });
    }
    // One record can fan out to several dispatches (e.g. a comment →
    // new_comment + mention, 16c). Each is gathered + selected + sent
    // independently; the top-level fields mirror the FIRST dispatch for
    // back-compat, and `dispatches` carries them all.
    const dispatches = Array.isArray(resolved) ? resolved : [resolved];
    const results: DispatchResult[] = [];
    for (const d of dispatches) {
      results.push(await processDispatch(service, d, dryRun, isLocal));
    }

    const primary = results[0] ?? null;
    return json({
      ok: true,
      dispatched: !dryRun,
      event: primary?.event ?? null,
      recipientCount: primary?.recipientCount ?? 0,
      webRecipientCount: primary?.webRecipientCount ?? 0,
      selectedTokens: primary?.selectedTokens ?? [],
      sampleMessage: primary?.sampleMessage ?? null,
      sampleWebSubscription: primary?.sampleWebSubscription ?? null,
      sampleWebPayload: primary?.sampleWebPayload ?? null,
      dispatches: results,
    });
  } catch (e) {
    console.error('send-push: unhandled', e);
    return json({ error: 'internal' }, 500);
  }
});
