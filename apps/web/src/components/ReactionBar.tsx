import {
  REACTION_EMOJIS,
  type ReactionSummary,
  type ReactionTargetType,
} from '@huddle/api-client/reactions';
import { toggleReactionAction } from '@/actions/reactions';

/**
 * A row of toggle-able emoji reactions for one target (idea / decision /
 * comment). Server Component: each emoji is a plain Server-Action form;
 * the page passes the current `summaries` (counts + whether mine) and its
 * own `path` to revalidate after a toggle.
 */
export function ReactionBar({
  groupId,
  targetType,
  targetId,
  summaries,
  path,
}: {
  groupId: string;
  targetType: ReactionTargetType;
  targetId: string;
  summaries: ReactionSummary[];
  path: string;
}) {
  const byEmoji = new Map(summaries.map((s) => [s.emoji, s]));

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="reaction-bar">
      {REACTION_EMOJIS.map((emoji) => {
        const s = byEmoji.get(emoji);
        const mine = s?.mine ?? false;
        const count = s?.count ?? 0;
        return (
          <form key={emoji} action={toggleReactionAction}>
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <input type="hidden" name="emoji" value={emoji} />
            <input type="hidden" name="reacted" value={mine ? 'true' : 'false'} />
            <input type="hidden" name="path" value={path} />
            <button
              type="submit"
              aria-pressed={mine}
              aria-label={`React ${emoji}`}
              data-testid={`react-${emoji}`}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-bold transition-colors ${
                mine
                  ? 'bg-accent-50 text-accent-600 ring-1 ring-accent-400'
                  : 'bg-surface-2 text-muted hover:bg-line'
              }`}
            >
              <span aria-hidden>{emoji}</span>
              {count > 0 ? count : ''}
            </button>
          </form>
        );
      })}
    </div>
  );
}
