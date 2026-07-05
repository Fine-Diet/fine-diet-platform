/**
 * Legacy client-side config fallback for the assessment runner.
 *
 * The runner receives a server-resolved config for every registered assessment,
 * so the client-side fallback is a safety net only. It exists purely to
 * preserve historical Gut Check v1 behavior where the bundled `gutCheckConfig`
 * was used if the server did not supply a config. That assumption is Gut
 * Check-specific, so it is isolated here behind a named helper instead of
 * living inline in the generic `AssessmentRunner`.
 *
 * Returns the bundled Gut Check v1 config only for `gut-check` v1; `null` for
 * every other assessment type / version (the runner then stays on LoadingState,
 * matching prior behavior for unknown types).
 */

import type { AssessmentConfig, AssessmentType } from '@/lib/assessmentTypes';
import { gutCheckConfig } from '@/lib/assessmentConfig';

export function getLegacyClientFallbackConfig(
  assessmentType: AssessmentType,
  version: number
): AssessmentConfig | null {
  if (assessmentType === 'gut-check' && version === 1) {
    return gutCheckConfig;
  }
  return null;
}
