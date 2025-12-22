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
  const { submission_id, debug } = router.query;
  
  // Use initialVersion from SSR (source of truth), fallback to router query for backward compatibility
  // Only use router.query as fallback if initialVersion is not provided
  const routerVersion = router.isReady && router.query.v
    ? (router.query.v === '2' || router.query.v === 'v2' ? 2 : 1)
    : undefined;
  const version = initialVersion ?? routerVersion ?? 1;
  const config = getAssessmentConfig('gut-check', version);

  // Debug marker (only visible when ?debug=1)
  const showDebug = debug === '1';

  // If submission_id is in URL, show ResultsScreen (authoritative DB-driven)
  if (submission_id) {
    return <ResultsScreen />;
  }

  // Otherwise, show assessment flow
  return (
    <>
      {showDebug && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px',
          fontSize: '12px',
          fontFamily: 'monospace',
          zIndex: 9999,
          textAlign: 'center'
        }}>
          [GutCheck debug] requestedVersion={initialVersion ?? routerVersion ?? 'undefined'} configVersion={config.assessmentVersion} sessionVersion=check Network tab POST /api/assessments/session
        </div>
      )}
      <AssessmentProvider config={config}>
        <AssessmentContent />
      </AssessmentProvider>
    </>
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

