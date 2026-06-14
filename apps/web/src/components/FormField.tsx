import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
}

export function FormField({
  label,
  error,
  hint,
  className = '',
  ...inputProps
}: FormFieldProps) {
  const reactId = useId();
  const id = inputProps.name ? `field-${inputProps.name}` : reactId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        {...inputProps}
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        className={`rounded-md border px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${
          error ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'
        } ${className}`}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
