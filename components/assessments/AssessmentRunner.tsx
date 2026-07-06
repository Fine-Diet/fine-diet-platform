/**
 * Assessment Runner
 *
 * Generic assessment flow shared by every registered assessment that uses the
 * standard question → results pattern. The server resolves the question set
 * (CMS-first with file fallback) and passes the config in; this component is
 * assessment-agnostic and is driven entirely by `assessmentType` + `config`.
 *
 * Previously this logic lived in GutCheckAssessment.tsx wired specifically to
 * Gut Check. It is now generic; GutCheckAssessment remains as a thin
 * compatibility wrapper.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { AssessmentProvider, useAssessment } from './AssessmentProvider';
import { QuestionScreen } from './QuestionScreen';
import { ResultsScreen } from './ResultsScreen';
import { PreviewResults } from './PreviewResults';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';
import { getAssessmentConfig } from '@/lib/assessmentConfig';
import { getLegacyClientFallbackConfig } from '@/lib/assessments/legacyClientFallback';
import type { AssessmentConfig, AssessmentType } from '@/lib/assessmentTypes';

interface AssessmentRunnerProps {
  assessmentType: AssessmentType;
  initialVersion?: number;
  /** Server-resolved config (preferred over client-side loading). */
  config?: AssessmentConfig;
  /** True when rendering an unpublished preview revision. */
  isPreview?: boolean;
}

export function AssessmentRunner({
  assessmentType,
  initialVersion,
  config: serverConfig,
  isPreview,
}: AssessmentRunnerProps) {
  const router = useRouter();
  const { submission_id } = router.query;
  const [clientConfig, setClientConfig] = useState<AssessmentConfig | null>(null);

  // initialVersion from SSR is the single source of truth - NEVER override with router.query
  // This ensures SSR-determined version cannot be changed by client-side hydration
  const version = initialVersion ?? 1;

  // Client-side fallback only runs when the server did not provide a config.
  // getAssessmentConfig currently only supports gut-check; for other types the
  // server always supplies config, so a failed load simply leaves LoadingState.
  // The Gut Check v1 fallback is isolated in getLegacyClientFallbackConfig.
  useEffect(() => {
    if (!serverConfig) {
      getAssessmentConfig(assessmentType, version)
        .then(setClientConfig)
        .catch((error) => {
          console.warn('[AssessmentRunner] Failed to load config, using legacy fallback:', error);
          setClientConfig(getLegacyClientFallbackConfig(assessmentType, version));
        });
    }
  }, [serverConfig, assessmentType, version]);

  // Use server-resolved config if provided, otherwise use client-loaded config
  const config = serverConfig ?? clientConfig;

  // Show loading if we're waiting for client config
  if (!config) {
    return <LoadingState />;
  }

  // If submission_id is in URL, show ResultsScreen (authoritative DB-driven).
  // Preview mode never writes a submission, so this branch is only hit by real
  // post-submit redirects.
  if (submission_id) {
    return <ResultsScreen />;
  }

  // Otherwise, show assessment flow
  return (
    <AssessmentProvider config={config} isPreview={isPreview}>
      <AssessmentContent isPreview={isPreview} />
    </AssessmentProvider>
  );
}

function AssessmentContent({ isPreview }: { isPreview?: boolean }) {
  const { state } = useAssessment();

  if (state.status === 'idle') {
    return <LoadingState />;
  }

  // Packet O: surface a dispatch scoring failure explicitly so it is never
  // silent. Submission is already blocked in the provider while
  // `scoringError` is set; this screen gives the user/operator enough signal
  // to recover. Reload = remount = INIT, which clears `scoringError`. An
  // answer change (SELECT_OPTION) also clears it without a reload, after
  // which the scoring effect re-runs.
  if (state.scoringError) {
    return (
      <ErrorState message="We couldn't score your assessment. Please reload to try again, or go back and change an answer." />
    );
  }

  // Preview mode: render the in-memory preview results once scoring is done,
  // instead of redirecting to a DB-backed results URL (no submission is written).
  if (isPreview && state.status === 'completed' && state.primaryAvatar) {
    return <PreviewResults />;
  }

  // ResultsScreen is only shown when submission_id is in URL (handled above).
  return <QuestionScreen />;
}
