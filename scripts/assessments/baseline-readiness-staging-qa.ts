#!/usr/bin/env tsx
/**
 * Baseline Readiness staging/internal QA operator (Packet U)
 *
 * Default: dry-run (read-only). Validates source JSON, plans CMS operations,
 * optionally checks forced-preview routes, emits a markdown QA report.
 *
 * Usage:
 *   npm run assessments:baseline-readiness:qa
 *   npm run assessments:baseline-readiness:qa -- --dry-run
 *   npm run assessments:baseline-readiness:qa -- --base-url=http://localhost:3000
 *
 * Admin API diagnostics (non-destructive probes — Packet U2):
 *   npm run assessments:baseline-readiness:qa -- \
 *     --diagnose-api \
 *     --base-url=https://your-staging-host \
 *     --environment=staging
 *
 * Apply (staging only — requires explicit flags + admin cookie env var):
 *   BASELINE_READINESS_QA_ADMIN_COOKIE="..." \
 *     npm run assessments:baseline-readiness:qa -- \
 *       --apply \
 *       --environment=staging \
 *       --base-url=https://your-staging-host \
 *       --confirm-staging-write
 *
 * Vercel Deployment Protection bypass (optional, do not commit):
 *   BASELINE_READINESS_QA_VERCEL_BYPASS="..."
 *
 * Publish revisions (optional, admin-only APIs):
 *   ... --publish-revisions
 *
 * Report output:
 *   --report-out=.reports/assessments/my-report.md  (optional)
 *   Default: .reports/assessments/baseline-readiness-qa-<timestamp>.md (gitignored)
 */

import { loadEnvConfig } from '@next/env';

import { BASELINE_READINESS_DEPLOYMENT_CONFIG } from '@/lib/assessments/deployment/configs/baselineReadinessDeploymentConfig';
import { runAssessmentStagingQaCli } from '@/lib/assessments/deployment/runAssessmentStagingQaCli';

async function main() {
  loadEnvConfig(process.cwd());
  await runAssessmentStagingQaCli(BASELINE_READINESS_DEPLOYMENT_CONFIG, process.argv.slice(2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
