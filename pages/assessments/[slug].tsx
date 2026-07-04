/**
 * Canonical Assessment Page
 *
 * Route: /assessments/[slug]
 *
 * Serves all published, registered assessment types under a single canonical
 * URL family. Supported slugs and metadata come from the assessment registry
 * (lib/assessments/assessmentRegistry.ts) — this route owns no hardcoded
 * Gut Check arrays or metadata maps.
 *
 * /gut-check redirects here via next.config.js (permanent: false).
 *
 * Adding a new assessment type:
 *   1. Add a record to ASSESSMENT_REGISTRY (slug, type, metadata, status).
 *   2. Publish a question set in the CMS for that assessmentType.
 *   3. File-system fallback is preserved only for entries with
 *      `hasFileFallback` (Gut Check). All others are CMS-only; no published
 *      revision → 404.
 */

import React, { useEffect } from 'react';
import type { GetServerSideProps } from 'next';
import { AssessmentRoot } from '@/components/assessments/AssessmentRoot';
import { getOrCreateSessionId } from '@/lib/assessmentSession';
import { resolveQuestionSet } from '@/lib/assessments/questions/resolveQuestionSet';
import { parseVersionFromQuery } from '@/lib/assessments/questions/parseVersion';
import { questionSetToAssessmentConfig, getAssessmentConfig } from '@/lib/assessmentConfig';
import {
  getAssessmentEntry,
  type AssessmentRegistryEntry,
} from '@/lib/assessments/assessmentRegistry';
import type { AssessmentConfig, AssessmentType } from '@/lib/assessmentTypes';
import { getSeoForRoute } from '@/lib/seo/getSeo';
import type { SeoMeta } from '@/lib/seo/getSeo';
import { SeoHead } from '@/components/seo/SeoHead';

// ============================================================================
// Page component
// ============================================================================

interface AssessmentPageProps {
  assessmentType: string;
  initialVersion: number;
  config: AssessmentConfig;
  meta: { title: string; description: string };
  seo: SeoMeta;
}

export default function AssessmentPage({
  assessmentType,
  initialVersion,
  config,
  meta,
  seo,
}: AssessmentPageProps) {
  useEffect(() => {
    const sessionId = getOrCreateSessionId();

    fetch('/api/assessments/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentType,
        assessmentVersion: initialVersion,
        sessionId,
        status: 'started',
        lastQuestionIndex: 0,
      }),
    }).catch((error) => {
      console.error('[assessments/[slug]] Error creating session:', error);
    });
  }, [assessmentType, initialVersion]);

  return (
    <>
      <SeoHead seo={seo} />
      <AssessmentRoot
        assessmentType={assessmentType as AssessmentType}
        initialVersion={initialVersion}
        config={config}
      />
    </>
  );
}

// ============================================================================
// File-system fallback (registry-driven)
// ============================================================================

/**
 * Resolve a config from the file system for assessments that opt into a file
 * fallback (Gut Check). Tries the requested version, then the entry's
 * configured fallback version, then the legacy getAssessmentConfig path.
 */
async function resolveFileFallbackConfig(
  entry: AssessmentRegistryEntry,
  requestedVersion: number
): Promise<AssessmentConfig> {
  const { loadQuestionSet } = await import('@/lib/assessments/questions/loadQuestionSet');

  const requested = loadQuestionSet({
    assessmentType: entry.assessmentType,
    assessmentVersion: requestedVersion,
    locale: null,
  });
  if (requested) {
    return questionSetToAssessmentConfig(requested, requestedVersion);
  }

  const fallbackVersion = entry.fileFallbackVersion ?? entry.defaultVersion;
  if (requestedVersion !== fallbackVersion) {
    const fallback = loadQuestionSet({
      assessmentType: entry.assessmentType,
      assessmentVersion: fallbackVersion,
      locale: null,
    });
    console.warn(
      `[assessments/[slug]] Version ${requestedVersion} not available for "${entry.slug}", falling back to v${fallbackVersion} file`
    );
    return fallback
      ? questionSetToAssessmentConfig(fallback, fallbackVersion)
      : getAssessmentConfig(entry.assessmentType, fallbackVersion);
  }

  return getAssessmentConfig(entry.assessmentType, fallbackVersion);
}

// ============================================================================
// Server-side props
// ============================================================================

export const getServerSideProps: GetServerSideProps<AssessmentPageProps> = async (context) => {
  const rawSlug = context.params?.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : (rawSlug ?? '');

  const entry = getAssessmentEntry(slug);
  if (!entry || entry.status !== 'active') {
    return { notFound: true };
  }

  const meta = { title: entry.title, description: entry.description };
  const initialVersion = parseVersionFromQuery(context.query.v, entry.defaultVersion);

  let config: AssessmentConfig;
  let resolvedSource: 'cms' | 'file' | 'cms_empty' = 'file';
  let revisionId: string | undefined;

  try {
    const result = await resolveQuestionSet({
      assessmentType: entry.assessmentType,
      assessmentVersion: initialVersion,
      locale: null,
      preview: false,
      userRole: 'user',
      pinnedQuestionsRef: null,
    });

    resolvedSource = result.source;
    revisionId =
      result.questionSetRef?.publishedRevisionId ||
      result.questionSetRef?.previewRevisionId;

    if ((result.source === 'cms' || result.source === 'file') && result.questionSet) {
      config = questionSetToAssessmentConfig(result.questionSet, initialVersion);
    } else if (result.source === 'cms_empty') {
      // CMS identity exists but has no published revision.
      if (entry.hasFileFallback) {
        config = await resolveFileFallbackConfig(entry, initialVersion);
        resolvedSource = 'file';
      } else {
        return { notFound: true };
      }
    } else {
      // Unexpected resolution state.
      if (entry.hasFileFallback) {
        config = await resolveFileFallbackConfig(entry, initialVersion);
        resolvedSource = 'file';
      } else {
        return { notFound: true };
      }
    }
  } catch (error) {
    console.error(`[assessments/[slug]] Error resolving question set for "${slug}":`, error);

    if (entry.hasFileFallback) {
      config = await resolveFileFallbackConfig(entry, initialVersion);
      resolvedSource = 'file';
    } else {
      return { notFound: true };
    }
  }

  console.log('[assessments/[slug]] Question set resolved', {
    slug,
    requestedVersion: initialVersion,
    resolvedSource,
    revisionId: revisionId || null,
  });

  // Standardize /assessments/[slug] onto the shared SeoHead pipeline. Route-
  // level seo:route:/assessments/{slug} records (managed via the SEO admin /
  // site_content) supply social preview image/context; the registry title and
  // description are the page-level fallback; global SEO is the final fallback.
  const seoResult = await getSeoForRoute({
    routePath: `/assessments/${slug}`,
    pageTitle: entry.title,
    pageDescription: entry.description,
  });

  return {
    props: {
      assessmentType: entry.assessmentType,
      initialVersion,
      config,
      meta,
      seo: seoResult.seo,
    },
  };
};
