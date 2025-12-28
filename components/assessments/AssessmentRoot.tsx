/**
 * Assessment Root Component
 * Entry point for assessments
 */

import React from 'react';
import { GutCheckAssessment } from './GutCheckAssessment';
import type { AssessmentType, AssessmentConfig } from '@/lib/assessmentTypes';

interface AssessmentRootProps {
  assessmentType: AssessmentType;
  initialVersion?: number;
  config?: AssessmentConfig; // Server-resolved config (CMS-first with file fallback)
}

export function AssessmentRoot({ assessmentType, initialVersion, config }: AssessmentRootProps) {
  switch (assessmentType) {
    case 'gut-check':
      return <GutCheckAssessment initialVersion={initialVersion} config={config} />;
    default:
      return (
        <div className="min-h-screen bg-brand-900 flex items-center justify-center">
          <p className="text-white text-lg">Unknown assessment type: {assessmentType}</p>
        </div>
      );
  }
}

