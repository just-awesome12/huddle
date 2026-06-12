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

const statusClasses: Record<IdeaStatus, string> = {
  on_radar: 'bg-sky-100 text-sky-800',
  done: 'bg-green-100 text-green-800',
  dismissed: 'bg-slate-100 text-slate-500',
};

export function CategoryBadge({ category }: { category: IdeaCategory }) {
  return (
    <span
      data-testid={`category-badge-${category}`}
      className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function StatusBadge({ status }: { status: IdeaStatus }) {
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
