#!/usr/bin/env tsx
/**
 * Baseline Readiness live E2E — thin wrapper over generic deployment operator (X10).
 */

import { runAssessmentLiveE2eCli } from '@/lib/assessments/deployment/runAssessmentLiveE2eCli';
import { BASELINE_READINESS_DEPLOYMENT_CONFIG } from '@/lib/assessments/deployment/configs/baselineReadinessDeploymentConfig';

runAssessmentLiveE2eCli(BASELINE_READINESS_DEPLOYMENT_CONFIG, process.argv.slice(2)).catch(
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
