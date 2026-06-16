import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-200 disabled:cursor-not-allowed',
  secondary:
    'bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-900 dark:text-brand-100 dark:hover:bg-brand-800 disabled:bg-surface-2 disabled:text-faint disabled:cursor-not-allowed',
  ghost:
    'bg-transparent text-content hover:bg-brand-50 dark:hover:bg-brand-900 disabled:text-faint disabled:cursor-not-allowed',
  danger:
    'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed',
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${variantClasses[variant]} ${className}`}
    >
      {loading ? 'Working…' : children}
    </button>
  );
}
