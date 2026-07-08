/**
 * Canonical results route for a persisted submission.
 */

import { getAssessmentStartRoute } from './assessmentResultsLabels';

export function resolveSubmissionResultsRoute(
  submissionId: string,
  assessmentType: string | null | undefined
): string {
  const baseRoute = getAssessmentStartRoute(assessmentType);
  return `${baseRoute}?submission_id=${encodeURIComponent(submissionId)}`;
}
