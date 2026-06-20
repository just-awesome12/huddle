'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';
import { groupEmoji, groupSoftBg } from '@/lib/group-visuals';

interface SidebarGroup {
  id: string;
  name: string;
}

/**
 * The app-shell sidebar (redesign): wordmark, "+ New huddle", Home, the
 * group switcher, and a user footer with the theme toggle + sign-out.
 * Client component so it can highlight the active route via usePathname;
 * the group list is fetched server-side and passed in.
 */
export function AppSidebar({ groups, email }: { groups: SidebarGroup[]; email: string }) {
  const pathname = usePathname();
  const onHome = pathname === '/groups';
  const initial = (email[0] ?? 'u').toUpperCase();

  const row =
    'flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left font-display text-sm font-extrabold transition-colors';

  return (
    <aside className="sticky top-0 hidden h-dvh w-[266px] shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="px-5 pb-3.5 pt-[22px]">
        <Logo />
      </div>

      <div className="px-3.5 pb-1.5 pt-2">
        <Link
          href="/groups/new"
          className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-accent-600 py-[11px] font-display text-sm font-extrabold text-white transition hover:brightness-110"
          style={{ boxShadow: '0 12px 22px -12px var(--color-accent-400)' }}
        >
          <span className="text-base leading-none">+</span> New huddle
        </Link>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 pb-0.5 pt-2">
        <Link
          href="/groups"
          className={`${row} ${onHome ? 'bg-brand-50 text-brand-ink' : 'text-content hover:bg-surface-2'}`}
        >
          <span className="text-[17px] leading-none">🏠</span> Home
        </Link>
      </nav>

      <div className="px-5 pb-2 pt-4 font-display text-[11px] font-extrabold tracking-[0.13em] text-faint">
        YOUR HUDDLES
      </div>

      <div className="flex flex-col gap-[3px] overflow-y-auto px-3" data-testid="sidebar-groups">
        {groups.map((g) => {
          const active = pathname.startsWith(`/groups/${g.id}`);
          return (
            <Link
              key={g.id}
              href={`/groups/${g.id}`}
              className={`${row} ${active ? 'bg-brand-50' : 'hover:bg-surface-2'}`}
            >
              <span
                className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] text-base"
                style={{ background: groupSoftBg(g.id) }}
              >
                {groupEmoji(g.id)}
              </span>
              <span className="min-w-0 flex-1 truncate text-content">{g.name}</span>
            </Link>
          );
        })}
        {groups.length === 0 && <p className="px-3 py-2 text-xs text-faint">No huddles yet.</p>}
      </div>

      <div className="flex-1" />

      <Link
        href="/account"
        className="flex items-center gap-[10px] border-t border-line p-3 transition-colors hover:bg-surface-2"
      >
        <span
          aria-hidden
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-accent-600 font-display text-sm font-extrabold text-white"
        >
          {initial}
        </span>
        <span
          data-testid="signed-in-email"
          className="min-w-0 flex-1 truncate text-[13px] text-muted"
          title={email}
        >
          {email}
        </span>
      </Link>
    </aside>
  );
}
