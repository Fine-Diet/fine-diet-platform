/**
 * Assessment Root Component
 * Entry point for assessments
 */

import React from 'react';
import { GutCheckAssessment } from './GutCheckAssessment';
import type { AssessmentType } from '@/lib/assessmentTypes';

interface AssessmentRootProps {
  assessmentType: AssessmentType;
  initialVersion?: number;
}

export function AssessmentRoot({ assessmentType, initialVersion }: AssessmentRootProps) {
  switch (assessmentType) {
    case 'gut-check':
      return <GutCheckAssessment initialVersion={initialVersion} />;
    default:
      return (
        <div className="min-h-screen bg-brand-900 flex items-center justify-center">
          <p className="text-white text-lg">Unknown assessment type: {assessmentType}</p>
        </div>
      );
  }
}

