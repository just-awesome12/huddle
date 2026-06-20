import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchMyGroups } from '@huddle/api-client/groups';
import { getSupabaseServerClient } from '@/lib/supabase';
import { RealtimeProvider } from '@/components/RealtimeProvider';
import { ConnectionDot } from '@/components/ConnectionDot';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SignOutButton } from '@/components/SignOutButton';
import { AppSidebar } from '@/components/AppSidebar';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Defence in depth: middleware also gates this group, but if the
  // middleware ever fails open (misconfigured matcher, edge runtime
  // glitch), we still refuse to render app content without a session.
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  const groups = await fetchMyGroups(supabase);
  const email = user.email ?? '';
  const initial = (email[0] ?? 'u').toUpperCase();

  return (
    <RealtimeProvider userId={user.id}>
      <div className="flex min-h-dvh bg-canvas">
        <AppSidebar groups={groups.map((g) => ({ id: g.id, name: g.name }))} email={email} />

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3.5">
            {/* Mobile: brand home link (sidebar is desktop-only). Desktop: breadcrumb. */}
            <Link href="/groups" className="md:hidden">
              <Logo />
            </Link>
            <div className="hidden items-center gap-2 font-display text-[13.5px] font-bold text-muted md:flex">
              <span className="text-faint" aria-hidden>
                🏠
              </span>
              <Link href="/groups" className="hover:text-content">
                Home
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 font-display text-[12.5px] font-extrabold text-muted">
                <ConnectionDot />
                Live
              </span>
              <ThemeToggle />
              <SignOutButton />
              <span
                aria-hidden
                className="hidden h-8 w-8 place-items-center rounded-full bg-accent-600 font-display text-[13px] font-extrabold text-white sm:grid"
              >
                {initial}
              </span>
            </div>
          </header>

          <div className="flex-1 px-6 py-8 md:px-8">{children}</div>
        </main>
      </div>
    </RealtimeProvider>
  );
}
