import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchBlockedProfiles } from '@huddle/api-client/moderation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';
import { deleteAccountAction } from '@/actions/account';
import { unblockUserAction } from '@/actions/moderation';

export default async function AccountPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const blocked = await fetchBlockedProfiles(supabase);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/groups" className="text-sm text-muted hover:text-content">
        &larr; Back to groups
      </Link>

      <h2 className="mt-4 text-xl font-medium">Account</h2>
      <p className="mt-1 text-sm text-muted">{user.email}</p>

      <section className="mt-10">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Blocked users</h3>
        {blocked.length === 0 ? (
          <p className="mt-2 text-sm text-muted">You haven&rsquo;t blocked anyone.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2" data-testid="blocked-list">
            {blocked.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-content">{p.display_name}</span>
                  <span className="text-xs text-muted">@{p.username}</span>
                </div>
                <ConfirmActionForm
                  action={unblockUserAction}
                  fields={{ blockedId: p.id }}
                  buttonLabel="Unblock"
                  confirmPrompt={`Unblock ${p.display_name}? You'll see their ideas again.`}
                  confirmLabel="Unblock"
                  variant="secondary"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950">
        <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">Delete account</h3>
        <p className="mt-1 text-sm text-red-700 dark:text-red-300">
          This permanently deletes your account and removes your personal information. Ideas and
          picks you contributed stay in your groups but are no longer attributed to you. If
          you&rsquo;re the only admin of a group with other members, you&rsquo;ll need to hand it
          off first. This can&rsquo;t be undone.
        </p>
        <div className="mt-4">
          <ConfirmActionForm
            action={deleteAccountAction}
            fields={{}}
            buttonLabel="Delete my account"
            confirmPrompt="Permanently delete your account? This cannot be undone."
            confirmLabel="Delete account"
            variant="danger"
          />
        </div>
      </section>
    </div>
  );
}
