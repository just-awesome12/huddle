import Link from 'next/link';
import { redirect } from 'next/navigation';
import { searchPublicGroups, fetchMyGroups, fetchMyJoinRequests } from '@huddle/api-client/groups';
import { groupSearchSchema } from '@huddle/validation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { requestJoinAction, withdrawJoinAction } from '@/actions/groups';
import { groupEmojiFor, groupSoftBgFor } from '@/lib/group-visuals';

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; location?: string; tags?: string }>;
}) {
  const raw = await searchParams;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const parsed = groupSearchSchema.safeParse({
    q: raw.q ?? '',
    location: raw.location ?? '',
    tags: (raw.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  });
  const filters = parsed.success ? parsed.data : { q: '', location: '', tags: [] };

  const [results, myGroups, myRequests] = await Promise.all([
    searchPublicGroups(supabase, filters),
    fetchMyGroups(supabase),
    fetchMyJoinRequests(supabase),
  ]);

  const memberIds = new Set(myGroups.map((g) => g.id));
  const pendingByGroup = new Map(myRequests.map((r) => [r.group_id, r.id]));

  const hasFilters = !!(filters.q || filters.location || filters.tags.length);

  return (
    <div className="mx-auto max-w-[1080px]">
      <h1 className="font-display text-[clamp(24px,3vw,32px)] font-black tracking-[-0.02em] text-content">
        Discover huddles
      </h1>
      <p className="mt-1.5 text-[15px] text-muted">
        Find public groups by name, place, or vibe — then ask to join.
      </p>

      {/* Search form (GET — each search is a navigation) */}
      <form method="get" className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Tacos, book club, hiking…"
            className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm shadow-sm placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Location</span>
          <input
            type="text"
            name="location"
            defaultValue={filters.location}
            placeholder="Austin, TX"
            className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm shadow-sm placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Tags</span>
          <input
            type="text"
            name="tags"
            defaultValue={filters.tags.join(', ')}
            placeholder="food, outdoors"
            className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm shadow-sm placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-accent-600 px-6 py-2.5 font-display text-sm font-bold text-white transition-colors hover:bg-accent-900"
        >
          Search
        </button>
      </form>

      {/* Results */}
      <div className="mt-8" data-testid="discover-results">
        {results.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
            {hasFilters
              ? 'No public groups match your search yet.'
              : 'No public groups yet. Be the first to make one public!'}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((g) => {
              const isMember = memberIds.has(g.id);
              const pendingId = pendingByGroup.get(g.id);
              return (
                <li
                  key={g.id}
                  className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-5"
                  style={{ boxShadow: '0 18px 34px -26px rgba(38,33,92,.4)' }}
                  data-testid="discover-card"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-[24px]"
                      style={{ background: groupSoftBgFor(g.id, g.color) }}
                      aria-hidden
                    >
                      {groupEmojiFor(g.id, g.emoji)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-[16px] font-extrabold text-content">
                        {g.name}
                      </h2>
                      <p className="text-xs text-muted">
                        {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
                        {g.location ? ` · ${g.location}` : ''}
                      </p>
                    </div>
                  </div>

                  {g.description && (
                    <p className="line-clamp-2 text-sm text-muted">{g.description}</p>
                  )}

                  {g.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {g.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto pt-1">
                    {isMember ? (
                      <Link
                        href={`/groups/${g.id}`}
                        className="inline-flex rounded-full border border-line px-4 py-2 font-display text-sm font-bold text-brand-ink transition-colors hover:bg-surface-2"
                      >
                        Open →
                      </Link>
                    ) : pendingId ? (
                      <form action={withdrawJoinAction}>
                        <input type="hidden" name="requestId" value={pendingId} />
                        <button
                          type="submit"
                          className="rounded-full border border-line px-4 py-2 font-display text-sm font-bold text-muted transition-colors hover:bg-surface-2"
                          data-testid="withdraw-request"
                        >
                          Requested · Cancel
                        </button>
                      </form>
                    ) : (
                      <form action={requestJoinAction}>
                        <input type="hidden" name="groupId" value={g.id} />
                        <button
                          type="submit"
                          className="rounded-full bg-accent-600 px-4 py-2 font-display text-sm font-bold text-white transition-colors hover:bg-accent-900"
                          data-testid="request-join"
                        >
                          Request to join
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
