/**
 * Baseline Readiness — internal fixture question set (Packet Q)
 *
 * A minimal, code-owned AssessmentConfig used ONLY by the admin-gated internal
 * start route (`/admin/assessments/baseline-readiness/start`). This is NOT a
 * public file fallback and is NOT registered with `hasFileFallback: true`.
 *
 * Production launch still requires a CMS-published question set. This fixture
 * proves the scoring adapter + outcome mapper + runtime dispatch path without
 * blocking on CMS content.
 */

import type { AssessmentConfig } from '@/lib/assessmentTypes';
import { BASELINE_READINESS_RESULT_LEVELS } from '@/lib/assessments/baselineReadiness/constants';

/** Internal fixture version — matches registry `defaultVersion`. */
export const BASELINE_READINESS_INTERNAL_FIXTURE_VERSION = 1;

/**
 * Minimal 5-question readiness audit (0–3 per question). Avatars match the
 * provisional total-score-to-levels adapter output ids.
 */
export function getBaselineReadinessInternalFixtureConfig(): AssessmentConfig {
  const questions = Array.from({ length: 5 }, (_, i) => {
    const qId = `br-q${i + 1}`;
    return {
      id: qId,
      text: `[Internal fixture] Readiness question ${i + 1}`,
      options: [0, 1, 2, 3].map((v) => ({
        id: `${qId}-opt-${v}`,
        label: `option ${v}`,
        value: v,
      })),
    };
  });

  return {
    assessmentType: 'baseline-readiness',
    assessmentVersion: BASELINE_READINESS_INTERNAL_FIXTURE_VERSION,
    questions,
    avatars: [...BASELINE_READINESS_RESULT_LEVELS],
    scoring: {
      thresholds: {
        secondaryAvatarThreshold: 0.15,
        confidenceThresholds: { high: 0.25, medium: 0.1 },
      },
    },
  };
}
