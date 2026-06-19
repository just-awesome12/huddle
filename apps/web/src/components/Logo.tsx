/**
 * Huddle logo: the brand mark (figures around a lightbulb) + the
 * "HUDDLE" wordmark. The mark PNG works on light and dark; the wordmark
 * is theme-coloured text (Montserrat) so it stays legible in both modes.
 * Mark-only via `wordmark={false}` for tight spots.
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
      {/* Mark is a fixed-height PNG; width scales to its aspect ratio. */}
      <img src="/logo.png" alt="Huddle" className="h-8 w-auto shrink-0" />
      {wordmark && (
        <span className="font-display text-lg font-bold tracking-wide text-brand-ink">HUDDLE</span>
      )}
    </span>
  );
}
