/**
 * Upvote toggle (Phase 11). A server-action form — no client JS needed:
 * the heart + count reflect the server-rendered state, and submitting
 * toggles + revalidates. `action` is a bound toggleVoteAction.
 */
export function VoteButton({
  action,
  voted,
  count,
}: {
  action: (formData: FormData) => void | Promise<void>;
  voted: boolean;
  count: number;
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        aria-pressed={voted}
        aria-label={voted ? 'Remove your upvote' : 'Upvote this idea'}
        data-testid="vote-button"
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
          voted
            ? 'border-brand-500 bg-brand-50 text-brand-ink dark:bg-brand-900'
            : 'border-line bg-surface text-muted hover:bg-surface-2'
        }`}
      >
        <span aria-hidden>{voted ? '❤' : '🤍'}</span>
        <span data-testid="vote-count">{count}</span>
      </button>
    </form>
  );
}
