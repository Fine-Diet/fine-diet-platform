/**
 * Assessment-aware labels and routes for the shared results screen.
 */

export function getAssessmentStartRoute(
  assessmentType: string | null | undefined
): string {
  return assessmentType
    ? `/assessments/${assessmentType}`
    : '/assessments/gut-check';
}

export function getResultsPdfFilename(
  assessmentType: string | null | undefined,
  submissionId: string
): string {
  const slug = assessmentType || 'assessment';
  return `fine-diet-${slug}-results-${submissionId}.pdf`;
}

export function getResultsVideoModalTitle(
  assessmentType: string | null | undefined
): string {
  if (assessmentType === 'baseline-readiness') {
    return 'Baseline Readiness Video';
  }

  return 'Gut Pattern Breakdown Video';
}
