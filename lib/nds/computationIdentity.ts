/**
 * Canonical NDS computation identity.
 *
 * Application publication, migration activation, and alignment tests all consume
 * this tuple. A generation integer names this identity; it is not a number an
 * older build may borrow while sending a different formula/normalizer/day policy.
 */

export const NDS_COMPUTATION_IDENTITY = {
  nds_version: 'nds_daily_2026-01-26.v10',
  classifier_version: 'processing_classifier_2026-02-08.v2',
  normalizer_version: 'nds_consumed_normalizer_2026-09-14.v3',
  day_policy_version: 'nds_day_policy_2026-09-13.v2',
} as const;

/**
 * Score-affecting dependency fingerprint bound to the active generation.
 * Must match `computeDependencyFingerprint()` / the SQL seed exactly.
 */
export const NDS_DEPENDENCY_FINGERPRINT =
  'main_meal_kcal_threshold=250|score_without_added_sugar=1|snack_isolation_minutes=90|snack_kcal_threshold=200';

export type NdsComputationIdentity = typeof NDS_COMPUTATION_IDENTITY;

export function computationIdentitySqlLiterals(): {
  nds_version: string;
  classifier_version: string;
  normalizer_version: string;
  day_policy_version: string;
} {
  return { ...NDS_COMPUTATION_IDENTITY };
}

export function identitiesMatch(
  actual: Partial<Record<keyof NdsComputationIdentity, string | null | undefined>>,
  expected: NdsComputationIdentity = NDS_COMPUTATION_IDENTITY,
): boolean {
  return (
    actual.nds_version === expected.nds_version &&
    actual.classifier_version === expected.classifier_version &&
    actual.normalizer_version === expected.normalizer_version &&
    actual.day_policy_version === expected.day_policy_version
  );
}
