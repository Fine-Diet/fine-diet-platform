#!/usr/bin/env tsx
/**
 * Baseline Readiness copyVersion republish — thin wrapper (X10).
 */

import { runAssessmentCopyVersionRepublishCli } from '@/lib/assessments/deployment/runAssessmentCopyVersionRepublishCli';
import { BASELINE_READINESS_DEPLOYMENT_CONFIG } from '@/lib/assessments/deployment/configs/baselineReadinessDeploymentConfig';

runAssessmentCopyVersionRepublishCli(
  BASELINE_READINESS_DEPLOYMENT_CONFIG,
  process.argv.slice(2)
).catch((err) => {
  console.error(err);
  process.exit(1);
});
