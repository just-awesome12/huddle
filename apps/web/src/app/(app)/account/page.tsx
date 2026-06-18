import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase';
import { ConfirmActionForm } from '@/components/ConfirmActionForm';
import { deleteAccountAction } from '@/actions/account';

export default async function AccountPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/groups" className="text-sm text-muted hover:text-content">
        &larr; Back to groups
      </Link>

      <h2 className="mt-4 text-xl font-medium">Account</h2>
      <p className="mt-1 text-sm text-muted">{user.email}</p>

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
