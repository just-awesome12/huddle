import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Powwow',
};

/**
 * Privacy Policy (Phase 10). PLACEHOLDER copy — replace with reviewed
 * legal text before launch (OQ-8). Both app stores require a reachable
 * privacy policy URL. Public route (allowed in the proxy).
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/sign-up" className="text-sm text-muted hover:text-content">
        &larr; Back
      </Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-content">Privacy Policy</h1>
      <p className="mt-1 text-sm text-faint">Last updated: [DATE]</p>

      <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Placeholder — replace with reviewed legal copy before launch (OQ-8).
      </div>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-content">
        <section>
          <h2 className="font-display text-lg font-semibold">What we collect</h2>
          <p className="mt-2 text-muted">
            Account info you provide (email, username, display name, optional avatar), the content
            you create (groups, ideas, photos, picks), and basic technical data needed to run the
            Service. Push tokens are stored to deliver notifications you opt into.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold">How we use it</h2>
          <p className="mt-2 text-muted">
            To provide the Service to you and your groups, send notifications you&rsquo;ve enabled,
            and keep the Service secure. We don&rsquo;t sell your data.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold">Sharing</h2>
          <p className="mt-2 text-muted">
            Content is visible to members of the groups you share it with. We use Supabase
            (database/auth/storage) and Expo (push) as processors. [List any others.]
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold">Your choices &amp; rights</h2>
          <p className="mt-2 text-muted">
            You can edit your profile, manage notification preferences, block users, and{' '}
            <strong>delete your account</strong> (which removes your personal information) from
            Account settings. [Add region-specific rights per GDPR/CCPA as applicable — OQ-7.]
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold">Contact</h2>
          <p className="mt-2 text-muted">Privacy questions? Contact [SUPPORT EMAIL].</p>
        </section>
        <p className="text-muted">
          See also our{' '}
          <Link href="/terms" className="font-medium text-brand-ink underline">
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
