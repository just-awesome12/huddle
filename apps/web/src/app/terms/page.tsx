import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — Huddle',
};

/**
 * Terms of Service (Phase 10; drafted OQ-8). This is an app-specific DRAFT,
 * not lawyer-reviewed. Before launch: (1) have it professionally reviewed,
 * and (2) fill every [BRACKETED] placeholder — operator, contact email,
 * effective date, governing law, minimum age. Public route (allowed in the
 * proxy) so it is reachable signed-out and by the app stores.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/sign-up" className="text-sm text-muted hover:text-content">
        &larr; Back
      </Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-content">Terms of Service</h1>
      <p className="mt-1 text-sm text-faint">Last updated: [EFFECTIVE DATE]</p>

      <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Draft pending legal review — the [BRACKETED] values must be completed and the copy reviewed
        by a professional before launch (OQ-8).
      </div>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-content">
        <section>
          <p className="text-muted">
            Huddle (the &ldquo;Service&rdquo;) is operated by [OPERATOR] (&ldquo;we&rdquo;,
            &ldquo;us&rdquo;). These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the
            Huddle web and mobile apps. Please read them alongside our{' '}
            <Link href="/privacy" className="font-medium text-brand-ink underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">1. Acceptance</h2>
          <p className="mt-2 text-muted">
            By creating an account or using the Service, you agree to these Terms. If you
            don&rsquo;t agree, don&rsquo;t use the Service.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">2. Eligibility</h2>
          <p className="mt-2 text-muted">
            You must be at least [MINIMUM AGE] years old to use the Service. By using it, you
            confirm that you meet this requirement and are able to enter into these Terms.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">3. Your account</h2>
          <p className="mt-2 text-muted">
            You&rsquo;re responsible for the information you provide and for activity under your
            account. Keep your sign-in credentials secure and let us know promptly of any
            unauthorized use. You may sign in by email, a one-time code, or a supported third-party
            provider.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">4. Acceptable use</h2>
          <p className="mt-2 text-muted">
            You agree not to misuse the Service. In particular, you may not: access the Service by
            any automated means (bots, scrapers, crawlers, or scripted clients); attempt to
            circumvent rate limits, bot protection, or access controls; collect or harvest other
            users&rsquo; data; probe, scan, or test the vulnerability of the Service; or interfere
            with its normal operation. We may suspend or terminate accounts that do.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">5. Your content</h2>
          <p className="mt-2 text-muted">
            You keep ownership of the content you create (ideas, photos, comments, posts, polls, and
            similar). You grant us a limited license to host, store, display, and transmit that
            content as needed to operate the Service for you and the groups you share it with. You
            are responsible for your content, and it must not be unlawful, infringing, deceptive,
            harassing, or otherwise objectionable.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">
            6. Groups, sharing &amp; moderation
          </h2>
          <p className="mt-2 text-muted">
            Content you post in a group is visible to that group&rsquo;s members; metadata about a
            public group may be visible to other signed-in users for discovery. We provide reporting
            and blocking tools, and we may remove content or suspend accounts that violate these
            Terms. Group admins can manage membership and group settings.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">
            7. Service changes &amp; availability
          </h2>
          <p className="mt-2 text-muted">
            We may add, change, or discontinue features at any time. The Service is provided on an
            &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis, and we don&rsquo;t guarantee
            it will be uninterrupted or error-free.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">8. Disclaimers &amp; liability</h2>
          <p className="mt-2 text-muted">
            To the fullest extent permitted by law, we disclaim warranties of any kind and are not
            liable for indirect, incidental, or consequential damages arising from your use of the
            Service. [Confirm warranty disclaimer and any liability cap with counsel.]
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">9. Termination</h2>
          <p className="mt-2 text-muted">
            You can delete your account at any time from Account settings; deletion removes or
            de-identifies your personal information as described in the Privacy Policy. We may
            suspend or terminate access for violations of these Terms.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">10. Changes to these Terms</h2>
          <p className="mt-2 text-muted">
            We may update these Terms from time to time. If we make material changes, we&rsquo;ll
            update the date above and, where appropriate, notify you. Continued use after changes
            take effect means you accept the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">11. Governing law</h2>
          <p className="mt-2 text-muted">
            These Terms are governed by the laws of [GOVERNING LAW / JURISDICTION], without regard
            to its conflict-of-laws rules. [Confirm venue and any dispute-resolution / arbitration
            terms with counsel.]
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">12. Contact</h2>
          <p className="mt-2 text-muted">Questions about these Terms? Contact [CONTACT EMAIL].</p>
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
