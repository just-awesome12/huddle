// =====================================================================
// Weekly digest email composition — Deno mirror of
// packages/core/src/digest.ts
// =====================================================================
// Edge Functions can't import the pnpm workspace package, so this is a
// deliberate copy. It MUST stay behaviourally identical to @huddle/core's
// digest; packages/core/tests/digest.test.ts imports both and runs them
// through the same inputs to catch drift. Edit both files together.
// =====================================================================

export interface DigestGroup {
  group_id: string;
  name: string;
  new_ideas: string[];
  decisions: number;
  comments: number;
  posts: number;
  upcoming: { title: string; date: string }[];
}

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

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildDigestEmail(digest: UserDigest, appUrl = 'https://huddle.app'): DigestEmail {
  const groupCount = digest.groups.length;
  const greeting = digest.displayName ? `Hi ${digest.displayName},` : 'Hi there,';
  const subject =
    groupCount === 1
      ? `Your week in ${digest.groups[0]!.name}`
      : `Your Huddle weekly recap (${groupCount} groups)`;

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
