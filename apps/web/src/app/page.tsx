import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { PickerDemo } from '@/components/PickerDemo';

/**
 * Public marketing landing (the onboarding redesign). Unauthenticated
 * visitors get the full pitch — a live picker, a faux group thread, a
 * 3-step explainer — before they ever see a form. Signed-in users are
 * forwarded straight to their groups. This route is reachable signed-out
 * (the proxy allows "/").
 */
export default async function LandingPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/groups');

  const violetHero =
    'linear-gradient(150deg, var(--color-brand-900) 0%, var(--color-brand-800) 45%, var(--color-brand-600) 100%)';

  return (
    <div className="overflow-x-hidden bg-canvas">
      {/* ============ Top bar ============ */}
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-6 py-[14px]">
          <Logo />
          <nav className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className="rounded-full px-4 py-[10px] font-display text-[15px] font-extrabold text-brand-ink transition-colors hover:bg-brand-50"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full bg-accent-400 px-5 py-[11px] font-display text-[15px] font-extrabold text-white transition hover:brightness-105"
              style={{ boxShadow: '0 10px 22px -10px var(--color-accent-400)' }}
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* ============ Hero ============ */}
      <section className="relative overflow-hidden text-white" style={{ background: violetHero }}>
        <span
          aria-hidden
          className="pointer-events-none absolute right-[8%] top-[-60px] h-[200px] w-[200px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(212,83,126,.45), transparent 70%)',
            animation: 'hud-float 9s ease-in-out infinite',
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-[-40px] left-[4%] h-[160px] w-[160px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(154,146,230,.4), transparent 70%)',
            animation: 'hud-float 11s ease-in-out infinite',
          }}
        />
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-14 px-6 pb-[88px] pt-[72px]">
          <div className="min-w-[300px] flex-[1_1_440px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-[14px] py-[7px] text-[13px] font-bold tracking-[0.04em]">
              <span
                className="h-2 w-2 rounded-full bg-online"
                style={{ animation: 'hud-pulse 1.8s ease-in-out infinite' }}
              />
              For groups who can never just decide
            </span>
            <h1 className="mt-[22px] font-display text-[clamp(40px,6vw,68px)] font-black leading-[1.02] tracking-[-0.02em]">
              Stop the
              <br />
              &ldquo;idk, what do <span className="text-accent-100">you</span> wanna do?&rdquo;
            </h1>
            <p className="mt-[22px] max-w-[30ch] text-[clamp(17px,2vw,20px)] leading-[1.5] text-brand-100">
              Toss your plans into a powwow, let everyone weigh in — and when you still can&rsquo;t
              agree, the picker decides for you. No more group-chat paralysis.
            </p>
            <div className="mt-[34px] flex flex-wrap gap-[14px]">
              <Link
                href="/sign-up"
                className="rounded-full bg-accent-400 px-[30px] py-4 font-display text-[17px] font-extrabold text-white transition-transform hover:-translate-y-0.5"
                style={{ boxShadow: '0 16px 34px -12px var(--color-accent-400)' }}
              >
                Start a powwow — free
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-7 py-4 font-display text-[17px] font-extrabold text-white transition-colors hover:bg-white/20"
              >
                See how it works ↓
              </a>
            </div>
            <div className="mt-[30px] flex items-center gap-3 text-[14px] font-bold text-brand-300">
              <span className="flex">
                <Avatar className="bg-accent-400">M</Avatar>
                <Avatar className="-ml-[9px] bg-brand-500">D</Avatar>
                <Avatar className="-ml-[9px] bg-teal">S</Avatar>
                <Avatar className="-ml-[9px] bg-brand-400">+5</Avatar>
              </span>
              Built for friend groups, roommates &amp; crews.
            </div>
          </div>

          <div className="min-w-[300px] flex-[0_1_400px]">
            <PickerDemo variant="hero" />
          </div>
        </div>
      </section>

      {/* ============ Group thread ============ */}
      <section className="mx-auto max-w-[1180px] px-6 pb-5 pt-20">
        <div className="mx-auto max-w-[620px] text-center">
          <span className="font-display text-[13px] font-extrabold uppercase tracking-[0.12em] text-accent-400">
            Inside a powwow
          </span>
          <h2 className="mt-[10px] font-display text-[clamp(28px,4vw,42px)] font-black leading-[1.08] tracking-[-0.01em] text-brand-ink">
            Everyone&rsquo;s ideas, in one place
          </h2>
          <p className="mt-[14px] text-[17px] text-muted">
            No more 200 unread messages. Drop an idea, react, shortlist — it all updates live.
          </p>
        </div>

        <div className="mx-auto mt-11 flex max-w-[560px] flex-col gap-4">
          <ThreadCard
            avatar="M"
            avatarClass="bg-accent-400"
            name="Mia"
            when="proposed · 2m ago"
            emoji="🌮"
            title="Taco Tuesday at El Centro"
            note="$2 tacos till 7, walkable from Dev's"
            votes={4}
            votePink
            comments={3}
            onRadar
          />
          <ThreadCard
            avatar="D"
            avatarClass="bg-brand-500"
            name="Dev"
            when="proposed · 5m ago"
            emoji="🥾"
            title="Sunset hike + tacos after"
            note="Easy 3mi loop, trailhead 20 min away"
            votes={3}
            comments={1}
          />
          <ThreadCard
            avatar="S"
            avatarClass="bg-teal"
            name="Sam"
            when="proposed · 8m ago"
            emoji="🎬"
            title="Movie night, the new A24 one"
            note="If everyone's too tired to leave"
            votes={2}
            comments={0}
            dim
          />

          <div className="pt-2 text-center">
            <span className="inline-flex items-center gap-[10px] rounded-full bg-brand-900 px-[22px] py-3 font-display text-[15px] font-extrabold text-white">
              <span
                className="h-2 w-2 rounded-full bg-online"
                style={{ animation: 'hud-pulse 1.8s ease-in-out infinite' }}
              />
              3 ideas tied · time to let the picker decide
            </span>
          </div>
        </div>
      </section>

      {/* ============ Three-step explainer ============ */}
      <section id="how-it-works" className="mx-auto max-w-[1180px] px-6 py-20">
        <div className="mx-auto mb-12 max-w-[620px] text-center">
          <span className="font-display text-[13px] font-extrabold uppercase tracking-[0.12em] text-accent-400">
            How it works
          </span>
          <h2 className="mt-[10px] font-display text-[clamp(28px,4vw,42px)] font-black leading-[1.08] tracking-[-0.01em] text-brand-ink">
            Three steps to &ldquo;we&rsquo;re actually doing it&rdquo;
          </h2>
        </div>
        <div className="flex flex-wrap gap-[22px]">
          <Step
            n="01"
            tileClass="bg-accent-50"
            emoji="💡"
            title="Toss in ideas"
            body="Everyone drops what they're feeling — a restaurant, a trail, a movie. Add a photo and a note."
          />
          <Step
            n="02"
            tileClass="bg-brand-50"
            emoji="👥"
            title="Powwow on them"
            body="Upvote, comment, and shortlist together. Everything updates live as the group chimes in."
          />
          <Step
            dark
            n="03"
            tileClass="bg-white/15"
            emoji="🎲"
            title="Let the picker decide"
            body="Still deadlocked? One tap spins a fair, random pick — and logs the decision so no one re-litigates it."
          />
        </div>
      </section>

      {/* ============ Closing CTA ============ */}
      <section className="px-6 pb-[88px]">
        <div
          className="relative mx-auto max-w-[1000px] overflow-hidden rounded-[32px] p-[clamp(40px,6vw,64px)] text-center text-white"
          style={{
            background: 'linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))',
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute left-[-30px] top-[-50px] h-[180px] w-[180px] rounded-full bg-white/10"
            style={{ animation: 'hud-float 10s ease-in-out infinite' }}
          />
          <h2 className="relative font-display text-[clamp(30px,4.5vw,48px)] font-black leading-[1.05] tracking-[-0.01em]">
            Your group&rsquo;s next hangout
            <br />
            is one powwow away.
          </h2>
          <p className="relative mb-8 mt-[18px] text-[18px] text-accent-50">
            Free to start. Bring the whole crew.
          </p>
          <Link
            href="/sign-up"
            className="relative inline-block rounded-full bg-surface px-[38px] py-[17px] font-display text-[18px] font-black text-accent-600 transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: '0 18px 36px -14px rgba(0,0,0,.4)' }}
          >
            Create your first powwow
          </Link>
        </div>
      </section>

      {/* ============ Footer ============ */}
      <footer className="border-t border-line px-6 py-7">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-[14px] text-[14px] text-faint">
          <span className="font-display font-black tracking-[0.06em] text-brand-ink">POWWOW</span>
          <span>Group plans, finally decided.</span>
        </div>
      </footer>
    </div>
  );
}

function Avatar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-brand-800 font-display text-[12px] font-extrabold text-white ${className}`}
    >
      {children}
    </span>
  );
}

function Step({
  n,
  tileClass,
  emoji,
  title,
  body,
  dark = false,
}: {
  n: string;
  tileClass: string;
  emoji: string;
  title: string;
  body: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`relative flex-[1_1_280px] rounded-[24px] p-[30px] ${
        dark ? 'border border-brand-900 text-white' : 'border border-line bg-surface'
      }`}
      style={
        dark
          ? {
              background: 'linear-gradient(160deg, var(--color-brand-600), var(--color-brand-900))',
            }
          : undefined
      }
    >
      <span
        className={`absolute right-[26px] top-6 font-display text-[46px] font-black ${
          dark ? 'text-white/10' : 'text-brand-50'
        }`}
      >
        {n}
      </span>
      <span
        className={`grid h-[58px] w-[58px] place-items-center rounded-[18px] text-[28px] ${tileClass}`}
      >
        {emoji}
      </span>
      <h3
        className={`mb-2 mt-5 font-display text-[21px] font-black ${dark ? 'text-white' : 'text-brand-ink'}`}
      >
        {title}
      </h3>
      <p className={`text-[15.5px] leading-[1.55] ${dark ? 'text-brand-100' : 'text-muted'}`}>
        {body}
      </p>
    </div>
  );
}

function ThreadCard({
  avatar,
  avatarClass,
  name,
  when,
  emoji,
  title,
  note,
  votes,
  votePink = false,
  comments,
  onRadar = false,
  dim = false,
}: {
  avatar: string;
  avatarClass: string;
  name: string;
  when: string;
  emoji: string;
  title: string;
  note: string;
  votes: number;
  votePink?: boolean;
  comments: number;
  onRadar?: boolean;
  dim?: boolean;
}) {
  return (
    <div
      className={`rounded-[20px] border border-line bg-surface px-[22px] py-5 ${dim ? 'opacity-80' : ''}`}
      style={{ boxShadow: '0 16px 30px -22px rgba(38,33,92,.35)' }}
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid h-[38px] w-[38px] place-items-center rounded-full font-display font-extrabold text-white ${avatarClass}`}
        >
          {avatar}
        </span>
        <div className="flex flex-col">
          <span className="font-display text-[15px] font-extrabold text-brand-ink">{name}</span>
          <span className="text-[12.5px] text-faint">{when}</span>
        </div>
        {onRadar ? (
          <span
            className="ml-auto rounded-full px-[11px] py-[5px] text-xs font-extrabold"
            style={{ color: '#1f6b60', background: '#dff5ef' }}
          >
            ON RADAR
          </span>
        ) : null}
      </div>
      <div className="mt-[14px] flex items-center gap-[14px]">
        <span className="text-[34px]">{emoji}</span>
        <div>
          <div className="font-display text-[19px] font-extrabold text-content">{title}</div>
          <div className="text-[14px] text-muted">{note}</div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-[10px]">
        <span
          className={`inline-flex items-center gap-[6px] rounded-full px-[14px] py-[7px] text-[14px] font-extrabold ${
            votePink ? 'bg-accent-50 text-accent-600' : 'bg-surface-2 text-brand-ink'
          }`}
        >
          ▲ {votes}
        </span>
        <span className="inline-flex items-center gap-[6px] text-[14px] font-bold text-faint">
          💬 {comments} {comments === 1 ? 'comment' : 'comments'}
        </span>
      </div>
    </div>
  );
}
