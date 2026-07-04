/**
 * Assessment Start / Runner Route
 *
 * Route: /assessments/[slug]/start
 *
 * Owns assessment session creation and the runner UI. The page resolves the
 * full assessment experience (registry + version + runner question-set config
 * via the CMS-first / file-fallback path) and hands a server-resolved config
 * to AssessmentRoot → AssessmentRunner → AssessmentProvider, which creates
 * or resumes the session on mount.
 *
 * This is the only assessment route that creates a session. The cover page
 * (/assessments/[slug]) deliberately does not.
 *
 * Preview: ?preview=1 is honored only for editor/admin roles — the resolver
 * reads the SSR auth context and applies the same gating as
 * /api/question-sets/resolve. ?v= overrides the default version, same as the
 * old [slug] page.
 *
 * Results compatibility: if ?submission_id=... is present, AssessmentRunner
 * renders ResultsScreen (unchanged behavior), so this route also serves as a
 * stable results entry point.
 */

import React from 'react';
import type { GetServerSideProps } from 'next';
import { AssessmentRoot } from '@/components/assessments/AssessmentRoot';
import { PreviewBanner } from '@/components/assessments/PreviewBanner';
import { SeoHead } from '@/components/seo/SeoHead';
import {
  resolveAssessmentExperienceFromContext,
  type ResolvedAssessmentExperience,
} from '@/lib/assessments/resolveAssessmentExperience';
import type { AssessmentConfig, AssessmentType } from '@/lib/assessmentTypes';
import type { SeoMeta } from '@/lib/seo/getSeo';

interface AssessmentStartPageProps {
  assessmentType: AssessmentType;
  initialVersion: number;
  config: AssessmentConfig;
  isPreview: boolean;
  previewRevisionId?: string;
  slug: string;
  seo: SeoMeta;
}

export default function AssessmentStartPage({
  assessmentType,
  initialVersion,
  config,
  isPreview,
  previewRevisionId,
  slug,
  seo,
}: AssessmentStartPageProps) {
  const seoWithNoIndex: SeoMeta = isPreview
    ? { ...seo, robots: 'noindex, nofollow', canonical: `/assessments/${slug}` }
    : seo;

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
      <AssessmentRoot
        assessmentType={assessmentType}
        initialVersion={initialVersion}
        config={config}
        isPreview={isPreview}
      />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AssessmentStartPageProps> = async (context) => {
  const experience = await resolveAssessmentExperienceFromContext(context, {
    resolveRunnerConfig: true,
  });

  if (!experience) {
    return { notFound: true };
  }

  // No published question set and no file fallback available — nothing to run.
  if (!experience.runnerConfig) {
    return { notFound: true };
  }

  return {
    props: {
      assessmentType: experience.entry.assessmentType,
      initialVersion: experience.initialVersion,
      config: experience.runnerConfig,
      isPreview: experience.isPreview,
      previewRevisionId: experience.previewRevisionId || undefined,
      slug: experience.slug,
      seo: experience.seo,
    },
  };
};
