/**
 * Tests for the normalized result artifact payload contract.
 *
 * Covers:
 *   - buildResultArtifactPayload produces the canonical shape from a
 *     SubmissionData + Flow v2 content.
 *   - Legacy results pack fields are used when Flow v2 is absent.
 *   - Missing content degrades to null rather than throwing.
 *   - claimToken + claimed flags are derived from submission metadata.
 *   - payloadCoverageSummary counts alignment honestly.
 */

import {
  buildResultArtifactPayload,
  payloadCoverageSummary,
  RESULT_PAYLOAD_COVERAGE,
  type ResultArtifactPayloadInput,
} from '../resultArtifactPayload';
import type { SubmissionData } from '../results/types';

function makeSubmission(overrides: Partial<SubmissionData> = {}): SubmissionData {
  return {
    id: 'sub-1',
    primary_avatar: 'level2',
    secondary_avatar: null,
    score_map: { level2: 1 },
    normalized_score_map: { capacity: 0.7, buffer: 0.4 },
    confidence_score: 0.5,
    assessment_type: 'gut-check',
    assessment_version: 3,
    session_id: 'sess-1',
    email: null,
    user_id: null,
    metadata: { claimToken: 'token-abc' },
    ...overrides,
  };
}

describe('buildResultArtifactPayload', () => {
  it('produces the canonical shape from Flow v2 content', () => {
    const input: ResultArtifactPayloadInput = {
      submission: makeSubmission(),
      levelLabel: 'Sensitive',
      secondaryModifier: 'high_responsiveness',
      confidence: 'moderate',
      flow: {
        page1: { headline: 'H1', snapshotBullets: ['b1', 'b2'] },
        page2: { headline: 'H2', stepBullets: ['s1'], videoAssetUrl: 'https://vid' },
        page3: { problemHeadline: 'P', methodCtaLabel: 'Go', methodCtaUrl: '/go' },
      },
      channels: { web: true, email: true, pdf: false },
      copySource: 'cms-results-pack',
    };
    const p = buildResultArtifactPayload(input);
    expect(p.assessmentType).toBe('gut-check');
    expect(p.assessmentVersion).toBe(3);
    expect(p.submissionId).toBe('sub-1');
    expect(p.levelId).toBe('level2');
    expect(p.levelLabel).toBe('Sensitive');
    expect(p.secondaryModifier).toBe('high_responsiveness');
    expect(p.confidence).toBe('moderate');
    expect(p.page1?.headline).toBe('H1');
    expect(p.page1?.snapshotBullets).toEqual(['b1', 'b2']);
    expect(p.page2?.videoAssetUrl).toBe('https://vid');
    expect(p.page3?.methodCtaUrl).toBe('/go');
    expect(p.channels).toEqual({ web: true, email: true, pdf: false });
    expect(p.copySource).toBe('cms-results-pack');
  });

  it('falls back to legacy fields when Flow v2 is absent', () => {
    const p = buildResultArtifactPayload({
      submission: makeSubmission(),
      legacy: {
        summary: 'Legacy summary',
        keyPatterns: ['kp1'],
        firstFocusAreas: ['fa1', 'fa2'],
      },
      copySource: 'file-results-pack',
    });
    expect(p.page1?.headline).toBe('Legacy summary');
    expect(p.page1?.snapshotBullets).toEqual(['kp1']);
    expect(p.page2).toBeNull();
    expect(p.page3).toBeNull();
    expect(p.recommendations).toEqual([
      { title: 'First focus areas', bullets: ['fa1', 'fa2'] },
    ]);
  });

  it('degrades to null/empty without throwing when no content is supplied', () => {
    const p = buildResultArtifactPayload({ submission: makeSubmission() });
    expect(p.page1).toBeNull();
    expect(p.page2).toBeNull();
    expect(p.page3).toBeNull();
    expect(p.recommendations).toEqual([]);
    expect(p.levelLabel).toBeNull();
    expect(p.confidence).toBeNull();
    expect(p.copySource).toBe('unknown');
  });

  it('derives claimed + claimToken from submission metadata', () => {
    const claimed = buildResultArtifactPayload({
      submission: makeSubmission({ user_id: 'user-9', metadata: { claimToken: 'token-abc' } }),
    });
    expect(claimed.claimed).toBe(true);
    expect(claimed.claimToken).toBe('token-abc');

    const guest = buildResultArtifactPayload({
      submission: makeSubmission({ user_id: null, metadata: { claimToken: 'token-xyz' } }),
    });
    expect(guest.claimed).toBe(false);
    expect(guest.claimToken).toBe('token-xyz');

    const noToken = buildResultArtifactPayload({
      submission: makeSubmission({ user_id: null, metadata: null }),
    });
    expect(noToken.claimed).toBe(false);
    expect(noToken.claimToken).toBeNull();
  });

  it('defaults channel flags to web+email true, pdf false', () => {
    const p = buildResultArtifactPayload({ submission: makeSubmission() });
    expect(p.channels).toEqual({ web: true, email: true, pdf: false });
  });
});

describe('payloadCoverageSummary', () => {
  it('counts fields across the coverage map consistently', () => {
    const summary = payloadCoverageSummary();
    expect(summary.total).toBe(RESULT_PAYLOAD_COVERAGE.length);
    expect(
      summary.fullyAligned + summary.partial + summary.unused
    ).toBe(summary.total);
  });

  it('reports at least one fully-aligned field', () => {
    const summary = payloadCoverageSummary();
    expect(summary.fullyAligned).toBeGreaterThan(0);
  });
});
