'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Segmented Sign up / Sign in toggle for the split-screen auth panel.
 * The active tab is derived from the route (not React state). Rendered
 * only on /sign-up and /sign-in — hidden on other (auth) pages like
 * onboarding. Preserves the ?next= round-trip so deep links survive a
 * toggle (mirrors the bottom switch link).
 */
export function AuthTabs() {
  const pathname = usePathname();
  const next = useSearchParams().get('next');
  if (pathname !== '/sign-up' && pathname !== '/sign-in') return null;

  const isSignup = pathname === '/sign-up';
  const suffix = next ? `?next=${encodeURIComponent(next)}` : '';

  const base =
    'flex-1 rounded-[10px] py-[11px] text-center font-display text-[15px] font-extrabold transition-all';
  const on = 'bg-surface text-brand-ink shadow-sm';
  // text-muted (not faint) so the inactive tab clears WCAG AA 4.5:1 on
  // surface-2 — faint (#64748b) is only 4.21:1 there.
  const off = 'text-muted hover:text-content';

  return (
    <div className="mb-7 flex gap-[6px] rounded-[14px] bg-surface-2 p-[5px]">
      <Link href={`/sign-up${suffix}`} className={`${base} ${isSignup ? on : off}`}>
        Sign up
      </Link>
      <Link href={`/sign-in${suffix}`} className={`${base} ${!isSignup ? on : off}`}>
        Sign in
      </Link>
    </div>
  );
}
