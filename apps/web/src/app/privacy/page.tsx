import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Huddle',
};

/**
 * Privacy Policy (Phase 10; drafted OQ-8). App-specific DRAFT, not
 * lawyer-reviewed. Before launch: (1) professional review, (2) fill every
 * [BRACKETED] placeholder, and (3) confirm the region-specific rights
 * (GDPR/CCPA) and international-transfer language for your audience (OQ-7).
 * Both app stores require a reachable privacy policy URL. Public route.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/sign-up" className="text-sm text-muted hover:text-content">
        &larr; Back
      </Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-content">Privacy Policy</h1>
      <p className="mt-1 text-sm text-faint">Last updated: [EFFECTIVE DATE]</p>

      <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Draft pending legal review — the [BRACKETED] values must be completed and the copy reviewed
        by a professional before launch (OQ-8).
      </div>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-content">
        <section>
          <p className="text-muted">
            This Privacy Policy explains how [OPERATOR] (&ldquo;we&rdquo;, &ldquo;us&rdquo;)
            collects, uses, and shares information when you use Huddle (the &ldquo;Service&rdquo;).
            It applies to the Huddle web and mobile apps.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">1. Information we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>
              <strong>Account information</strong> you provide: email address, username, display
              name, and an optional bio and avatar.
            </li>
            <li>
              <strong>Content you create</strong>: groups and their details, ideas (including
              optional photos, dates, and locations), comments, wall posts, polls, votes, RSVPs,
              reactions, and the decision history your groups generate.
            </li>
            <li>
              <strong>Notification data</strong>: device push tokens and browser push subscriptions
              (only if you enable notifications), plus your notification preferences.
            </li>
            <li>
              <strong>Technical data</strong> needed to run and secure the Service, such as log and
              device information and a sign-in session.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">2. How we use information</h2>
          <p className="mt-2 text-muted">
            To provide the Service to you and your groups; to send notifications and emails you have
            enabled (such as the optional weekly digest); to keep the Service secure and prevent
            abuse; and to operate, maintain, and improve the Service. We do <strong>not</strong>{' '}
            sell your personal information.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">3. How information is shared</h2>
          <p className="mt-2 text-muted">
            Content you post is visible to members of the groups you share it with; limited metadata
            about a public group may be visible to other signed-in users for discovery. We share
            data with service providers (&ldquo;subprocessors&rdquo;) that help us run the Service:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>
              <strong>Supabase</strong> — database, authentication, file storage, and backend
              hosting.
            </li>
            <li>
              <strong>Vercel</strong> — web app hosting.
            </li>
            <li>
              <strong>Cloudflare</strong> — bot protection (Turnstile) and network security.
            </li>
            <li>
              <strong>Google</strong> — optional sign-in with Google.
            </li>
            <li>
              <strong>Expo</strong> — mobile push notification delivery.
            </li>
            <li>
              <strong>Resend</strong> — email delivery (e.g. sign-in codes and the weekly digest).
            </li>
            <li>[Add Sentry or any other provider you enable before launch.]</li>
          </ul>
          <p className="mt-2 text-muted">
            We may also disclose information if required by law or to protect the rights, safety,
            and security of our users and the Service.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">4. Retention &amp; deletion</h2>
          <p className="mt-2 text-muted">
            We keep your information while your account is active. When you delete your account, we
            remove your personal information; some group history (such as past decisions) may be
            retained in de-identified form so that groups you participated in remain coherent for
            their other members.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">5. Your choices &amp; rights</h2>
          <p className="mt-2 text-muted">
            From the app you can edit your profile, manage notification preferences (including
            opting out of the weekly email digest and other notifications), block other users, and{' '}
            <strong>delete your account</strong> at any time. Depending on where you live, you may
            have additional rights (such as access, correction, deletion, or portability) under laws
            like the GDPR or CCPA. [Confirm the specific regional rights and how to exercise them
            for your audience — OQ-7.]
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">6. Security</h2>
          <p className="mt-2 text-muted">
            We protect data with row-level access controls so members only see content from their
            groups, an authentication wall, bot protection on sign-up, and encryption in transit. No
            method of transmission or storage is completely secure, but we work to protect your
            information.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">7. Children</h2>
          <p className="mt-2 text-muted">
            The Service isn&rsquo;t directed to children under [MINIMUM AGE], and we don&rsquo;t
            knowingly collect their personal information. If you believe a child has provided us
            information, contact us and we&rsquo;ll take appropriate steps.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">8. International users</h2>
          <p className="mt-2 text-muted">
            We and our subprocessors may process and store information in countries other than
            yours. [Confirm international-transfer language and hosting region for your audience —
            OQ-7.]
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">9. Changes to this policy</h2>
          <p className="mt-2 text-muted">
            We may update this policy from time to time. If we make material changes, we&rsquo;ll
            update the date above and, where appropriate, notify you.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">10. Contact</h2>
          <p className="mt-2 text-muted">Privacy questions or requests? Contact [CONTACT EMAIL].</p>
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
