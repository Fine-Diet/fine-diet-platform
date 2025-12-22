/**
 * Gut Check Assessment Component
 * Main assessment component for Gut Check
 */

import React from 'react';
import { useRouter } from 'next/router';
import { AssessmentProvider, useAssessment } from './AssessmentProvider';
import { QuestionScreen } from './QuestionScreen';
import { ResultsScreen } from './ResultsScreen';
import { LoadingState } from './LoadingState';
import { getAssessmentConfig } from '@/lib/assessmentConfig';

interface GutCheckAssessmentProps {
  initialVersion?: number;
}

export function GutCheckAssessment({ initialVersion }: GutCheckAssessmentProps) {
  const router = useRouter();
  const { submission_id } = router.query;
  
  // initialVersion from SSR is the single source of truth - NEVER override with router.query
  // This ensures SSR-determined version cannot be changed by client-side hydration
  const version = initialVersion ?? 1;
  const config = getAssessmentConfig('gut-check', version);

  // If submission_id is in URL, show ResultsScreen (authoritative DB-driven)
  if (submission_id) {
    return <ResultsScreen />;
  }

  // Otherwise, show assessment flow
  // Note: Debug marker is rendered in parent component (pages/gut-check.tsx) via SSR
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

  // Don't show ResultsScreen here anymore - redirect happens after submission
  // ResultsScreen is only shown when submission_id is in URL
  return <QuestionScreen />;
}

