/**
 * Baseline Readiness — shared constants (Packet Q)
 *
 * Internal proof assessment keyed to problem point `baseline-readiness` and
 * planned concept `planned:baseline-readiness:starter-readiness`. Provisional
 * until product/clinical scoring is finalized.
 */

/** Result level ids for the provisional total-score-to-levels adapter. */
export const BASELINE_READINESS_RESULT_LEVELS = [
  'readiness-low',
  'readiness-building',
  'readiness-ready',
] as const;

export type BaselineReadinessLevel =
  (typeof BASELINE_READINESS_RESULT_LEVELS)[number];

/**
 * Results content version for Baseline Readiness. No CMS packs are published
 * for this version yet — forced preview surfaces a safe missing-pack error.
 */
export const BASELINE_READINESS_RESULTS_CONTENT_VERSION = 'v1-internal';

/** Provisional scoring adapter id (internal proof — not final clinical logic). */
export const BASELINE_READINESS_SCORING_ADAPTER_ID =
  'baseline-readiness-total-score-v1-provisional' as const;

/** Factory scoring template id this adapter implements. */
export const BASELINE_READINESS_SCORING_TEMPLATE_ID = 'total-score-to-levels' as const;
