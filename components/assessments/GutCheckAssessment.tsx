/**
 * Gut Check Assessment (compatibility wrapper)
 *
 * The assessment flow is now generic and lives in AssessmentRunner. This file
 * is retained as a thin, Gut Check-bound wrapper for backward compatibility
 * with any callers that still import GutCheckAssessment directly.
 *
 * New code should render AssessmentRunner with an explicit assessmentType
 * resolved from the assessment registry.
 */

import React from 'react';
import { AssessmentRunner } from './AssessmentRunner';
import type { AssessmentConfig } from '@/lib/assessmentTypes';

interface GutCheckAssessmentProps {
  initialVersion?: number;
  config?: AssessmentConfig;
}

export function GutCheckAssessment({ initialVersion, config }: GutCheckAssessmentProps) {
  return (
    <AssessmentRunner assessmentType="gut-check" initialVersion={initialVersion} config={config} />
  );
}
