/**
 * Canonical Assessment Page
 *
 * Route: /assessments/[slug]
 *
 * Serves all published assessment types under a single canonical URL family.
 * /gut-check redirects here via next.config.js (permanent: false).
 *
 * Adding a new assessment type:
 *   1. Add the slug to SUPPORTED_ASSESSMENT_TYPES
 *   2. Add meta copy to ASSESSMENT_META
 *   3. Publish a question set in the CMS for that assessmentType
 *   4. For gut-check only: file-system fallback is preserved indefinitely
 *      All other types are CMS-only; no published revision → 404
 */

import React, { useEffect } from 'react';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { AssessmentRoot } from '@/components/assessments/AssessmentRoot';
import { getOrCreateSessionId } from '@/lib/assessmentSession';
import { resolveQuestionSet } from '@/lib/assessments/questions/resolveQuestionSet';
import { parseVersionFromQuery } from '@/lib/assessments/questions/parseVersion';
import { questionSetToAssessmentConfig, getAssessmentConfig } from '@/lib/assessmentConfig';
import type { AssessmentConfig, AssessmentType } from '@/lib/assessmentTypes';

// ============================================================================
// Supported assessment types
// Add new slugs here as new assessments are activated.
// ============================================================================

const SUPPORTED_ASSESSMENT_TYPES: readonly string[] = ['gut-check'];

const ASSESSMENT_META: Record<string, { title: string; description: string }> = {
  'gut-check': {
    title: 'Gut Check Assessment',
    description:
      'Take our quick gut health assessment to discover your personalized insights and learn about The Fine Diet Method.',
  },
};

// ============================================================================
// Page component
// ============================================================================

interface AssessmentPageProps {
  assessmentType: string;
  initialVersion: number;
  config: AssessmentConfig;
}

export default function AssessmentPage({
  assessmentType,
  initialVersion,
  config,
}: AssessmentPageProps) {
  const meta = ASSESSMENT_META[assessmentType] ?? {
    title: 'Assessment',
    description: 'Take a Fine Diet assessment.',
  };

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
      <Head>
        <title>{meta.title} • Fine Diet</title>
        <meta name="description" content={meta.description} />
      </Head>
      <AssessmentRoot
        assessmentType={assessmentType as AssessmentType}
        initialVersion={initialVersion}
        config={config}
      />
    </>
  );
}

// ============================================================================
// Server-side props
// ============================================================================

export const getServerSideProps: GetServerSideProps<AssessmentPageProps> = async (context) => {
  const rawSlug = context.params?.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : (rawSlug ?? '');

  if (!SUPPORTED_ASSESSMENT_TYPES.includes(slug)) {
    return { notFound: true };
  }

  const initialVersion = parseVersionFromQuery(context.query.v, 3);

  let config: AssessmentConfig;
  let resolvedSource: 'cms' | 'file' | 'cms_empty' = 'file';
  let revisionId: string | undefined;

  try {
    const result = await resolveQuestionSet({
      assessmentType: slug,
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
      // gut-check has a file-system fallback; all other types return 404.
      if (slug === 'gut-check') {
        const { loadQuestionSet } = await import(
          '@/lib/assessments/questions/loadQuestionSet'
        );

        const fileQuestionSet = loadQuestionSet({
          assessmentType: slug,
          assessmentVersion: initialVersion,
          locale: null,
        });

        if (fileQuestionSet) {
          config = questionSetToAssessmentConfig(fileQuestionSet, initialVersion);
          resolvedSource = 'file';
        } else if (initialVersion !== 2) {
          // Fallback to v2 file
          const v2QuestionSet = loadQuestionSet({
            assessmentType: 'gut-check',
            assessmentVersion: 2,
            locale: null,
          });
          config = v2QuestionSet
            ? questionSetToAssessmentConfig(v2QuestionSet, 2)
            : await getAssessmentConfig('gut-check', 2);
          resolvedSource = 'file';
          console.warn(
            `[assessments/[slug]] Version ${initialVersion} not available, falling back to v2 file`
          );
        } else {
          config = await getAssessmentConfig('gut-check', 2);
          resolvedSource = 'file';
        }
      } else {
        return { notFound: true };
      }
    } else {
      // Unexpected resolution state
      if (slug === 'gut-check') {
        config = await getAssessmentConfig('gut-check', initialVersion);
        resolvedSource = 'file';
      } else {
        return { notFound: true };
      }
    }
  } catch (error) {
    console.error(`[assessments/[slug]] Error resolving question set for "${slug}":`, error);

    if (slug === 'gut-check') {
      config = await getAssessmentConfig('gut-check', initialVersion);
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

  return {
    props: {
      assessmentType: slug,
      initialVersion,
      config,
    },
  };
};
