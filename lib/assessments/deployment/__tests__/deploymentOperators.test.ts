/**
 * Generic assessment deployment operator tests (Packet X10).
 */

import { BASELINE_READINESS_DEPLOYMENT_CONFIG } from '@/lib/assessments/deployment/configs/baselineReadinessDeploymentConfig';
import {
  getDeploymentConfig,
  listDeploymentConfigSlugs,
  requireDeploymentConfig,
} from '@/lib/assessments/deployment/configRegistry';
import {
  assertApplyModeAllowed,
  isProductionBaseUrl,
  isProductionEnvironment,
} from '@/lib/assessments/deployment/applyModeGuard';
import {
  assessmentExpectsPublicIndex,
  buildInRepoLaunchGateChecks,
} from '@/lib/assessments/deployment/launchGateChecks';
import { htmlHasNoindex, buildForcedPreviewPath } from '@/lib/assessments/deployment/httpUtils';
import { buildPlaceholderCheck, scanTextForPlaceholders } from '@/lib/assessments/deployment/placeholderScan';
import { validateAssessmentSource } from '@/lib/assessments/deployment/sourceValidation';
import { parseLiveE2eCliArgs } from '@/lib/assessments/deployment/runAssessmentLiveE2eCli';
import { renderLiveE2eMarkdown } from '@/lib/assessments/deployment/liveE2eOperator';

describe('deployment config registry', () => {
  it('registers baseline-readiness', () => {
    expect(listDeploymentConfigSlugs()).toContain('baseline-readiness');
    expect(getDeploymentConfig('baseline-readiness')?.slug).toBe('baseline-readiness');
    expect(requireDeploymentConfig('baseline-readiness').assessmentType).toBe(
      'baseline-readiness'
    );
  });

  it('throws for unknown slug', () => {
    expect(() => requireDeploymentConfig('unknown-slug')).toThrow(/No deployment config/);
  });
});

describe('validateAssessmentSource (baseline config)', () => {
  it('validates Baseline repo JSON', () => {
    const result = validateAssessmentSource(BASELINE_READINESS_DEPLOYMENT_CONFIG);
    expect(result.ok).toBe(true);
    expect(result.questionSet.assessmentType).toBe('baseline-readiness');
    expect(result.resultPacks.levelIds.sort()).toEqual(
      [...BASELINE_READINESS_DEPLOYMENT_CONFIG.results.levelIds].sort()
    );
  });
});

describe('launch gate checks', () => {
  it('builds in-repo checks for baseline', () => {
    const checks = buildInRepoLaunchGateChecks(BASELINE_READINESS_DEPLOYMENT_CONFIG);
    expect(checks.some((c) => c.name.includes('runtime'))).toBe(true);
    expect(checks.some((c) => c.name.includes('catalog'))).toBe(true);
    expect(checks.some((c) => c.name.includes('artifacts'))).toBe(true);
  });

  it('reflects catalogVisible from registry for index expectation', () => {
    expect(typeof assessmentExpectsPublicIndex(BASELINE_READINESS_DEPLOYMENT_CONFIG)).toBe(
      'boolean'
    );
  });
});

describe('placeholderScan', () => {
  it('flags configured banned substrings', () => {
    const scan = buildPlaceholderCheck(
      'fixture ig61sqn2lyM in body',
      BASELINE_READINESS_DEPLOYMENT_CONFIG
    );
    expect(scan.status).toBe('fail');
    expect(scan.detail.startsWith('found:')).toBe(true);
  });

  it('passes clean approved copy', () => {
    const scan = scanTextForPlaceholders(
      'Start with the Fine Diet Method at /the-fine-diet-method',
      BASELINE_READINESS_DEPLOYMENT_CONFIG
    );
    expect(scan.clean).toBe(true);
  });
});

describe('httpUtils', () => {
  it('detects noindex in robots meta', () => {
    expect(
      htmlHasNoindex('<meta name="robots" content="noindex,follow">')
    ).toBe(true);
    expect(htmlHasNoindex('<meta name="robots" content="index,follow">')).toBe(false);
  });

  it('builds forced preview path from template', () => {
    expect(
      buildForcedPreviewPath(
        '/admin/assessments/x/preview?forceOutcome={forceOutcome}',
        'readiness-low'
      )
    ).toContain('readiness-low');
  });
});

describe('applyModeGuard', () => {
  it('refuses production environment for apply', () => {
    expect(isProductionEnvironment('production')).toBe(true);
    const result = assertApplyModeAllowed({
      mode: 'apply',
      environment: 'production',
      baseUrl: 'https://staging.example.com',
      confirmStagingWrite: true,
      adminSessionCookie: 'x',
    });
    expect(result.ok).toBe(false);
  });

  it('refuses production base URL for apply', () => {
    expect(isProductionBaseUrl('https://myfinediet.com')).toBe(true);
    const result = assertApplyModeAllowed({
      mode: 'apply',
      environment: 'staging',
      baseUrl: 'https://myfinediet.com',
      confirmStagingWrite: true,
      adminSessionCookie: 'x',
    });
    expect(result.ok).toBe(false);
  });

  it('allows dry-run without staging flags', () => {
    expect(assertApplyModeAllowed({ mode: 'dry-run' }).ok).toBe(true);
  });
});

describe('live E2E CLI helpers', () => {
  it('parses base-url and report-out', () => {
    const args = parseLiveE2eCliArgs([
      '--base-url=https://example.com',
      '--report-out=/tmp/report.md',
    ]);
    expect(args.baseUrl).toBe('https://example.com');
    expect(args.reportOut).toBe('/tmp/report.md');
  });

  it('renders markdown report skeleton', () => {
    const md = renderLiveE2eMarkdown({
      generatedAt: '2026-01-01T00:00:00.000Z',
      baseUrl: 'https://example.com',
      config: {
        slug: 'baseline-readiness',
        displayTitle: 'Baseline Readiness',
        assessmentType: 'baseline-readiness',
      },
      outcomes: [],
      siblingRegression: { status: 'pass', checks: [] },
      launchGateSummary: [],
      recommendation: 'GO',
    });
    expect(md).toContain('Baseline Readiness');
    expect(md).toContain('Sibling regression');
  });
});
