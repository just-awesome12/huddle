/**
 * Deterministic playful visuals for a group (emoji tile + color). The
 * schema has no emoji/color, so we derive a stable one from the group id
 * — the same group always gets the same tile across the sidebar,
 * dashboard cards, and the group banner. Colors are drawn from the
 * brand/accent/teal palette; `softBg` returns a low-alpha tint for tiles.
 */

const EMOJIS = ['🌮', '🏠', '📚', '🎬', '🎳', '☕', '🥾', '🎤', '🍜', '🎲', '🎉', '🍕'];

// Brand ramp + accent + teal — all readable as a white-on-color avatar.
const COLORS = ['#d4537e', '#665cc8', '#2f9e8f', '#7f77dd', '#534ab7', '#993556', '#473e9f'];

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function groupEmoji(id: string): string {
  return EMOJIS[hash(id) % EMOJIS.length]!;
}

export function groupColor(id: string): string {
  return COLORS[hash(id) % COLORS.length]!;
}

/** A low-alpha tint of the group's color, for emoji tile backgrounds. */
export function groupSoftBg(id: string): string {
  const hex = groupColor(id).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.16)`;
}

/** A stable color for a person, derived from their id/initial source. */
export function personColor(seed: string): string {
  return COLORS[hash(seed) % COLORS.length]!;
}

// --- Phase 14: prefer the admin-chosen value, fall back to the hash. ---

export function groupEmojiFor(id: string, emoji?: string | null): string {
  return emoji || groupEmoji(id);
}

export function groupColorFor(id: string, color?: string | null): string {
  return color || groupColor(id);
}

export function groupSoftBgFor(id: string, color?: string | null): string {
  const hex = groupColorFor(id, color).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.16)`;
}
