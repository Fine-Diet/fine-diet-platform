/**
 * Assessment Root Component
 *
 * Entry point for assessments. Renders the generic AssessmentRunner for any
 * registered assessment type that shares the standard flow — there is no
 * per-assessment switch case. Unknown / unregistered types render a fallback.
 */

import React from 'react';
import { AssessmentRunner } from './AssessmentRunner';
import { getAssessmentEntryByType } from '@/lib/assessments/assessmentRegistry';
import type { AssessmentType, AssessmentConfig } from '@/lib/assessmentTypes';

interface AssessmentRootProps {
  assessmentType: AssessmentType;
  initialVersion?: number;
  config?: AssessmentConfig; // Server-resolved config (CMS-first with file fallback)
}

export function AssessmentRoot({ assessmentType, initialVersion, config }: AssessmentRootProps) {
  // A resolved config means the server already validated this assessment, so
  // we can always run it. Otherwise require a registry record before running.
  const isKnown = !!config || !!getAssessmentEntryByType(assessmentType);

  if (!isKnown) {
    return (
      <div className="min-h-screen bg-brand-900 flex items-center justify-center">
        <p className="text-white text-lg">Unknown assessment type: {assessmentType}</p>
      </div>
    );
  }

  return (
    <AssessmentRunner assessmentType={assessmentType} initialVersion={initialVersion} config={config} />
  );
}
