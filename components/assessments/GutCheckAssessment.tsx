/**
 * Gut Check Assessment Component
 * Main assessment component for Gut Check
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { AssessmentProvider, useAssessment } from './AssessmentProvider';
import { QuestionScreen } from './QuestionScreen';
import { ResultsScreen } from './ResultsScreen';
import { LoadingState } from './LoadingState';
import { getAssessmentConfig, gutCheckConfig } from '@/lib/assessmentConfig';
import type { AssessmentConfig } from '@/lib/assessmentTypes';

interface GutCheckAssessmentProps {
  initialVersion?: number;
  config?: AssessmentConfig; // Server-resolved config (preferred over client-side loading)
}

export function GutCheckAssessment({ initialVersion, config: serverConfig }: GutCheckAssessmentProps) {
  const router = useRouter();
  const { submission_id } = router.query;
  const [clientConfig, setClientConfig] = useState<AssessmentConfig | null>(null);
  
  // initialVersion from SSR is the single source of truth - NEVER override with router.query
  // This ensures SSR-determined version cannot be changed by client-side hydration
  const version = initialVersion ?? 1;
  
  // Phase 2 / Step 4: Client-side fallback now loads config async (with CMS thresholds for v1)
  useEffect(() => {
    if (!serverConfig) {
      // Client-side fallback: load config async
      getAssessmentConfig('gut-check', version)
        .then(setClientConfig)
        .catch((error) => {
          console.warn('[GutCheckAssessment] Failed to load config, using base config:', error);
          // Fallback to base config if CMS load fails
          setClientConfig(version === 1 ? gutCheckConfig : null);
        });
    }
  }, [serverConfig, version]);
  
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

