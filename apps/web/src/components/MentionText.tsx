import { Fragment } from 'react';

/**
 * Renders body text with @mentions highlighted (Phase 16c). App-local +
 * presentational (works in Server Components) — the username pattern
 * mirrors usernameSchema (3..30 lowercase/digit/underscore). Highlight
 * only; there's no public profile route to link to yet.
 */

// Capturing group so String.split keeps the matched tokens.
const SPLIT_RE = /(@[a-z0-9_]{3,30})/gi;
const EXACT_RE = /^@[a-z0-9_]{3,30}$/i;

export function MentionText({ text }: { text: string }) {
  const parts = text.split(SPLIT_RE);
  return (
    <>
      {parts.map((part, i) =>
        EXACT_RE.test(part) ? (
          <span key={i} data-testid="mention" className="font-semibold text-brand-ink">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
