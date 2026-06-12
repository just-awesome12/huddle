import { NextResponse, type NextRequest } from 'next/server';
import { usernameSearchSchema } from '@huddle/validation';
import { searchProfiles } from '@huddle/api-client/profiles';
import { getSupabaseServerClient } from '@/lib/supabase';
import { rateLimitAllow } from '@/lib/rate-limit';

/**
 * GET /api/profiles/search?q=<prefix>
 *
 * Username prefix search for the add-by-username invite flow.
 * Auth required; per-user rate limited (10/min — see rate-limit.ts for
 * the honesty note about per-process scope; Phase 9 adds the perimeter
 * limit at Cloudflare).
 */
export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!rateLimitAllow(`profile-search:${user.id}`)) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const parsed = usernameSearchSchema.safeParse({
    q: request.nextUrl.searchParams.get('q') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_query', results: [] }, { status: 400 });
  }

  try {
    const results = await searchProfiles(supabase, parsed.data.q);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: 'search_failed' }, { status: 500 });
  }
}
