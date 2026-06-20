import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import { throwMapped } from './internal';

/**
 * Group activity feed — a "what's happening" timeline merged from the
 * tables that already record member actions (ideas, votes, comments,
 * decisions, joins). Framework-free; the hook wrapper lives in
 * ./activity-hooks. No new table — every source row is RLS-scoped, so a
 * non-member's reads return nothing just like everywhere else.
 */

type HuddleClient = SupabaseClient<Database>;

export type ActivityKind =
  | 'idea_added'
  | 'idea_voted'
  | 'comment_added'
  | 'picker_ran'
  | 'member_joined';

export interface ActivityItem {
  /** Stable synthetic key (kind + source ids) for React lists. */
  id: string;
  kind: ActivityKind;
  actorId: string | null;
  actorName: string;
  /** ISO timestamp the action happened. */
  timestamp: string;
  ideaId?: string;
  ideaTitle?: string;
  /** Short excerpt (e.g. a comment body). */
  snippet?: string;
}

export const activityQueryKeys = {
  feed: (groupId: string) => ['groups', groupId, 'activity'] as const,
};

/** A to-one embedded profile row (or null when de-attributed). */
type ProfileEmbed = { display_name: string } | null;
type IdeaEmbed = { title: string } | null;

function actorName(p: ProfileEmbed): string {
  return p?.display_name ?? 'Someone';
}

/**
 * Fetch the most recent `limit` activity items for a group. Pulls the
 * latest `limit` from each source in parallel, merges, sorts newest-first,
 * and trims back to `limit` (so the feed is correct even when one source
 * dominates).
 */
export async function fetchGroupActivity(
  client: HuddleClient,
  groupId: string,
  limit = 20,
): Promise<ActivityItem[]> {
  const [ideas, votes, comments, decisions, members] = await Promise.all([
    client
      // ideas has m2m paths to profiles (via idea_votes/idea_comments), so the
      // proposer embed needs an explicit FK hint (lesson 15).
      .from('ideas')
      .select('id, title, proposed_by, created_at, profiles!ideas_proposed_by_fkey(display_name)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(limit),
    // idea_votes has no group_id column → scope via the idea's group.
    client
      .from('idea_votes')
      .select('user_id, created_at, ideas!inner(id, title, group_id), profiles(display_name)')
      .eq('ideas.group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(limit),
    client
      .from('idea_comments')
      .select('id, idea_id, body, author_id, created_at, ideas(title), profiles(display_name)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(limit),
    client
      .from('decisions')
      .select('id, chosen_idea_id, run_by, created_at, ideas(title), profiles(display_name)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(limit),
    client
      .from('group_members')
      .select('user_id, joined_at, profiles(display_name)')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: false })
      .limit(limit),
  ]);

  for (const r of [ideas, votes, comments, decisions, members]) {
    if (r.error) throwMapped(r.error);
  }

  const items: ActivityItem[] = [];

  for (const row of ideas.data ?? []) {
    items.push({
      id: `idea_added:${row.id}`,
      kind: 'idea_added',
      actorId: row.proposed_by,
      actorName: actorName(row.profiles as ProfileEmbed),
      timestamp: row.created_at,
      ideaId: row.id,
      ideaTitle: row.title,
    });
  }

  for (const row of votes.data ?? []) {
    const idea = row.ideas as { id: string; title: string } | null;
    items.push({
      id: `idea_voted:${idea?.id ?? 'x'}:${row.user_id}`,
      kind: 'idea_voted',
      actorId: row.user_id,
      actorName: actorName(row.profiles as ProfileEmbed),
      timestamp: row.created_at,
      ideaId: idea?.id,
      ideaTitle: idea?.title,
    });
  }

  for (const row of comments.data ?? []) {
    items.push({
      id: `comment_added:${row.id}`,
      kind: 'comment_added',
      actorId: row.author_id,
      actorName: actorName(row.profiles as ProfileEmbed),
      timestamp: row.created_at,
      ideaId: row.idea_id,
      ideaTitle: (row.ideas as IdeaEmbed)?.title,
      snippet: row.body,
    });
  }

  for (const row of decisions.data ?? []) {
    items.push({
      id: `picker_ran:${row.id}`,
      kind: 'picker_ran',
      actorId: row.run_by,
      actorName: actorName(row.profiles as ProfileEmbed),
      timestamp: row.created_at,
      ideaId: row.chosen_idea_id ?? undefined,
      ideaTitle: (row.ideas as IdeaEmbed)?.title,
    });
  }

  for (const row of members.data ?? []) {
    items.push({
      id: `member_joined:${row.user_id}`,
      kind: 'member_joined',
      actorId: row.user_id,
      actorName: actorName(row.profiles as ProfileEmbed),
      timestamp: row.joined_at,
    });
  }

  items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  return items.slice(0, limit);
}
