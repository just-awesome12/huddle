import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { SignOutButton } from '@/components/SignOutButton';

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

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">Huddle</h1>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span data-testid="signed-in-email">{user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
