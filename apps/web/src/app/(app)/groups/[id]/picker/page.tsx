import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchGroup } from '@huddle/api-client/groups';
import { fetchGroupIdeas } from '@huddle/api-client/ideas';
import { fetchGroupCandidateSets, type CandidateSetRow } from '@huddle/api-client/candidate-sets';
import { getSupabaseServerClient } from '@/lib/supabase';
import { GroupRealtime } from '@/components/GroupRealtime';
import { PickerClient, type PickableIdea } from '@/components/PickerClient';

export default async function PickerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // RLS hides non-member groups; both "forbidden" and "missing" surface
  // as a thrown read → 404 (don't leak which ids exist).
  let group;
  let pickable: PickableIdea[];
  let fallbackPool: PickableIdea[] = [];
  let savedSets: CandidateSetRow[] = [];
  try {
    group = await fetchGroup(supabase, id);
    const ideas = await fetchGroupIdeas(supabase, id, { status: 'on_radar' });
    pickable = ideas.map((i) => ({ id: i.id, title: i.title, category: i.category }));
    savedSets = await fetchGroupCandidateSets(supabase, id);
    // Past picks (done ideas) as the "just decide" fallback pool (15c) —
    // only needed when there aren't 2 on-radar ideas to pick between.
    if (pickable.length < 2) {
      const done = await fetchGroupIdeas(supabase, id, { status: 'done' });
      fallbackPool = done.map((i) => ({ id: i.id, title: i.title, category: i.category }));
    }
  } catch {
    notFound();
  }

  const pickerGradient =
    'linear-gradient(160deg, var(--color-brand-900) 0%, var(--color-brand-800) 50%, var(--color-brand-600) 100%)';

  return (
    <div
      className="relative -mx-6 -my-8 min-h-full overflow-hidden px-6 py-9 text-white md:-mx-8 md:px-8"
      style={{ background: pickerGradient }}
    >
      <GroupRealtime groupId={id} />
      <span
        aria-hidden
        className="pointer-events-none absolute left-[4%] top-[-40px] h-[200px] w-[200px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(212,83,126,.4), transparent 70%)',
          animation: 'hud-float 11s ease-in-out infinite',
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-[8%] h-[170px] w-[170px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(154,146,230,.35), transparent 70%)',
          animation: 'hud-float 9s ease-in-out infinite',
        }}
      />

      <div className="relative mx-auto max-w-[560px] text-center">
        <Link
          href={`/groups/${id}`}
          className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-[9px] font-display text-[13.5px] font-extrabold text-white transition-colors hover:bg-white/20"
        >
          ← {group.name}
        </Link>

        <h1 className="mt-6 font-display text-[clamp(30px,4.5vw,46px)] font-black tracking-[-0.02em]">
          Let the picker decide
        </h1>
        <p className="mt-3 text-[17px] text-brand-100">
          {pickable.length} {pickable.length === 1 ? 'idea' : 'ideas'} in the huddle — time to
          settle this.
        </p>

        {/* Stage card holds the live reel + controls (the client). */}
        <div
          className="mt-7 rounded-[26px] bg-surface p-6 text-left text-content"
          style={{ boxShadow: '0 50px 90px -34px rgba(0,0,0,.7)' }}
        >
          <div className="mb-1 flex items-center gap-[10px]">
            <span
              className="h-[9px] w-[9px] rounded-full bg-online"
              style={{ animation: 'hud-pulse 1.8s ease-in-out infinite' }}
            />
            <span className="font-display text-[15px] font-extrabold text-brand-ink">
              {group.name}
            </span>
            <span className="ml-auto rounded-full bg-accent-50 px-[11px] py-1 font-display text-[11.5px] font-extrabold text-accent-600">
              PICKER
            </span>
          </div>
          <PickerClient
            groupId={id}
            ideas={pickable}
            fallbackIdeas={fallbackPool}
            savedSets={savedSets}
            currentUserId={user.id}
          />
        </div>

        <p className="mt-4 text-[13px] text-brand-100">
          Fair, random, and logged forever — no take-backs 😏
        </p>
      </div>
    </div>
  );
}
