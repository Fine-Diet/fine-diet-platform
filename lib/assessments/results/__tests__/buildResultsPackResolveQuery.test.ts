/**
 * Tests for assessment-aware results-pack resolve query building (Packet X1).
 */

import { buildResultsPackResolveQuery } from '../buildResultsPackResolveQuery';
import { GUT_CHECK_RESULTS_CONTENT_VERSION } from '../constants';
import { BASELINE_READINESS_RESULTS_CONTENT_VERSION } from '../../baselineReadiness/constants';
import type { SubmissionData } from '../types';

function makeSubmission(
  overrides: Partial<SubmissionData> = {}
): SubmissionData {
  return {
    id: 'sub-1',
    assessment_type: 'gut-check',
    assessment_version: 2,
    session_id: 'sess-1',
    primary_avatar: 'level2',
    ...overrides,
  } as SubmissionData;
}

describe('buildResultsPackResolveQuery', () => {
  it('uses v2 for Gut Check submissions', () => {
    const params = buildResultsPackResolveQuery({
      submissionData: makeSubmission({
        assessment_type: 'gut-check',
        primary_avatar: 'level2',
      }),
      isPreviewRequest: false,
    });

    expect(params.get('assessmentType')).toBe('gut-check');
    expect(params.get('resultsVersion')).toBe(GUT_CHECK_RESULTS_CONTENT_VERSION);
    expect(params.get('levelId')).toBe('level2');
    expect(params.get('preview')).toBeNull();
    expect(params.get('resultsPackRef')).toBeNull();
  });

  it('uses v1-internal for Baseline Readiness submissions', () => {
    const params = buildResultsPackResolveQuery({
      submissionData: makeSubmission({
        assessment_type: 'baseline-readiness',
        primary_avatar: 'readiness-building',
      }),
      isPreviewRequest: false,
    });

    expect(params.get('assessmentType')).toBe('baseline-readiness');
    expect(params.get('resultsVersion')).toBe(
      BASELINE_READINESS_RESULTS_CONTENT_VERSION
    );
    expect(params.get('levelId')).toBe('readiness-building');
  });

  it('forwards preview and pinned resultsPackRef when present', () => {
    const ref = { packId: 'pack-1', revisionId: 'rev-1' };
    const params = buildResultsPackResolveQuery({
      submissionData: makeSubmission({
        metadata: { resultsPackRef: ref },
      }),
      isPreviewRequest: true,
    });

    expect(params.get('preview')).toBe('1');
    expect(params.get('resultsPackRef')).toBe(JSON.stringify(ref));
  });
});
