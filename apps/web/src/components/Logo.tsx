/**
 * Huddle logo: the brand mark (the "Spectrum Ring" — a glossy spectrum
 * loop) + the "HUDDLE" wordmark. The mark PNG is on transparency and
 * works on light and dark; the wordmark is theme-coloured text
 * (Montserrat) so it stays legible in both modes. Mark-only via
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
      {/* Mark is a fixed-height PNG; width scales to its aspect ratio. */}
      <img src="/logo.png" alt="Powwow" className="h-8 w-auto shrink-0" />
      {wordmark && (
        <span className="font-display text-lg font-bold tracking-wide text-brand-ink">POWWOW</span>
      )}
    </span>
  );
}
