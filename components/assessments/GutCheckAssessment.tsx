/**
 * Gut Check Assessment Component
 * Main assessment component for Gut Check
 */

import React from 'react';
import { AssessmentProvider, useAssessment } from './AssessmentProvider';
import { QuestionScreen } from './QuestionScreen';
import { ResultsScreen } from './ResultsScreen';
import { LoadingState } from './LoadingState';
import { getAssessmentConfig } from '@/lib/assessmentConfig';

export function GutCheckAssessment() {
  const config = getAssessmentConfig('gut-check');

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

  if (state.status === 'completed' || state.status === 'submitting') {
    return <ResultsScreen />;
  }

  return <QuestionScreen />;
}

