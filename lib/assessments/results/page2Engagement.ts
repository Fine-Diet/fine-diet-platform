/**
 * Page-2 engagement gate for the results screen.
 *
 * Gut Check requires email, PDF, or video interaction before proceeding when
 * those artifacts are enabled. Baseline Readiness disables downstream artifacts,
 * so placeholder videos must not trap users on page 2.
 */

import { isOutputArtifactEnabled } from '@/lib/assessments/operationsContract';

export function isPage2EngagementRequired(
  assessmentType: string | null | undefined
): boolean {
  return (
    isOutputArtifactEnabled(assessmentType, 'email') ||
    isOutputArtifactEnabled(assessmentType, 'pdf')
  );
}

export function canProceedFromPage2(input: {
  assessmentType: string | null | undefined;
  hasWatchedVideo: boolean;
  hasEmailedResults: boolean;
  hasDownloadedPdf: boolean;
}): boolean {
  if (!isPage2EngagementRequired(input.assessmentType)) {
    return true;
  }

  return (
    input.hasWatchedVideo ||
    input.hasEmailedResults ||
    input.hasDownloadedPdf
  );
}
