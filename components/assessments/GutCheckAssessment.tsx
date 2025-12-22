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

export function GutCheckAssessment() {
  const router = useRouter();
  const { submission_id, v } = router.query;
  
  // Determine version from query param (default to 1 for backward compatibility)
  // Only evaluate when router is ready to ensure query params are available
  const version = router.isReady
    ? (v === '2' || v === 'v2' ? 2 : 1)
    : 1;
  const config = getAssessmentConfig('gut-check', version);

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

  // Don't show ResultsScreen here anymore - redirect happens after submission
  // ResultsScreen is only shown when submission_id is in URL
  return <QuestionScreen />;
}

