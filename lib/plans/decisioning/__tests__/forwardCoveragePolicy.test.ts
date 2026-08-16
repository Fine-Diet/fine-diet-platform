import {
  PLANS_FORWARD_COVERAGE_POLICY,
  PLANS_FORWARD_COVERAGE_POLICY_ID,
  PLANS_FORWARD_COVERAGE_POLICY_VERSION,
  assessForwardCoverage,
  isForwardCoverageWeak,
  type PlansForwardCoveragePolicy,
} from '../forwardCoveragePolicy';

describe('PLANS_FORWARD_COVERAGE_POLICY', () => {
  it('is a named, versioned policy with explicit horizon and healthy-min constants', () => {
    expect(PLANS_FORWARD_COVERAGE_POLICY.id).toBe(PLANS_FORWARD_COVERAGE_POLICY_ID);
    expect(PLANS_FORWARD_COVERAGE_POLICY.version).toBe(PLANS_FORWARD_COVERAGE_POLICY_VERSION);
    expect(PLANS_FORWARD_COVERAGE_POLICY.horizonDays).toBe(6);
    expect(PLANS_FORWARD_COVERAGE_POLICY.healthyMinCoveredDays).toBe(3);
  });

  it('treats fewer than 3 of the next 6 planned days as weak under v1', () => {
    expect(assessForwardCoverage(0).kind).toBe('weak');
    expect(assessForwardCoverage(2).kind).toBe('weak');
    expect(isForwardCoverageWeak(2)).toBe(true);
    expect(assessForwardCoverage(3).kind).toBe('healthy');
    expect(assessForwardCoverage(4).kind).toBe('healthy');
  });

  it('can be retuned without changing resolver or UI code', () => {
    const tighter: PlansForwardCoveragePolicy = {
      ...PLANS_FORWARD_COVERAGE_POLICY,
      version: 'v1-test-tight',
      healthyMinCoveredDays: 5,
    };
    expect(assessForwardCoverage(4, tighter).kind).toBe('weak');
    expect(assessForwardCoverage(5, tighter).kind).toBe('healthy');
    expect(assessForwardCoverage(4).kind).toBe('healthy');
  });

  it('caps the healthy minimum to the horizon so short horizons stay tunable', () => {
    const shortHorizon: PlansForwardCoveragePolicy = {
      ...PLANS_FORWARD_COVERAGE_POLICY,
      version: 'v1-test-short',
      horizonDays: 2,
      healthyMinCoveredDays: 3,
    };
    expect(assessForwardCoverage(1, shortHorizon).kind).toBe('weak');
    expect(assessForwardCoverage(2, shortHorizon).kind).toBe('healthy');
  });
});
