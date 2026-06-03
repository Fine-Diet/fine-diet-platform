import Head from 'next/head';
import Link from 'next/link';

/**
 * Shared shell for Fine Diet legal/policy pages (Packet E).
 *
 * IMPORTANT: These pages ship as STRUCTURAL PLACEHOLDERS pending legal review.
 * The visible draft banner and `noindex` are intentional so unapproved copy is
 * never presented as final/binding or surfaced in search. Do not remove the
 * banner or mark a policy "effective" until legal sign-off lands. Final copy is
 * expected to be managed via the CMS/site content layer.
 *
 * Renders inside the marketing chrome (NavBar + Footer from pages/_app.tsx),
 * matching the dark brand-900 marketing theme used by pages/the-fine-print.tsx.
 */

export interface LegalSection {
  heading: string;
  /** One or more paragraphs of placeholder/structural copy. */
  body: string[];
}

export interface LegalPageLayoutProps {
  /** Page + document title, e.g. "Privacy Policy". */
  title: string;
  /** Short plain-language summary of what the policy will cover. */
  summary: string;
  /** Structural sections a finalized policy is expected to contain. */
  sections: LegalSection[];
  /** Meta description for <head>. */
  metaDescription: string;
}

const CONTACT_EMAIL = 'hello@myfinediet.com';

export function LegalPageLayout({ title, summary, sections, metaDescription }: LegalPageLayoutProps) {
  return (
    <>
      <Head>
        <title>{`${title} | Fine Diet`}</title>
        <meta name="description" content={metaDescription} />
        {/* Draft policy — keep out of search until legal approves final copy. */}
        <meta name="robots" content="noindex,follow" />
      </Head>

      <main className="min-h-screen bg-brand-900">
        <section className="max-w-[760px] mx-auto px-6 pt-20 pb-24">
          {/* Draft / pending-approval banner */}
          <div
            role="note"
            className="mb-10 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-5 py-4"
          >
            <p className="text-sm font-semibold text-amber-200 antialiased">
              Draft — pending legal review
            </p>
            <p className="mt-1 text-sm text-amber-100/80 font-light antialiased leading-relaxed">
              This document is a working draft published for transparency. It is not yet
              in effect and does not constitute the final, binding policy. Final terms are
              subject to legal review and approval.
            </p>
          </div>

          {/* Heading */}
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-denim-400 antialiased mb-3">
            Legal
          </p>
          <h1 className="text-4xl sm:text-5xl font-semibold text-white leading-tight antialiased mb-4">
            {title}
          </h1>
          <p className="text-sm text-white/50 antialiased mb-6">Last updated: pending approval</p>
          <p className="text-base sm:text-lg text-white/70 font-light antialiased leading-relaxed">
            {summary}
          </p>

          {/* Sections */}
          <div className="mt-12 space-y-10">
            {sections.map((section, index) => (
              <section key={section.heading}>
                <h2 className="text-xl font-semibold text-white antialiased mb-3">
                  {index + 1}. {section.heading}
                </h2>
                <div className="space-y-3">
                  {section.body.map((paragraph, pIndex) => (
                    <p
                      key={pIndex}
                      className="text-sm sm:text-base text-white/70 font-light antialiased leading-relaxed"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Contact + cross-links */}
          <div className="mt-14 border-t border-neutral-700/40 pt-8">
            <p className="text-sm text-white/60 font-light antialiased leading-relaxed">
              Questions about this policy? Contact us at{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-denim-300 hover:text-denim-200 underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
            <nav className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link href="/privacy" className="text-white/50 hover:text-white/80 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-white/50 hover:text-white/80 transition-colors">
                Terms &amp; Conditions
              </Link>
              <Link href="/refund-policy" className="text-white/50 hover:text-white/80 transition-colors">
                Refund Policy
              </Link>
              <Link
                href="/health-disclaimer"
                className="text-white/50 hover:text-white/80 transition-colors"
              >
                Health Disclaimer
              </Link>
            </nav>
          </div>
        </section>
      </main>
    </>
  );
}
