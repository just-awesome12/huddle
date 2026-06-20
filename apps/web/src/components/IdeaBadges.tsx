import type { CSSProperties } from 'react';
import type { IdeaCategory, IdeaStatus } from '@huddle/validation';

export const CATEGORY_LABELS: Record<IdeaCategory, string> = {
  food: 'Food',
  activity: 'Activity',
  place: 'Place',
  event: 'Event',
  other: 'Other',
};

export const STATUS_LABELS: Record<IdeaStatus, string> = {
  on_radar: 'On the radar',
  done: 'Done',
  dismissed: 'Dismissed',
};

// Translucent status pills (app redesign). on_radar uses a green that
// reads on both themes; done/dismissed use the neutral surface-2 chip.
const statusStyle: Record<IdeaStatus, { className: string; style?: CSSProperties }> = {
  on_radar: {
    className: 'font-extrabold',
    style: { color: '#1f8a5b', background: 'rgba(47,158,143,.16)' },
  },
  done: { className: 'bg-surface-2 font-extrabold text-muted' },
  dismissed: { className: 'bg-surface-2 font-extrabold text-muted' },
};

export function CategoryBadge({ category }: { category: IdeaCategory }) {
  return (
    <span
      data-testid={`category-badge-${category}`}
      className="inline-flex items-center rounded-full bg-surface-2 px-[11px] py-[5px] font-display text-[11.5px] font-bold text-muted"
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function StatusBadge({ status }: { status: IdeaStatus }) {
  const s = statusStyle[status];
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={`inline-flex shrink-0 items-center rounded-full px-[11px] py-[5px] font-display text-[11.5px] ${s.className}`}
      style={s.style}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
