import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — Powwow',
};

/**
 * Terms of Service (Phase 10). PLACEHOLDER copy — replace with reviewed
 * legal text before launch (OQ-8). Public route (allowed in the proxy)
 * so it's reachable signed-out and by the app stores.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/sign-up" className="text-sm text-muted hover:text-content">
        &larr; Back
      </Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-content">Terms of Service</h1>
      <p className="mt-1 text-sm text-faint">Last updated: [DATE]</p>

      <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Placeholder — replace with reviewed legal copy before launch (OQ-8).
      </div>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-content">
        <section>
          <h2 className="font-display text-lg font-semibold">1. Acceptance</h2>
          <p className="mt-2 text-muted">
            By creating an account or using Powwow (the &ldquo;Service&rdquo;), you agree to these
            Terms. If you don&rsquo;t agree, don&rsquo;t use the Service.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold">2. Acceptable use</h2>
          <p className="mt-2 text-muted">
            You agree not to misuse the Service. In particular, you may not access the Service by
            any automated means (bots, scrapers, crawlers, or scripted clients), attempt to
            circumvent rate limits or access controls, or collect other users&rsquo; data. We may
            suspend or terminate accounts that do.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold">3. Your content</h2>
          <p className="mt-2 text-muted">
            You&rsquo;re responsible for the ideas, photos, and other content you post. Content must
            not be unlawful, abusive, or infringing. We offer reporting and blocking tools and may
            remove content or accounts that violate these Terms.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold">4. Termination</h2>
          <p className="mt-2 text-muted">
            You can delete your account at any time from Account settings. We may suspend or
            terminate access for violations of these Terms.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold">5. Contact</h2>
          <p className="mt-2 text-muted">Questions? Contact [SUPPORT EMAIL].</p>
        </section>
        <p className="text-muted">
          See also our{' '}
          <Link href="/privacy" className="font-medium text-brand-ink underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
