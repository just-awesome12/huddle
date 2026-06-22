// =====================================================================
// Weekly digest email composition — pure, environment-agnostic.
// =====================================================================
// The send-digest Edge Function (Deno) is the only production caller, but
// everything here is dependency-free so it's exhaustively unit-tested
// without a stack. Mirrored for Deno at
// supabase/functions/_shared/digest.ts (drift-guarded in tests).
// =====================================================================

/** One group's activity since the last digest (shape of get_user_digest). */
export interface DigestGroup {
  group_id: string;
  name: string;
  /** Titles of ideas proposed in the window, newest first. */
  new_ideas: string[];
  decisions: number;
  comments: number;
  posts: number;
  /** On-radar ideas with an upcoming date. */
  upcoming: { title: string; date: string }[];
}

/** Everything needed to compose one user's digest email. */
export interface UserDigest {
  email: string;
  displayName?: string | null;
  groups: DigestGroup[];
}

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Human-readable activity lines for one group (most useful first). */
export function groupSummaryLines(g: DigestGroup): string[] {
  const lines: string[] = [];
  if (g.new_ideas.length > 0) {
    const shown = g.new_ideas.slice(0, 5);
    const more = g.new_ideas.length - shown.length;
    lines.push(
      `${plural(g.new_ideas.length, 'new idea')}: ${shown.join(', ')}${more > 0 ? `, +${more} more` : ''}`,
    );
  }
  if (g.decisions > 0) lines.push(`${plural(g.decisions, 'decision')} made`);
  if (g.comments > 0) lines.push(`${plural(g.comments, 'new comment')}`);
  if (g.posts > 0) lines.push(`${plural(g.posts, 'wall post')}`);
  if (g.upcoming.length > 0) {
    const next = g.upcoming
      .slice(0, 3)
      .map((u) => `${u.title} (${u.date})`)
      .join(', ');
    lines.push(`Upcoming: ${next}`);
  }
  return lines;
}

/** Minimal HTML escaping for interpolated user content. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Compose a user's weekly digest into subject + HTML + plain text. Assumes
 * `digest.groups` is non-empty (the caller only emails users with activity).
 * `appUrl` is the web base for the footer link (no trailing slash).
 */
export function buildDigestEmail(digest: UserDigest, appUrl = 'https://huddle.app'): DigestEmail {
  const groupCount = digest.groups.length;
  const greeting = digest.displayName ? `Hi ${digest.displayName},` : 'Hi there,';
  const subject =
    groupCount === 1
      ? `Your week in ${digest.groups[0]!.name}`
      : `Your Huddle weekly recap (${groupCount} groups)`;

  // Plain text
  const textParts = [greeting, '', "Here's what happened in your groups this week:", ''];
  for (const g of digest.groups) {
    textParts.push(`## ${g.name}`);
    for (const line of groupSummaryLines(g)) textParts.push(`  - ${line}`);
    textParts.push('');
  }
  textParts.push(`Open Huddle: ${appUrl}/groups`);
  textParts.push('');
  textParts.push('You can turn off these weekly emails in your notification settings.');
  const text = textParts.join('\n');

  // HTML
  const groupsHtml = digest.groups
    .map((g) => {
      const items = groupSummaryLines(g)
        .map((line) => `<li style="margin:4px 0;color:#374151;">${esc(line)}</li>`)
        .join('');
      return `<div style="margin:0 0 20px;">
  <h2 style="margin:0 0 8px;font-size:16px;color:#111827;">${esc(g.name)}</h2>
  <ul style="margin:0;padding-left:18px;">${items}</ul>
</div>`;
    })
    .join('');

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:15px;color:#111827;">${esc(greeting)}</p>
  <p style="font-size:15px;color:#374151;">Here's what happened in your groups this week:</p>
  ${groupsHtml}
  <p style="margin-top:24px;">
    <a href="${appUrl}/groups" style="background:#6d28d9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:9999px;font-weight:700;font-size:14px;">Open Huddle</a>
  </p>
  <p style="margin-top:24px;font-size:12px;color:#9ca3af;">You can turn off these weekly emails in your notification settings.</p>
</div>`;

  return { subject, html, text };
}
