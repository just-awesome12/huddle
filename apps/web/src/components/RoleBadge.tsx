interface RoleBadgeProps {
  role: 'admin' | 'member';
}

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      data-testid={`role-badge-${role}`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        role === 'admin' ? 'bg-brand-600 text-white' : 'bg-surface-2 text-muted'
      }`}
    >
      {role === 'admin' ? 'Admin' : 'Member'}
    </span>
  );
}
