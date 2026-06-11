import Link from 'next/link';
import { fetchMyGroups } from '@huddle/api-client/groups';
import { getSupabaseServerClient } from '@/lib/supabase';
import { RoleBadge } from '@/components/RoleBadge';

export default async function GroupsPage() {
  const supabase = await getSupabaseServerClient();
  const groups = await fetchMyGroups(supabase);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">Your groups</h2>
        <Link
          href="/groups/new"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2"
        >
          New group
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">No groups yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Create a group to start collecting ideas with your people.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2" data-testid="group-list">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span className="text-sm font-medium text-slate-900">
                  {group.name}
                </span>
                <RoleBadge role={group.myRole} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
