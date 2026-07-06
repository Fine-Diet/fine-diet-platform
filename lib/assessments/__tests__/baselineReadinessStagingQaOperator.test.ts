/**
 * Baseline Readiness staging QA operator tests (Packet U)
 */

import {
  assertApplyModeAllowed,
  buildPlannedCmsOperations,
  computeGoNoGo,
  isProductionEnvironment,
  parseCliArgs,
  renderQaReportMarkdown,
  validateBaselineReadinessSource,
  BASELINE_READINESS_ASSESSMENT_TYPE,
  BASELINE_READINESS_QUESTION_SET_VERSION,
  EXPECTED_QUESTION_IDS,
  EXPECTED_AVATARS,
  type QaReport,
} from '@/lib/assessments/baselineReadiness/stagingQaOperator';
import { BASELINE_READINESS_RESULTS_CONTENT_VERSION } from '@/lib/assessments/baselineReadiness/constants';

describe('baselineReadinessStagingQaOperator', () => {
  describe('validateBaselineReadinessSource', () => {
    it('validates known source JSON successfully', () => {
      const result = validateBaselineReadinessSource();
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.questionSet.assessmentType).toBe(BASELINE_READINESS_ASSESSMENT_TYPE);
      expect(result.questionSet.schemaVersion).toBe('2');
      expect(result.questionSet.assessmentVersion).toBe(BASELINE_READINESS_QUESTION_SET_VERSION);
      expect(result.questionSet.questionIds.sort()).toEqual([...EXPECTED_QUESTION_IDS].sort());
      expect(result.questionSet.avatars).toEqual(EXPECTED_AVATARS);
      expect(result.resultPacks.resultsVersion).toBe(
        BASELINE_READINESS_RESULTS_CONTENT_VERSION
      );
      expect(result.resultPacks.levelIds.sort()).toEqual([...EXPECTED_AVATARS].sort());
      for (const levelId of EXPECTED_AVATARS) {
        expect(result.resultPacks.packs[levelId]?.ok).toBe(true);
      }
    });
  });

  describe('parseCliArgs', () => {
    it('defaults to dry-run mode', () => {
      const options = parseCliArgs(['node', 'script']);
      expect(options.mode).toBe('dry-run');
      expect(options.confirmStagingWrite).toBe(false);
    });

    it('parses apply and environment flags', () => {
      const options = parseCliArgs([
        'node',
        'script',
        '--apply',
        '--environment=staging',
        '--base-url=https://staging.example.com',
        '--confirm-staging-write',
      ]);
      expect(options.mode).toBe('apply');
      expect(options.environment).toBe('staging');
      expect(options.baseUrl).toBe('https://staging.example.com');
      expect(options.confirmStagingWrite).toBe(true);
    });
  });

  describe('assertApplyModeAllowed', () => {
    it('allows dry-run without staging flags', () => {
      expect(assertApplyModeAllowed({ mode: 'dry-run' }).ok).toBe(true);
    });

    it('refuses production environment', () => {
      const result = assertApplyModeAllowed({
        mode: 'apply',
        environment: 'production',
        baseUrl: 'https://staging.example.com',
        confirmStagingWrite: true,
        adminSessionCookie: 'session=abc',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.blockers.some((b) => b.includes('production'))).toBe(true);
      }
    });

    it('refuses apply without confirmation flag', () => {
      const result = assertApplyModeAllowed({
        mode: 'apply',
        environment: 'staging',
        baseUrl: 'https://staging.example.com',
        confirmStagingWrite: false,
        adminSessionCookie: 'session=abc',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.blockers.some((b) => b.includes('--confirm-staging-write'))).toBe(
          true
        );
      }
    });

    it('refuses apply without admin session cookie', () => {
      const result = assertApplyModeAllowed({
        mode: 'apply',
        environment: 'staging',
        baseUrl: 'https://staging.example.com',
        confirmStagingWrite: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.blockers.some((b) => b.includes('BASELINE_READINESS_QA_ADMIN_COOKIE'))).toBe(
          true
        );
      }
    });

    it('refuses production base URL', () => {
      const result = assertApplyModeAllowed({
        mode: 'apply',
        environment: 'staging',
        baseUrl: 'https://www.finediet.com',
        confirmStagingWrite: true,
        adminSessionCookie: 'session=abc',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.blockers.some((b) => b.includes('production'))).toBe(true);
      }
    });
  });

  describe('isProductionEnvironment', () => {
    it('detects production-like environment names', () => {
      expect(isProductionEnvironment('production')).toBe(true);
      expect(isProductionEnvironment('prod')).toBe(true);
      expect(isProductionEnvironment('staging')).toBe(false);
    });
  });

  describe('buildPlannedCmsOperations', () => {
    it('includes expected question and result pack identities in dry-run', () => {
      const ops = buildPlannedCmsOperations({ mode: 'dry-run' });
      expect(ops.some((o) => o.kind === 'save-question-set-draft')).toBe(true);
      expect(
        ops.filter((o) => o.kind === 'create-result-pack-identity')
      ).toHaveLength(3);
      expect(
        ops.filter((o) => o.kind === 'save-result-pack-revision')
      ).toHaveLength(3);
      for (const levelId of EXPECTED_AVATARS) {
        expect(
          ops.some(
            (o) =>
              o.kind === 'create-result-pack-identity' &&
              o.identity.level_id === levelId
          )
        ).toBe(true);
      }
    });

    it('does not plan publish operations unless --publish-revisions', () => {
      const ops = buildPlannedCmsOperations({ mode: 'apply', publishRevisions: false });
      expect(ops.some((o) => o.kind === 'publish-question-set-revision')).toBe(false);
      expect(ops.some((o) => o.kind === 'publish-result-pack-revision')).toBe(false);
    });
  });

  describe('renderQaReportMarkdown', () => {
    it('generates structured markdown report shape', () => {
      const validation = validateBaselineReadinessSource();
      const report: QaReport = {
        timestamp: '2026-07-06T12:00:00.000Z',
        mode: 'dry-run',
        environment: '(not set)',
        baseUrl: null,
        sourceValidation: validation,
        plannedCmsOperations: buildPlannedCmsOperations({ mode: 'dry-run' }),
        applyResults: [],
        forcedPreviewChecks: [],
        publicSafetyChecks: [],
        sideEffectChecks: [],
        blockers: [],
        goNoGo: 'DRY-RUN-ONLY',
        manualReviewRemaining: ['Visual QA'],
      };

      const md = renderQaReportMarkdown(report);
      expect(md).toContain('# Baseline Readiness Staging QA Report');
      expect(md).toContain('**Mode:** dry-run');
      expect(md).toContain('## Source JSON validation');
      expect(md).toContain('## Planned CMS identities / operations');
      expect(md).toContain('## Forced-preview checks');
      expect(md).toContain('## Public safety checks');
      expect(md).toContain('## Manual review still required');
      expect(md).toContain(BASELINE_READINESS_ASSESSMENT_TYPE);
      expect(md).toContain('br-q1');
      expect(md).toContain('readiness-low');
    });
  });

  describe('computeGoNoGo', () => {
    it('returns DRY-RUN-ONLY when source validates in dry-run mode', () => {
      const validation = validateBaselineReadinessSource();
      const go = computeGoNoGo({
        timestamp: '',
        mode: 'dry-run',
        environment: '',
        baseUrl: null,
        sourceValidation: validation,
        plannedCmsOperations: [],
        applyResults: [],
        forcedPreviewChecks: [],
        publicSafetyChecks: [],
        sideEffectChecks: [],
        blockers: [],
        goNoGo: 'NO-GO',
        manualReviewRemaining: [],
      });
      expect(go).toBe('DRY-RUN-ONLY');
    });
  });
});
