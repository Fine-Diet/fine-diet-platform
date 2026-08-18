/**
 * Isolated Plans NBA forward-coverage decision policy.
 *
 * Tune horizon / healthy-min here. Do not embed these thresholds in UI or
 * canonical plan/pantry/grocery writes. Version the policy so later packets
 * can compare behavior across releases.
 */

export const PLANS_FORWARD_COVERAGE_POLICY_ID = 'plans-nba.forward-coverage' as const;
export const PLANS_FORWARD_COVERAGE_POLICY_VERSION = 'v1' as const;

export interface PlansForwardCoveragePolicy {
  id: typeof PLANS_FORWARD_COVERAGE_POLICY_ID;
  version: string;
  /** Calendar days after today that count as "ahead". */
  horizonDays: number;
  /** Minimum planned days inside the horizon for coverage to be healthy. */
  healthyMinCoveredDays: number;
}

export const PLANS_FORWARD_COVERAGE_POLICY: PlansForwardCoveragePolicy = {
  id: PLANS_FORWARD_COVERAGE_POLICY_ID,
  version: PLANS_FORWARD_COVERAGE_POLICY_VERSION,
  horizonDays: 6,
  healthyMinCoveredDays: 3,
};

export type ForwardCoverageKind = 'weak' | 'healthy';

export interface ForwardCoverageAssessment {
  kind: ForwardCoverageKind;
  coveredDayCount: number;
  horizonDays: number;
  healthyMinCoveredDays: number;
  policyId: typeof PLANS_FORWARD_COVERAGE_POLICY_ID;
  policyVersion: string;
}

export function assessForwardCoverage(
  coveredDayCount: number,
  policy: PlansForwardCoveragePolicy = PLANS_FORWARD_COVERAGE_POLICY,
): ForwardCoverageAssessment {
  const { horizonDays, healthyMinCoveredDays, id, version } = policy;
  const weak =
    horizonDays <= 0 || coveredDayCount < Math.min(healthyMinCoveredDays, horizonDays);
  return {
    kind: weak ? 'weak' : 'healthy',
    coveredDayCount,
    horizonDays,
    healthyMinCoveredDays,
    policyId: id,
    policyVersion: version,
  };
}

export function isForwardCoverageWeak(
  coveredDayCount: number,
  policy: PlansForwardCoveragePolicy = PLANS_FORWARD_COVERAGE_POLICY,
): boolean {
  return assessForwardCoverage(coveredDayCount, policy).kind === 'weak';
}
