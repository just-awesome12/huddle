import type { Database } from '@huddle/types';
import { throwMapped, type HuddleClient } from './internal';

/**
 * Raw decision/picker data functions, framework-free (hooks live in
 * ./decisions-hooks — same split as groups/ideas: server code imports
 * THIS module).
 *
 * Reads (history) are plain RLS-protected SELECTs — any group member may
 * read their group's decisions. WRITES never happen here: a decision is
 * recorded ONLY by the run_picker Edge Function running as service_role
 * (the decisions table has no INSERT policy, so a client cannot tamper
 * with the outcome). `runPicker` just invokes that function.
 */

type DecisionRow = Database['public']['Tables']['decisions']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type IdeaRow = Database['public']['Tables']['ideas']['Row'];
type IdeaCategory = Database['public']['Enums']['idea_category'];

/** The runner's public profile, as embedded on a decision. */
export type DecisionRunner = Pick<
  ProfileRow,
  'id' | 'username' | 'display_name' | 'avatar_url'
>;

/** A compact view of the chosen idea, as embedded on a decision. */
export type ChosenIdeaSummary = Pick<
  IdeaRow,
  'id' | 'title' | 'category' | 'status'
>;

/** A decision as shown in the History view: who ran it + what it chose. */
export interface DecisionWithDetails extends DecisionRow {
  runner: DecisionRunner | null;
  chosen: ChosenIdeaSummary | null;
}

// -----------------------------------------------------------------------
// Query key factory
// -----------------------------------------------------------------------

export const decisionQueryKeys = {
  forGroup: (groupId: string) => ['groups', groupId, 'decisions'] as const,
};

// run_by has a single FK to profiles and chosen_idea_id a single FK to
// ideas, so these embeds are unambiguous — but we name the constraints
// anyway for clarity and to stay robust if more FKs are added later.
const DECISION_SELECT =
  '*, runner:profiles!decisions_run_by_fkey(id, username, display_name, avatar_url), ' +
  'chosen:ideas!decisions_chosen_idea_id_fkey(id, title, category, status)';

// -----------------------------------------------------------------------
// Reads (history)
// -----------------------------------------------------------------------

/** List a group's decisions, newest first (FR-12 History view). */
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
// Run the picker (Edge Function)
// -----------------------------------------------------------------------

export interface RunPickerParams {
  groupId: string;
  /** Optional category filter applied to candidates. */
  category?: IdeaCategory;
  /** Optional hand-picked candidate set (idea ids). */
  shortlist?: string[];
}

/**
 * Result of a picker run. `no_candidates` is the friendly empty state
 * (no on_radar ideas matched the options) — NOT an error, and nothing is
 * recorded. `picked` carries the freshly-recorded decision with its
 * runner and chosen idea embedded, ready to drop into the History view.
 */
export type PickerResult =
  | { outcome: 'picked'; decision: DecisionWithDetails }
  | { outcome: 'no_candidates' };

/**
 * Invoke the run_picker Edge Function. The server is the authority on the
 * random outcome (crypto pick) and the only writer of the decision row.
 */
export async function runPicker(
  client: HuddleClient,
  params: RunPickerParams,
): Promise<PickerResult> {
  const { data, error } = await client.functions.invoke<PickerResult>('run-picker', {
    body: {
      groupId: params.groupId,
      category: params.category ?? null,
      shortlist: params.shortlist ?? null,
    },
  });

  if (error) await throwInvokeError(error);
  if (!data) throwMapped({ message: 'Empty response from picker' });
  return data;
}

/**
 * Translate a functions.invoke failure into a HuddleError. For an HTTP
 * error, supabase-js attaches the Response as `error.context`; we read
 * the JSON body (our `{ error: { code, message } }` contract) so the UI
 * can distinguish, e.g., a 403 "not a member" from a generic failure.
 */
async function throwInvokeError(error: unknown): Promise<never> {
  const ctx = (error as { context?: unknown }).context as
    | { json?: () => Promise<unknown>; status?: number }
    | undefined;

  let mapped: { code?: string; message?: string; status?: number } | undefined;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as
        | { error?: { code?: string; message?: string } }
        | null;
      mapped = {
        code: body?.error?.code,
        message: body?.error?.message,
        status: ctx.status,
      };
    } catch {
      // Body wasn't our JSON shape; fall back to the status alone.
      mapped = { status: ctx.status };
    }
  }

  if (mapped) {
    throwMapped({
      code: mapped.code,
      message: mapped.message ?? 'Picker failed',
      status: mapped.status,
    });
  }
  throwMapped(error);
}
