/**
 * Tests for next-assessment readiness inventory (Packet X12).
 */

import { dispatchScoring } from '@/lib/assessments/scoring/scoringDispatch';
import { mapAssessmentOutcome } from '@/lib/assessments/outcomes/outcomeMapping';
import {
  inventoryLiveAssessments,
  inventoryNextAssessmentReadiness,
  DRAFT_ACTIVATION_SURFACES,
} from '@/lib/assessments/nextAssessmentReadiness';

const PLACEHOLDER_TYPE = 'unconfirmed-future-assessment';

describe('inventoryNextAssessmentReadiness: unregistered type', () => {
  it('reports all draft surfaces missing for an unconfirmed slug', () => {
    const report = inventoryNextAssessmentReadiness(
      'unconfirmed-future-slug',
      PLACEHOLDER_TYPE
    );

    expect(report.draftActivationReady).toBe(false);
    expect(report.operatorReady).toBe(false);
    expect(report.missingRequired).toContain('registry');
    expect(report.missingRequired).toContain('scoring-adapter');
    expect(report.missingRequired).toContain('outcome-mapper');
    expect(report.missingRequired).toContain('operations-contract');

    const registry = report.surfaces.find((s) => s.surface === 'registry');
    expect(registry?.status).toBe('missing');
  });

  it('does not treat optional surfaces as required missing', () => {
    const report = inventoryNextAssessmentReadiness(
      'unconfirmed-future-slug',
      PLACEHOLDER_TYPE
    );

    const optional = report.surfaces.filter((s) => s.status === 'optional-missing');
    expect(optional.map((s) => s.surface)).toEqual(
      expect.arrayContaining([
        'deployment-config',
        'staging-qa-runner',
        'dedicated-cover-config',
        'forced-result-preview',
        'repo-content-folder',
      ])
    );
    expect(report.missingRequired).not.toContain('deployment-config');
  });
});

describe('inventoryNextAssessmentReadiness: live assessments', () => {
  it('gut-check is draft-activation ready', () => {
    const report = inventoryNextAssessmentReadiness('gut-check', 'gut-check');
    expect(report.draftActivationReady).toBe(true);
    for (const surface of DRAFT_ACTIVATION_SURFACES) {
      const check = report.surfaces.find((s) => s.surface === surface);
      expect(check?.status).toBe('present');
    }
  });

  it('baseline-readiness is operator ready', () => {
    const report = inventoryNextAssessmentReadiness(
      'baseline-readiness',
      'baseline-readiness'
    );
    expect(report.draftActivationReady).toBe(true);
    expect(report.operatorReady).toBe(true);
    expect(report.surfaces.find((s) => s.surface === 'deployment-config')?.status).toBe(
      'present'
    );
    expect(report.surfaces.find((s) => s.surface === 'staging-qa-runner')?.status).toBe(
      'present'
    );
    expect(report.surfaces.find((s) => s.surface === 'repo-content-folder')?.status).toBe(
      'present'
    );
  });

  it('inventoryLiveAssessments covers gut-check and baseline-readiness', () => {
    const reports = inventoryLiveAssessments();
    const slugs = reports.map((r) => r.slug).sort();
    expect(slugs).toEqual(['baseline-readiness', 'gut-check']);
    expect(reports.every((r) => r.draftActivationReady)).toBe(true);
  });
});

describe('fail-closed for unregistered assessmentType', () => {
  it('dispatchScoring returns unknown-assessment-type', async () => {
    const result = await dispatchScoring({
      assessmentType: PLACEHOLDER_TYPE,
      answers: [],
      config: {
        assessmentType: PLACEHOLDER_TYPE,
        assessmentVersion: 1,
        questions: [],
        avatars: [],
        scoring: { thresholds: { secondaryAvatarThreshold: 0, confidenceThresholds: { high: 0, medium: 0 } } },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unknown-assessment-type');
    }
  });

  it('mapAssessmentOutcome returns unknown-assessment-type', () => {
    const outcome = mapAssessmentOutcome({
      assessmentType: PLACEHOLDER_TYPE,
      scoringOutput: {
        assessmentType: PLACEHOLDER_TYPE,
        assessmentVersion: 1,
        adapterId: 'gut-check-axis-v3',
        scoringTemplateId: 'axis-scores-to-profile',
        primaryAvatar: 'level1',
        scoreMap: {},
        normalizedScoreMap: {},
        confidenceScore: 0,
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe('unknown-assessment-type');
    }
  });
});
