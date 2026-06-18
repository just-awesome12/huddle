import Link from 'next/link';

/**
 * Global 404 (Phase 10 polish). Also what RSC `notFound()` renders for a
 * group/idea the user can't see (RLS) — we intentionally don't reveal
 * whether the id exists.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-lg font-semibold text-content">Page not found</h2>
      <p className="mt-2 text-sm text-muted">
        This page doesn&rsquo;t exist, or you don&rsquo;t have access to it.
      </p>
      <Link
        href="/groups"
        className="mt-6 inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        Back to groups
      </Link>
    </div>
  );
}
