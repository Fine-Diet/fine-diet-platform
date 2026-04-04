/**
 * Assessment Landing Page
 *
 * Route: /lp/[assessmentSlug]
 *
 * Renders CMS-managed landing page content for a given assessment.
 * Content is fetched from site_content with key `assessment-landing:{slug}`.
 *
 * - Returns 404 if no published content exists for the slug.
 * - All content slots have safe defaults so a partially filled record renders.
 * - Populated entirely through the Operator API — no code changes needed for
 *   new assessments once their content is defined.
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { getAssessmentLandingPage } from '@/lib/contentApi';
import type { AssessmentLandingPageContent } from '@/lib/contentTypes';

// ============================================================================
// Props
// ============================================================================

interface AssessmentLandingPageProps {
  slug: string;
  content: AssessmentLandingPageContent;
}

// ============================================================================
// Page
// ============================================================================

export default function AssessmentLandingPage({ slug, content }: AssessmentLandingPageProps) {
  const { hero, trust, outcomes, seo } = content;
  const ctaHref = hero.ctaHref ?? `/${slug}`;

  const seoTitle = seo?.title ?? `${hero.headline} • Fine Diet`;
  const seoDescription = seo?.description ?? hero.subheadline ?? hero.body;

  return (
    <>
      <Head>
        <title>{seoTitle}</title>
        {seoDescription && <meta name="description" content={seoDescription} />}
      </Head>

      <main className="min-h-screen bg-white">
        {/* ── Hero ── */}
        <section
          className="relative isolate overflow-hidden min-h-[60vh] flex items-end"
          style={
            hero.backgroundImage
              ? { backgroundImage: `url(${hero.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }
          }
        >
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />

          <div className="relative z-10 mx-auto max-w-3xl px-6 py-16 sm:py-24 text-center w-full">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold leading-tight text-white mb-4">
              {hero.headline}
            </h1>

            {hero.subheadline && (
              <p className="text-lg sm:text-xl font-light text-white/85 mb-4 max-w-2xl mx-auto">
                {hero.subheadline}
              </p>
            )}

            {hero.body && (
              <p className="text-base font-light text-white/75 mb-8 max-w-xl mx-auto">
                {hero.body}
              </p>
            )}

            <Link
              href={ctaHref}
              className="inline-block rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-gray-900 shadow-md hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {hero.ctaLabel}
            </Link>
          </div>
        </section>

        {/* ── Outcomes ── */}
        {outcomes?.enabled && outcomes.items && outcomes.items.length > 0 && (
          <section className="mx-auto max-w-3xl px-6 py-14">
            {outcomes.headline && (
              <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 text-center mb-8">
                {outcomes.headline}
              </h2>
            )}
            <ul className="space-y-4">
              {outcomes.items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 text-gray-700">
                  <span className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold">✓</span>
                  <span className="text-base leading-relaxed">{item.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Trust ── */}
        {trust?.enabled && trust.items && trust.items.length > 0 && (
          <section className="bg-gray-50 px-6 py-14">
            <div className="mx-auto max-w-3xl">
              {trust.headline && (
                <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 text-center mb-8">
                  {trust.headline}
                </h2>
              )}
              <ul className="grid sm:grid-cols-2 gap-6">
                {trust.items.map((item) => (
                  <li key={item.id} className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-700 leading-relaxed shadow-sm">
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ── Bottom CTA ── */}
        <section className="mx-auto max-w-3xl px-6 py-14 text-center">
          <Link
            href={ctaHref}
            className="inline-block rounded-full bg-gray-900 px-10 py-4 text-sm font-semibold text-white shadow-md hover:bg-gray-700 transition-colors"
          >
            {hero.ctaLabel}
          </Link>
        </section>
      </main>
    </>
  );
}

// ============================================================================
// Data fetching
// ============================================================================

export const getServerSideProps: GetServerSideProps<AssessmentLandingPageProps> = async (
  context
) => {
  const slug = context.params?.assessmentSlug as string;

  const content = await getAssessmentLandingPage(slug);

  if (!content) {
    return { notFound: true };
  }

  return {
    props: { slug, content },
  };
};
