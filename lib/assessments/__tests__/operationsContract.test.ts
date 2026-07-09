/**
 * Tests for the assessment operations contract registry + readiness evaluator.
 *
 * Covers:
 *   - Gut Check contract is declared with the expected identity + adapter.
 *   - Lookup helpers behave for known / unknown / empty inputs.
 *   - evaluateReadiness maps automated checks honestly from ReadinessInput.
 *   - Info-only checks always report manual-review.
 *   - summarizeReadiness rolls up status correctly.
 */

import {
  getOperationsContract,
  listOperationsContracts,
  hasOperationsContract,
  getAssessmentOperationsProfile,
  evaluateReadiness,
  summarizeReadiness,
  type OperationsContract,
  type ReadinessInput,
} from '../operationsContract';

function readyInput(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    assessmentType: 'gut-check',
    questionSetPresent: true,
    resultsLevelsWithCopy: 4,
    resultsLevelsExpected: 4,
    runtimePreviewAvailable: true,
    emailWebhookConfigured: true,
    pdfRoutePresent: true,
    scoringAdapterDeclared: true,
    draftContentExposed: false,
    ...overrides,
  };
}

describe('operations contract registry', () => {
  it('declares a Gut Check contract', () => {
    const c = getOperationsContract('gut-check');
    expect(c).toBeDefined();
    expect(c?.assessmentType).toBe('gut-check');
    expect(c?.title).toBe('Gut Check Assessment');
  });

  it('gut-check contract uses the v3 axis adapter as live', () => {
    const c = getOperationsContract('gut-check')!;
    expect(c.scoringAdapterId).toBe('gut-check-axis-v3');
    expect(c.scoringStyle).toBe('axis-band-decision-tree');
    expect(c.legacyScoringAdapters).toContain('gut-check-axis-v2');
    expect(c.legacyScoringAdapters).toContain('gut-check-weighted-v1');
  });

  it('declares 4 result levels level1-level4', () => {
    const c = getOperationsContract('gut-check')!;
    expect(c.resultLevels.map((l) => l.id)).toEqual([
      'level1',
      'level2',
      'level3',
      'level4',
    ]);
  });

  it('option value model is 0-3 with 4 options/question', () => {
    const c = getOperationsContract('gut-check')!;
    expect(c.optionValueModel.min).toBe(0);
    expect(c.optionValueModel.max).toBe(3);
    expect(c.optionValueModel.optionsPerQuestion).toBe(4);
  });

  it('honestly marks share as not-implemented and pdf as implemented', () => {
    const c = getOperationsContract('gut-check')!;
    const share = c.outputs.find((o) => o.key === 'share');
    const pdf = c.outputs.find((o) => o.key === 'pdf');
    expect(share?.status).toBe('not-implemented');
    expect(pdf?.status).toBe('implemented');
  });

  it('lists contracts and answers hasOperationsContract', () => {
    expect(listOperationsContracts().length).toBeGreaterThan(0);
    expect(hasOperationsContract('gut-check')).toBe(true);
    expect(hasOperationsContract('does-not-exist')).toBe(false);
    expect(hasOperationsContract(null)).toBe(false);
  });

  it('returns undefined for unknown / empty lookup', () => {
    expect(getOperationsContract('future-assessment')).toBeUndefined();
    expect(getOperationsContract(null)).toBeUndefined();
    expect(getOperationsContract('')).toBeUndefined();
  });

  it('joins contract + registry into an operations profile for gut-check', () => {
    const profile = getAssessmentOperationsProfile('gut-check');
    expect(profile).toBeDefined();
    expect(profile?.registry.slug).toBe('gut-check');
    expect(profile?.contract.assessmentType).toBe('gut-check');
  });

  it('joins baseline-readiness active registry + contract', () => {
    const profile = getAssessmentOperationsProfile('baseline-readiness');
    expect(profile).toBeDefined();
    expect(profile?.registry.status).toBe('active');
    expect(profile?.contract.scoringAdapterId).toBe(
      'baseline-readiness-total-score-v1-provisional'
    );
  });

  it('declares Baseline Readiness contract with readiness levels', () => {
    const c = getOperationsContract('baseline-readiness');
    expect(c).toBeDefined();
    expect(c?.resultLevels.map((l) => l.id)).toEqual([
      'readiness-low',
      'readiness-building',
      'readiness-ready',
    ]);
  });

  it('baseline-readiness operator copy reflects public marketing launch (X7)', () => {
    const c = getOperationsContract('baseline-readiness')!;
    const registryActive = c.readinessRequirements.find((r) => r.key === 'registry-active');
    const noDraftExposed = c.readinessRequirements.find(
      (r) => r.key === 'no-draft-content-exposed'
    );

    expect(registryActive?.description).toContain('guarded activation complete');
    expect(noDraftExposed?.description).toContain('indexable');
    expect(c.preview.notes).toContain('indexable');
    expect(c.preview.notes).toContain('catalog-listed');
    expect(c.preview.notes).not.toMatch(/registry status is draft/i);
    expect(noDraftExposed?.description).not.toMatch(/404/i);
  });

  it('returns null when the assessment has no contract', () => {
    expect(getAssessmentOperationsProfile('future-assessment')).toBeNull();
  });
});

describe('evaluateReadiness', () => {
  it('reports all automated checks verified when input is healthy', () => {
    const c = getOperationsContract('gut-check')!;
    const results = evaluateReadiness(c, readyInput());
    const automated = results.filter((r) => r.automated);
    expect(automated.length).toBeGreaterThan(0);
    expect(automated.every((r) => r.status === 'verified')).toBe(true);
  });

  it('flags missing result copy', () => {
    const c = getOperationsContract('gut-check')!;
    const results = evaluateReadiness(c, readyInput({ resultsLevelsWithCopy: 2 }));
    const check = results.find((r) => r.key === 'result-levels-have-copy')!;
    expect(check.status).toBe('missing');
    expect(check.detail).toContain('2/4');
  });

  it('flags missing pdf route as not-implemented', () => {
    const c = getOperationsContract('gut-check')!;
    const results = evaluateReadiness(c, readyInput({ pdfRoutePresent: false }));
    const check = results.find((r) => r.key === 'pdf-path-configured')!;
    expect(check.status).toBe('not-implemented');
  });

  it('email webhook unknown reports manual-review (honest)', () => {
    const c = getOperationsContract('gut-check')!;
    const results = evaluateReadiness(c, readyInput({ emailWebhookConfigured: false }));
    const check = results.find((r) => r.key === 'email-summary-configured')!;
    expect(check.status).toBe('manual-review');
    expect(check.detail).toContain('N8N_WEBHOOK_URL');
  });

  it('info-only checks always report manual-review', () => {
    const c = getOperationsContract('gut-check')!;
    const results = evaluateReadiness(c, readyInput());
    const infoOnly = results.filter((r) => !r.automated);
    expect(infoOnly.length).toBeGreaterThan(0);
    expect(infoOnly.every((r) => r.status === 'manual-review')).toBe(true);
  });

  it('scoring-adapter-declared reports missing when undeclared', () => {
    const c = getOperationsContract('gut-check')!;
    const results = evaluateReadiness(
      c,
      readyInput({ scoringAdapterDeclared: false })
    );
    const check = results.find((r) => r.key === 'scoring-adapter-declared')!;
    expect(check.status).toBe('missing');
  });

  it('returns one result per requirement', () => {
    const c = getOperationsContract('gut-check')!;
    const results = evaluateReadiness(c, readyInput());
    expect(results.length).toBe(c.readinessRequirements.length);
  });
});

describe('summarizeReadiness', () => {
  it('rolls up to ready when everything is verified', () => {
    const c = getOperationsContract('gut-check')!;
    // All automated verified, but info-only are manual-review by design → needs-review.
    const results = evaluateReadiness(c, readyInput());
    const summary = summarizeReadiness(results);
    expect(summary.missing).toBe(0);
    expect(summary.notImplemented).toBe(0);
    // Info-only checks keep this from being fully "ready".
    expect(summary.status).toBe('needs-review');
    expect(summary.manualReview).toBeGreaterThan(0);
  });

  it('rolls up to blocked when any check is missing', () => {
    const c = getOperationsContract('gut-check')!;
    const results = evaluateReadiness(c, readyInput({ resultsLevelsWithCopy: 0 }));
    const summary = summarizeReadiness(results);
    expect(summary.status).toBe('blocked');
    expect(summary.missing).toBeGreaterThan(0);
  });

  it('counts verified / manualReview / missing / notImplemented correctly', () => {
    const c: OperationsContract = {
      ...getOperationsContract('gut-check')!,
      readinessRequirements: [
        { key: 'a', label: 'A', automated: true, description: 'd' },
        { key: 'b', label: 'B', automated: true, description: 'd' },
        { key: 'c', label: 'C', automated: false, description: 'd' },
      ],
    };
    // Override evaluator behavior by constructing inputs that map to:
    // a → verified (result-levels-have-copy), b → missing (pdf-path-configured),
    // c → manual-review (info-only).
    // We can't easily target arbitrary keys, so instead test the summarizer directly.
    const summary = summarizeReadiness([
      { key: 'a', label: 'A', status: 'verified', detail: '', automated: true },
      { key: 'b', label: 'B', status: 'missing', detail: '', automated: true },
      { key: 'c', label: 'C', status: 'manual-review', detail: '', automated: false },
      { key: 'd', label: 'D', status: 'not-implemented', detail: '', automated: true },
    ]);
    expect(summary).toEqual({
      status: 'blocked',
      verified: 1,
      manualReview: 1,
      missing: 1,
      notImplemented: 1,
    });
    // Touch c so TS doesn't complain about unused.
    expect(c.readinessRequirements.length).toBe(3);
  });
});
