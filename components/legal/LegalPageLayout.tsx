import Head from 'next/head';
import Link from 'next/link';

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalPageLayoutProps {
  title: string;
  summary: string;
  sections: LegalSection[];
  metaDescription: string;
  effectiveDate: string;
}

const CONTACT_EMAIL = 'hi@myfinediet.com';

export function LegalPageLayout({
  title,
  summary,
  sections,
  metaDescription,
  effectiveDate,
}: LegalPageLayoutProps) {
  return (
    <>
      <Head>
        <title>{`${title} | Fine Diet`}</title>
        <meta name="description" content={metaDescription} />
      </Head>

      <main className="min-h-screen bg-brand-900">
        <section className="max-w-[760px] mx-auto px-6 pt-20 pb-24">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-denim-400 antialiased mb-3">
            Legal
          </p>
          <h1 className="text-4xl sm:text-5xl font-semibold text-white leading-tight antialiased mb-4">
            {title}
          </h1>
          <p className="text-sm text-white/50 antialiased mb-6">Effective Date: {effectiveDate}</p>
          <p className="text-base sm:text-lg text-white/70 font-light antialiased leading-relaxed">
            {summary}
          </p>

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
