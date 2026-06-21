import type { Database } from '@huddle/types';
import { throwMapped, type HuddleClient } from './internal';

/**
 * Decisions (picker history) data layer — framework-free (hooks live in
 * ./decisions-hooks). Reads go straight through RLS (members only); the
 * write path is the run_picker Edge Function, never a direct INSERT
 * (decisions has no INSERT policy — migration 010).
 */

type DecisionRow = Database['public']['Tables']['decisions']['Row'];
type IdeaRow = Database['public']['Tables']['ideas']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type IdeaCategory = Database['public']['Enums']['idea_category'];

/** A history row with the chosen idea and who ran the picker. */
export interface DecisionWithDetails extends DecisionRow {
  chosen: Pick<IdeaRow, 'id' | 'title' | 'category' | 'status' | 'photo_path'> | null;
  runner: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
}

export interface RunPickerParams {
  groupId: string;
  category?: IdeaCategory;
  /** Explicit subset of idea ids; omit to draw from the whole pool. */
  shortlist?: string[];
  /** Opt-in: weight the pick toward members picked least (D77). */
  fair?: boolean;
  /** "Just decide" fallback (15c): widen an unfiltered pool with past
   * `done` picks when there are < 2 on-radar ideas. */
  fallback?: boolean;
}

export interface RunPickerResult {
  decision: DecisionRow;
  chosenIdeaId: string;
}

// -----------------------------------------------------------------------
// Error contract (mirrors run_picker's JSON { error } codes)
// -----------------------------------------------------------------------

export type PickerErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'too_few_candidates'
  | 'internal';

/** Thrown by runPicker so the UI can switch on the specific failure. */
export class PickerError extends Error {
  readonly code: PickerErrorCode;
  /** Candidate count, present only for 'too_few_candidates'. */
  readonly count?: number;
  constructor(code: PickerErrorCode, count?: number) {
    super(`run_picker failed: ${code}`);
    this.name = 'PickerError';
    this.code = code;
    this.count = count;
  }
}

// -----------------------------------------------------------------------
// Query keys
// -----------------------------------------------------------------------

export const decisionQueryKeys = {
  forGroup: (groupId: string) => ['groups', groupId, 'decisions'] as const,
};

const DECISION_SELECT =
  '*, ' +
  'chosen:ideas!decisions_chosen_idea_id_fkey(id, title, category, status, photo_path), ' +
  'runner:profiles!decisions_run_by_fkey(id, username, display_name, avatar_url)';

// -----------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------

/** A group's decision history, newest first (RLS: members only). */
export async function fetchGroupDecisions(
  client: HuddleClient,
  groupId: string,
): Promise<DecisionWithDetails[]> {
  const { data, error } = await client
    .from('decisions')
    .select(DECISION_SELECT)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) throwMapped(error);
  return (data ?? []) as unknown as DecisionWithDetails[];
}

// -----------------------------------------------------------------------
// Fairness insights ("who gets picked")
// -----------------------------------------------------------------------

/** Per-member tally: how many ideas they proposed vs. how many got picked. */
export interface MemberFairness {
  userId: string;
  displayName: string;
  username: string;
  proposed: number;
  picked: number;
}

export const fairnessQueryKeys = {
  forGroup: (groupId: string) => ['groups', groupId, 'fairness'] as const,
};

/**
 * Fairness stats for a group: for each member, how many ideas they've
 * proposed and how many of their ideas the picker has chosen. Derived
 * entirely from existing rows (no new table) — RLS scopes all three
 * reads to members. Sorted most-picked first.
 *
 * "picked" attributes each decision to the proposer of its chosen idea.
 * A chosen idea whose proposer has been de-attributed (account deletion,
 * D71) contributes to nobody — and that ex-member isn't listed anyway.
 */
export async function fetchGroupFairness(
  client: HuddleClient,
  groupId: string,
): Promise<MemberFairness[]> {
  const [membersRes, ideasRes, decisionsRes] = await Promise.all([
    client
      .from('group_members')
      .select('user_id, profiles(id, username, display_name)')
      .eq('group_id', groupId),
    client.from('ideas').select('id, proposed_by').eq('group_id', groupId),
    client.from('decisions').select('chosen_idea_id').eq('group_id', groupId),
  ]);
  if (membersRes.error) throwMapped(membersRes.error);
  if (ideasRes.error) throwMapped(ideasRes.error);
  if (decisionsRes.error) throwMapped(decisionsRes.error);

  const proposerOfIdea = new Map<string, string | null>();
  const proposed = new Map<string, number>();
  for (const i of ideasRes.data ?? []) {
    const idea = i as { id: string; proposed_by: string | null };
    proposerOfIdea.set(idea.id, idea.proposed_by);
    if (idea.proposed_by) proposed.set(idea.proposed_by, (proposed.get(idea.proposed_by) ?? 0) + 1);
  }

  const picked = new Map<string, number>();
  for (const d of decisionsRes.data ?? []) {
    const proposer = proposerOfIdea.get((d as { chosen_idea_id: string }).chosen_idea_id);
    if (proposer) picked.set(proposer, (picked.get(proposer) ?? 0) + 1);
  }

  return (membersRes.data ?? [])
    .map((m) => {
      const row = m as {
        user_id: string;
        profiles: { username: string; display_name: string } | null;
      };
      return {
        userId: row.user_id,
        displayName: row.profiles?.display_name ?? 'A member',
        username: row.profiles?.username ?? '',
        proposed: proposed.get(row.user_id) ?? 0,
        picked: picked.get(row.user_id) ?? 0,
      };
    })
    .sort((a, b) => b.picked - a.picked || b.proposed - a.proposed);
}

// -----------------------------------------------------------------------
// The pick (Edge Function)
// -----------------------------------------------------------------------

/**
 * Run the random picker for a group. Delegates to the run_picker Edge
 * Function — the pick is made server-side with a CSPRNG and recorded as
 * a decision the caller can't tamper with. Throws PickerError on a
 * structured failure (e.g. too few candidates).
 */
export async function runPicker(
  client: HuddleClient,
  params: RunPickerParams,
): Promise<RunPickerResult> {
  const { data, error } = await client.functions.invoke('run_picker', {
    body: {
      groupId: params.groupId,
      fair: params.fair ?? false,
      fallback: params.fallback ?? false,
      filters: {
        category: params.category ?? null,
        shortlist: params.shortlist ?? null,
        fair: params.fair ?? false,
      },
    },
  });

  if (error) throw await toPickerError(error);

  // Defensive: some transports surface the structured error in `data`.
  const payload = data as { error?: PickerErrorCode; count?: number } | null;
  if (payload?.error) throw new PickerError(payload.error, payload.count);

  const result = data as RunPickerResult;
  if (!result?.decision) {
    throw new PickerError('internal');
  }
  return result;
}

/**
 * Pull the structured { error, count } body out of a FunctionsHttpError
 * (its `context` is the raw Response). Falls back to 'internal'.
 */
async function toPickerError(error: unknown): Promise<PickerError> {
  const context = (error as { context?: unknown }).context;
  if (context && typeof (context as { json?: unknown }).json === 'function') {
    try {
      const body = (await (context as Response).json()) as {
        error?: PickerErrorCode;
        count?: number;
      };
      if (body?.error) return new PickerError(body.error, body.count);
    } catch {
      // fall through to generic
    }
  }
  return new PickerError('internal');
}
