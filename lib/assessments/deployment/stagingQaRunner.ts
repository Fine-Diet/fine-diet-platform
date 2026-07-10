/**
 * Generic staging QA runner dispatch (Packet X11).
 */

import {
  runBaselineReadinessStagingQa,
  type QaOperatorOptions,
  type QaReport,
} from '@/lib/assessments/baselineReadiness/stagingQaOperator';
import type { AssessmentDeploymentConfig } from '@/lib/assessments/deployment/types';

export async function runAssessmentStagingQa(
  config: AssessmentDeploymentConfig,
  options: QaOperatorOptions
): Promise<QaReport> {
  switch (config.slug) {
    case 'baseline-readiness':
      return runBaselineReadinessStagingQa(options);
    default:
      throw new Error(
        `Staging QA operator not implemented for slug "${config.slug}". Registered runners: baseline-readiness.`
      );
  }
}
