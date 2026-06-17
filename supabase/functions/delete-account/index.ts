// =====================================================================
// delete-account — in-app self-serve account deletion (Phase 10, OQ-6)
// =====================================================================
// Both app stores require an in-app account-deletion path. Deleting the
// auth.users row requires the admin API (service_role), so this is an
// Edge Function (the third). It is user-initiated: verify_jwt is on and
// it acts only on the caller's own account.
//
// Cascade design (migration 018): deleting the user cascades to their
// profile → group_members (CASCADE), push_tokens/notification_prefs/
// invites (CASCADE), while ideas.proposed_by and decisions.run_by are
// SET NULL (content/history de-attributed, not destroyed).
//
// Last-admin handling: the enforce_last_admin trigger blocks a DELETE
// that would leave a group with zero admins (unless the group itself is
// being deleted). So before deleting the user we:
//   - REFUSE (409) if they are the sole admin of a group that has OTHER
//     members — they must promote someone or delete the group first.
//   - DELETE solo groups (only them) up front, so the cascade doesn't
//     trip the trigger (parent gone → trigger skips).
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.47.10';
import { corsHeaders } from '../_shared/cors.ts';

type Client = ReturnType<typeof createClient>;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface MemberRow {
  group_id: string;
  user_id: string;
  role: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) {
    console.error('delete-account: missing SUPABASE_* env');
    return json({ error: 'internal' }, 500);
  }

  // Identify the caller.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'unauthorized' }, 401);
  const userId = user.id;

  const admin: Client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Groups where the caller is an admin.
    const { data: myAdmin, error: e1 } = await admin
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId)
      .eq('role', 'admin');
    if (e1) throw e1;

    const adminGroupIds = (myAdmin ?? []).map((r) => r.group_id as string);
    const soloGroupIds: string[] = [];
    const conflictGroupIds: string[] = [];

    if (adminGroupIds.length > 0) {
      const { data: members, error: e2 } = await admin
        .from('group_members')
        .select('group_id, user_id, role')
        .in('group_id', adminGroupIds);
      if (e2) throw e2;

      for (const gid of adminGroupIds) {
        const rows = (members ?? []).filter((m) => m.group_id === gid) as MemberRow[];
        const otherAdmins = rows.filter((m) => m.role === 'admin' && m.user_id !== userId);
        const otherMembers = rows.filter((m) => m.user_id !== userId);
        if (otherAdmins.length === 0) {
          if (otherMembers.length > 0) conflictGroupIds.push(gid);
          else soloGroupIds.push(gid);
        }
      }
    }

    // Refuse while the caller is the only admin of a shared group.
    if (conflictGroupIds.length > 0) {
      const { data: groups } = await admin
        .from('groups')
        .select('id, name')
        .in('id', conflictGroupIds);
      return json(
        {
          error: 'sole_admin',
          groups: (groups ?? []).map((g) => ({ id: g.id, name: g.name })),
        },
        409,
      );
    }

    // Delete solo groups first so their member cascade doesn't trip the
    // last-admin trigger (parent gone → trigger skips).
    if (soloGroupIds.length > 0) {
      const { error: e3 } = await admin.from('groups').delete().in('id', soloGroupIds);
      if (e3) throw e3;
    }

    // Delete the auth user — cascades the rest (profile, memberships,
    // tokens, prefs, invites) and SET NULLs ideas/decisions.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error('delete-account: deleteUser failed', delErr.message);
      return json({ error: 'internal' }, 500);
    }

    return json({ ok: true }, 200);
  } catch (e) {
    console.error('delete-account: unhandled', e);
    return json({ error: 'internal' }, 500);
  }
});
