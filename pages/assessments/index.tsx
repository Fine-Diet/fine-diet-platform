/**
 * Assessments Collection Page
 *
 * Route: /assessments
 *
 * Canonical, assessment-agnostic landing for the assessment catalog. Lists
 * every active assessment from the registry so generic entry points (account
 * empty states, "take an assessment" CTAs) can point here instead of linking
 * directly to a single assessment. Only assessments with `catalogVisible: true`
 * are listed — guarded/direct-link assessments may be `active` but hidden until
 * marketing launch approval. Individual assessments still resolve by slug at
 * /assessments/<slug> when shared via direct link.
 */

import React from 'react';
import Link from 'next/link';
import {
  listCatalogAssessments,
  type AssessmentRegistryEntry,
} from '@/lib/assessments/assessmentRegistry';
import { getSeoForRoute } from '@/lib/seo/getSeo';
import type { SeoMeta } from '@/lib/seo/getSeo';
import { SeoHead } from '@/components/seo/SeoHead';

interface AssessmentsIndexProps {
  assessments: Array<
    Pick<AssessmentRegistryEntry, 'slug' | 'title' | 'shortTitle' | 'description' | 'canonicalPath'>
  >;
  seo: SeoMeta;
}

export default function AssessmentsIndexPage({ assessments, seo }: AssessmentsIndexProps) {
  return (
    <>
      <SeoHead seo={seo} />
      <div className="min-h-screen bg-brand-900">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 antialiased">
            Assessments
          </h1>
          <p className="text-neutral-300 text-lg mb-8 antialiased">
            Find your starting point. Each assessment gives you a personalized read in a few minutes — free and instant.
          </p>

          {assessments.length === 0 ? (
            <p className="text-neutral-300 text-lg antialiased">
              No assessments are available right now. Check back soon.
            </p>
          ) : (
            <div className="space-y-4">
              {assessments.map((assessment) => (
                <div
                  key={assessment.slug}
                  className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-6 hover:border-neutral-600 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-white mb-2 antialiased">
                        {assessment.shortTitle}
                      </h2>
                      <p className="text-neutral-300 text-sm antialiased">
                        {assessment.description}
                      </p>
                    </div>
                    <Link
                      href={assessment.canonicalPath}
                      className="ml-4 bg-denim-500 hover:bg-denim-600 text-neutral-900 font-semibold px-4 py-2 rounded-full transition-colors antialiased whitespace-nowrap"
                    >
                      Start
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export async function getStaticProps() {
  const assessments = listCatalogAssessments().map((entry) => ({
    slug: entry.slug,
    title: entry.title,
    shortTitle: entry.shortTitle,
    description: entry.description,
    canonicalPath: entry.canonicalPath,
  }));

  // Standardize /assessments onto the shared SeoHead pipeline. Route-level
  // seo:route:/assessments records (managed via the SEO admin / site_content)
  // supply social preview image/context; the registry description is the
  // page-level fallback; global SEO is the final fallback.
  const seoResult = await getSeoForRoute({
    routePath: '/assessments',
    pageTitle: 'Assessments',
    pageDescription:
      'Explore Fine Diet assessments and find a personalized starting point — free and instant.',
  });

  return { props: { assessments, seo: seoResult.seo }, revalidate: 300 };
}
