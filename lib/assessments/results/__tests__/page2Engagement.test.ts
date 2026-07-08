import {
  canProceedFromPage2,
  isPage2EngagementRequired,
} from '@/lib/assessments/results/page2Engagement';
import {
  getAssessmentStartRoute,
  getResultsPdfFilename,
  getResultsVideoModalTitle,
} from '@/lib/assessments/results/assessmentResultsLabels';
import { resolveSubmissionResultsRoute } from '@/lib/assessments/results/resolveSubmissionResultsRoute';

describe('page2Engagement', () => {
  it('requires engagement for Gut Check artifacts', () => {
    expect(isPage2EngagementRequired('gut-check')).toBe(true);
  });

  it('does not require engagement for Baseline when artifacts are disabled', () => {
    expect(isPage2EngagementRequired('baseline-readiness')).toBe(false);
  });

  it('lets Baseline proceed without video/email/pdf interaction', () => {
    expect(
      canProceedFromPage2({
        assessmentType: 'baseline-readiness',
        hasWatchedVideo: false,
        hasEmailedResults: false,
        hasDownloadedPdf: false,
      })
    ).toBe(true);
  });

  it('keeps Gut Check gated until an artifact interaction occurs', () => {
    expect(
      canProceedFromPage2({
        assessmentType: 'gut-check',
        hasWatchedVideo: false,
        hasEmailedResults: false,
        hasDownloadedPdf: false,
      })
    ).toBe(false);

    expect(
      canProceedFromPage2({
        assessmentType: 'gut-check',
        hasWatchedVideo: true,
        hasEmailedResults: false,
        hasDownloadedPdf: false,
      })
    ).toBe(true);
  });
});

describe('assessmentResultsLabels', () => {
  it('builds assessment-aware start routes with Gut Check fallback', () => {
    expect(getAssessmentStartRoute('baseline-readiness')).toBe(
      '/assessments/baseline-readiness'
    );
    expect(getAssessmentStartRoute(undefined)).toBe('/assessments/gut-check');
  });

  it('builds assessment-aware PDF filenames', () => {
    expect(getResultsPdfFilename('baseline-readiness', 'sub-1')).toBe(
      'fine-diet-baseline-readiness-results-sub-1.pdf'
    );
    expect(getResultsPdfFilename('gut-check', 'sub-2')).toBe(
      'fine-diet-gut-check-results-sub-2.pdf'
    );
  });

  it('builds assessment-aware video modal titles', () => {
    expect(getResultsVideoModalTitle('baseline-readiness')).toBe(
      'Baseline Readiness Video'
    );
    expect(getResultsVideoModalTitle('gut-check')).toBe(
      'Gut Pattern Breakdown Video'
    );
  });
});

describe('resolveSubmissionResultsRoute', () => {
  it('redirects Baseline submissions to the Baseline results route', () => {
    expect(
      resolveSubmissionResultsRoute('abc-123', 'baseline-readiness')
    ).toBe('/assessments/baseline-readiness?submission_id=abc-123');
  });

  it('redirects Gut Check submissions to the Gut Check results route', () => {
    expect(resolveSubmissionResultsRoute('abc-123', 'gut-check')).toBe(
      '/assessments/gut-check?submission_id=abc-123'
    );
  });

  it('falls back to Gut Check when assessment type is missing', () => {
    expect(resolveSubmissionResultsRoute('abc-123', undefined)).toBe(
      '/assessments/gut-check?submission_id=abc-123'
    );
  });
});
