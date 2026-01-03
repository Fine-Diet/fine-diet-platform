/**
 * Gut Check Assessment Page
 * 
 * Route: /gut-check
 * 
 * Loads questions via CMS resolver (resolveQuestionSet) with file fallback.
 * Supports ?v= query parameter for version selection (default: 2).
 */

import React, { useEffect } from 'react';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { AssessmentRoot } from '@/components/assessments/AssessmentRoot';
import { getOrCreateSessionId } from '@/lib/assessmentSession';
import { resolveQuestionSet } from '@/lib/assessments/questions/resolveQuestionSet';
import { parseVersionFromQuery } from '@/lib/assessments/questions/parseVersion';
import { questionSetToAssessmentConfig, getAssessmentConfig } from '@/lib/assessmentConfig';
import type { AssessmentConfig } from '@/lib/assessmentTypes';

interface GutCheckPageProps {
  initialVersion: number;
  config: AssessmentConfig;
}

export default function GutCheckPage({ initialVersion, config }: GutCheckPageProps) {
  const router = useRouter();

  useEffect(() => {
    const sessionId = getOrCreateSessionId();

    // Create/update session with correct version using API endpoint
    // The API handles upserts correctly based on (session_id, assessment_type, assessment_version)
    // Send both field names for compatibility
    fetch('/api/assessments/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentType: 'gut-check',
        assessmentVersion: initialVersion,
        assessment_version: initialVersion, // Also send snake_case for compatibility
        sessionId,
        status: 'started',
        lastQuestionIndex: 0,
      }),
    }).catch((error) => {
      console.error('Error creating/updating session:', error);
      // Don't block UI - just log
    });
  }, [initialVersion]);

  return (
    <>
      <Head>
        <title>Gut Check Assessment • Fine Diet</title>
        <meta
          name="description"
          content="Take our quick gut health assessment to discover your personalized insights and learn about The Fine Diet Method."
        />
      </Head>
      <AssessmentRoot assessmentType="gut-check" initialVersion={initialVersion} config={config} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<GutCheckPageProps> = async (context) => {
  // Parse version from query param (default: 2, restrict to 1-99)
  const initialVersion = parseVersionFromQuery(context.query.v, 2);

  // Resolve question set from CMS with file fallback
  // IMPORTANT: Never pass preview=1 for public runtime (preview only via admin tooling)
  let config: AssessmentConfig;
  let resolvedSource: 'cms' | 'file' | 'cms_empty' = 'file';
  let revisionId: string | undefined;
  
  try {
    const result = await resolveQuestionSet({
      assessmentType: 'gut-check',
      assessmentVersion: initialVersion,
      locale: null, // Default locale
      preview: false, // Never use preview for public runtime
      userRole: 'user', // Public runtime is always 'user'
      pinnedQuestionsRef: null, // No pinning at runtime
    });

    resolvedSource = result.source;
    revisionId = result.questionSetRef?.publishedRevisionId || result.questionSetRef?.previewRevisionId;

    if (result.source === 'cms' && result.questionSet) {
      // Convert QuestionSet to AssessmentConfig
      config = questionSetToAssessmentConfig(result.questionSet, initialVersion);
    } else if (result.source === 'file' && result.questionSet) {
      // File fallback - convert QuestionSet to AssessmentConfig
      config = questionSetToAssessmentConfig(result.questionSet, initialVersion);
    } else if (result.source === 'cms_empty') {
      // CMS exists but no published revision - try file fallback for this version
      const { loadQuestionSet } = await import('@/lib/assessments/questions/loadQuestionSet');
      const fileQuestionSet = loadQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: initialVersion,
        locale: null,
      });

      if (fileQuestionSet) {
        config = questionSetToAssessmentConfig(fileQuestionSet, initialVersion);
        resolvedSource = 'file';
      } else {
        // No file fallback for this version - fallback to v2 file
        if (initialVersion !== 2) {
          const { loadQuestionSet: loadV2 } = await import('@/lib/assessments/questions/loadQuestionSet');
          const v2QuestionSet = loadV2({
            assessmentType: 'gut-check',
            assessmentVersion: 2,
            locale: null,
          });
          
          if (v2QuestionSet) {
            config = questionSetToAssessmentConfig(v2QuestionSet, 2);
            resolvedSource = 'file';
            // Log that we're using v2 fallback
            console.warn(`[gut-check] Version ${initialVersion} not available, falling back to v2 file`);
          } else {
            // Last resort: use legacy getAssessmentConfig for v2
            config = await getAssessmentConfig('gut-check', 2);
            resolvedSource = 'file';
          }
        } else {
          // v2 requested but no file - use legacy function
          config = await getAssessmentConfig('gut-check', 2);
          resolvedSource = 'file';
        }
      }
    } else {
      // Unexpected state - fallback to legacy config
      config = await getAssessmentConfig('gut-check', initialVersion);
      resolvedSource = 'file';
    }
  } catch (error) {
    // Error resolving - fallback to legacy config
    console.error('[gut-check] Error resolving question set, using file fallback:', error);
    config = await getAssessmentConfig('gut-check', initialVersion);
    resolvedSource = 'file';
  }

  // Minimal server-side logging (structured)
  console.log('[gut-check] Question set resolved', {
    requestedVersion: initialVersion,
    resolvedSource,
    revisionId: revisionId || null,
  });

  return {
    props: {
      initialVersion,
      config,
    },
  };
};

