/**
 * Huddle logo: three overlapping circles (a "huddle" of people) + the
 * wordmark. Brand violet/pink (Pop direction, OQ-4). Mark-only via
 * `wordmark={false}` for tight spots.
 */
export function Logo({
  wordmark = true,
  className = '',
}: {
  wordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width="26"
        height="26"
        viewBox="0 0 34 34"
        role="img"
        aria-label="Huddle"
        className="shrink-0"
      >
        <circle cx="12" cy="13" r="7" fill="#534ab7" />
        <circle cx="22" cy="13" r="7" fill="#d4537e" />
        <circle cx="17" cy="22" r="7" fill="#7f77dd" />
      </svg>
      {wordmark && (
        <span className="text-lg font-bold tracking-tight text-brand-900">Huddle</span>
      )}
    </span>
  );
}
