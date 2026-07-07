/**
 * Pure helper: build query params for GET /api/results-packs/resolve.
 *
 * Extracted from `useResultsPackResolution` so assessment-aware version
 * selection is unit-testable without React hooks or fetch mocks (Packet X1).
 */

import { resolveResultsContentVersion } from '@/lib/assessments/operationsContract';
import type { SubmissionData } from '@/lib/assessments/results/types';

export interface BuildResultsPackResolveQueryInput {
  submissionData: SubmissionData;
  isPreviewRequest: boolean;
}

export function buildResultsPackResolveQuery(
  input: BuildResultsPackResolveQueryInput
): URLSearchParams {
  const { submissionData, isPreviewRequest } = input;
  const resultsVersion = resolveResultsContentVersion(submissionData.assessment_type);
  const existingRef = submissionData.metadata?.resultsPackRef as
    | Record<string, unknown>
    | undefined;

  const params = new URLSearchParams({
    assessmentType: submissionData.assessment_type,
    resultsVersion,
    levelId: submissionData.primary_avatar,
  });

  if (isPreviewRequest) {
    params.set('preview', '1');
  }
  if (existingRef) {
    params.set('resultsPackRef', JSON.stringify(existingRef));
  }

  return params;
}
