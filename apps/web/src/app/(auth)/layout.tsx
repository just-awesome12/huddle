import type { ReactNode } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AuthTabs } from '@/components/AuthTabs';
import { PickerDemo } from '@/components/PickerDemo';

/**
 * Split-screen auth shell (onboarding redesign). Left: a living brand
 * panel that demos the picker so even the auth screen teaches what
 * Huddle does. Right: the real auth forms (sign-in / sign-up / onboarding)
 * rendered as {children}, under a route-aware tab toggle. Stacks on
 * mobile (left becomes a top banner) via flex-wrap.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const violetPanel =
    'linear-gradient(160deg, var(--color-brand-900) 0%, var(--color-brand-800) 50%, var(--color-brand-600) 100%)';

  return (
    <div className="flex min-h-dvh flex-wrap">
      {/* Left: living demo */}
      <div
        className="relative flex min-w-[300px] flex-[1_1_460px] flex-col justify-between gap-10 overflow-hidden p-[clamp(32px,5vw,56px)] text-white"
        style={{ background: violetPanel }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute right-[-30px] top-[-50px] h-[220px] w-[220px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(212,83,126,.4), transparent 70%)',
            animation: 'hud-float 10s ease-in-out infinite',
          }}
        />
        <Link href="/" className="relative self-start" aria-label="Huddle home">
          {/* Wordmark forced white on the violet panel. */}
          <span className="inline-flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-8 w-auto shrink-0" />
            <span className="font-display text-lg font-black tracking-[0.06em] text-white">
              HUDDLE
            </span>
          </span>
        </Link>

        <div className="relative">
          <h2 className="mb-[14px] font-display text-[clamp(30px,4vw,44px)] font-black leading-[1.05] tracking-[-0.01em]">
            Plans,
            <br />
            decided.
          </h2>
          <p className="mb-[30px] max-w-[34ch] text-[17px] text-brand-100">
            Watch the picker break a tie in real time — that&rsquo;s the whole magic.
          </p>
          <PickerDemo variant="compact" />
        </div>

        <div className="relative flex items-center gap-3 text-[14px] font-bold text-brand-300">
          <span className="flex">
            <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-brand-800 bg-accent-400 font-display text-[11px] font-extrabold text-white">
              M
            </span>
            <span className="-ml-2 grid h-7 w-7 place-items-center rounded-full border-2 border-brand-800 bg-brand-500 font-display text-[11px] font-extrabold text-white">
              D
            </span>
            <span className="-ml-2 grid h-7 w-7 place-items-center rounded-full border-2 border-brand-800 bg-teal font-display text-[11px] font-extrabold text-white">
              S
            </span>
          </span>
          Join the crews already huddling.
        </div>
      </div>

      {/* Right: form */}
      <div className="flex min-w-[300px] flex-[1_1_420px] items-center justify-center bg-surface p-[clamp(32px,5vw,56px)]">
        <div className="w-full max-w-[400px]" style={{ animation: 'hud-rise .4s ease both' }}>
          <div className="mb-2 flex justify-end">
            <ThemeToggle />
          </div>
          <AuthTabs />
          {children}
        </div>
      </div>
    </div>
  );
}
