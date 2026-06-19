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
import { LoadingState } from './LoadingState';
import { getAssessmentConfig, gutCheckConfig } from '@/lib/assessmentConfig';
import type { AssessmentConfig, AssessmentType } from '@/lib/assessmentTypes';

interface AssessmentRunnerProps {
  assessmentType: AssessmentType;
  initialVersion?: number;
  /** Server-resolved config (preferred over client-side loading). */
  config?: AssessmentConfig;
}

export function AssessmentRunner({
  assessmentType,
  initialVersion,
  config: serverConfig,
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
  useEffect(() => {
    if (!serverConfig) {
      getAssessmentConfig(assessmentType, version)
        .then(setClientConfig)
        .catch((error) => {
          console.warn('[AssessmentRunner] Failed to load config, using base config:', error);
          setClientConfig(
            assessmentType === 'gut-check' && version === 1 ? gutCheckConfig : null
          );
        });
    }
  }, [serverConfig, assessmentType, version]);

  // Use server-resolved config if provided, otherwise use client-loaded config
  const config = serverConfig ?? clientConfig;

  // Show loading if we're waiting for client config
  if (!config) {
    return <LoadingState />;
  }

  // If submission_id is in URL, show ResultsScreen (authoritative DB-driven)
  if (submission_id) {
    return <ResultsScreen />;
  }

  // Otherwise, show assessment flow
  return (
    <AssessmentProvider config={config}>
      <AssessmentContent />
    </AssessmentProvider>
  );
}

function AssessmentContent() {
  const { state } = useAssessment();

  if (state.status === 'idle') {
    return <LoadingState />;
  }

  // ResultsScreen is only shown when submission_id is in URL (handled above).
  return <QuestionScreen />;
}
