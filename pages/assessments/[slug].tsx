/**
 * Canonical Assessment Cover Page
 *
 * Route: /assessments/[slug]
 *
 * Cover-first entry for every registered assessment. The page renders a
 * reusable, assessment-agnostic cover hero (AssessmentCoverHero) backed by
 * the cover config from resolveAssessmentExperience. It does NOT create an
 * assessment session — no getOrCreateSessionId, no POST /api/assessments/session.
 * Session creation lives entirely on the start route (/assessments/[slug]/start),
 * which the cover CTA links to.
 *
 * Results compatibility: when ?submission_id=... is present (the post-submit
 * redirect target the runner has always used), the page renders the existing
 * ResultsScreen inline so historical results URLs keep working. In that branch
 * the page still performs no session creation — ResultsScreen only reads the
 * submission from the database.
 *
 * Adding a new assessment type:
 *   1. Add a record to ASSESSMENT_REGISTRY (slug, type, metadata, status).
 *   2. Publish a question set in the CMS for that assessmentType.
 *   3. Optionally add a cover record to ASSESSMENT_COVER_CONFIGS; otherwise a
 *      generic cover is generated from the registry entry.
 */

import React from 'react';
import type { GetServerSideProps } from 'next';
import { AssessmentCoverHero } from '@/components/assessments/AssessmentCoverHero';
import { ResultsScreen } from '@/components/assessments/ResultsScreen';
import { PreviewBanner } from '@/components/assessments/PreviewBanner';
import { SeoHead } from '@/components/seo/SeoHead';
import {
  resolveAssessmentExperienceFromContext,
  type ResolvedAssessmentExperience,
} from '@/lib/assessments/resolveAssessmentExperience';
import type { SeoMeta } from '@/lib/seo/getSeo';

interface AssessmentCoverPageProps {
  cover: ResolvedAssessmentExperience['cover'];
  startHref: string;
  hasSubmissionId: boolean;
  seo: SeoMeta;
  isPreview: boolean;
  previewRevisionId?: string;
  slug: string;
  initialVersion: number;
}

export default function AssessmentCoverPage({
  cover,
  startHref,
  hasSubmissionId,
  seo,
  isPreview,
  previewRevisionId,
  slug,
  initialVersion,
}: AssessmentCoverPageProps) {
  // Preview URLs must never be indexed or cached as canonical content.
  const seoWithNoIndex: SeoMeta = isPreview
    ? { ...seo, robots: 'noindex, nofollow', canonical: `/assessments/${slug}` }
    : seo;

  // Post-submit redirect target: render results inline at the canonical URL.
  // ResultsScreen reads submission_id from the router query itself.
  if (hasSubmissionId) {
    return (
      <>
        <SeoHead seo={seoWithNoIndex} />
        <ResultsScreen />
      </>
    );
  }

  return (
    <>
      <SeoHead seo={seoWithNoIndex} />
      {isPreview && (
        <PreviewBanner
          slug={slug}
          assessmentVersion={initialVersion}
          previewRevisionId={previewRevisionId}
          manageHref="/admin/question-sets"
        />
      )}
      <AssessmentCoverHero cover={cover} startHref={startHref} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AssessmentCoverPageProps> = async (context) => {
  const experience = await resolveAssessmentExperienceFromContext(context, {
    resolveRunnerConfig: false,
    resolvePreviewFlag: true,
  });

  if (!experience) {
    return { notFound: true };
  }

  return {
    props: {
      cover: experience.cover,
      startHref: experience.startHref,
      hasSubmissionId: experience.hasSubmissionId,
      seo: experience.seo,
      isPreview: experience.isPreview,
      previewRevisionId: experience.previewRevisionId || undefined,
      slug: experience.slug,
      initialVersion: experience.initialVersion,
    },
  };
};
