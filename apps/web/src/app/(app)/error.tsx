'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/Button';

/**
 * Error boundary for the signed-in app (Phase 10 polish). Catches render
 * errors in a route segment so a single failing page doesn't blank the
 * whole app. `reset` re-renders the segment; the link is the escape hatch.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced to the browser console for now; Sentry wiring is deferred
    // to the Phase 9 perimeter work (docs/SECURITY.md).
    console.error('App route error:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-lg font-semibold text-content">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted">
        That page hit an unexpected error. You can try again, or head back to
        your groups.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Link
          href="/groups"
          className="text-sm font-medium text-muted hover:text-brand-ink"
        >
          Back to groups
        </Link>
      </div>
    </div>
  );
}
