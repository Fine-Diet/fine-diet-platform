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
 *   BASELINE_READINESS_QA_VERCEL_BYPASS="..." \
 *
 * Publish revisions (optional, admin-only APIs):
 *   ... --publish-revisions
 *
 * Report output:
 *   --report-out=.reports/assessments/my-report.md  (optional)
 *   Default: .reports/assessments/baseline-readiness-qa-<timestamp>.md (gitignored)
 */

import { loadEnvConfig } from '@next/env';
import {
  parseCliArgs,
  runBaselineReadinessStagingQa,
  renderQaReportMarkdown,
  renderAdminApiDiagnosticsMarkdown,
  writeQaReport,
} from '@/lib/assessments/baselineReadiness/stagingQaOperator';

async function main() {
  loadEnvConfig(process.cwd());

  const options = parseCliArgs(process.argv);
  const report = await runBaselineReadinessStagingQa(options);
  const markdown = renderQaReportMarkdown(report);

  console.log('=== Baseline Readiness Staging QA Operator ===');
  console.log(`Mode: ${report.mode}${options.diagnoseApi ? ' (+ --diagnose-api)' : ''}`);
  console.log(`Environment: ${report.environment}`);
  console.log(`Base URL: ${report.baseUrl ?? '(not set)'}`);
  console.log(`Source validation: ${report.sourceValidation.ok ? 'PASS' : 'FAIL'}`);
  console.log(`Recommendation: ${report.goNoGo}`);
  console.log('');

  if (report.apiDiagnostics.length > 0) {
    console.log(renderAdminApiDiagnosticsMarkdown(report.apiDiagnostics));
    console.log('');
  }

  if (report.blockers.length > 0) {
    console.log('Blockers:');
    for (const blocker of report.blockers) {
      console.log(`  - ${blocker}`);
    }
    console.log('');
  }

  console.log(`Planned CMS operations: ${report.plannedCmsOperations.length}`);
  for (const op of report.plannedCmsOperations.slice(0, 5)) {
    console.log(`  - [${op.kind}] ${op.description}`);
  }
  if (report.plannedCmsOperations.length > 5) {
    console.log(`  ... and ${report.plannedCmsOperations.length - 5} more`);
  }
  console.log('');

  if (report.forcedPreviewChecks.length > 0) {
    console.log('Forced-preview checks:');
    for (const check of report.forcedPreviewChecks) {
      console.log(`  - ${check.forceOutcome}: ${check.status}`);
    }
    console.log('');
  }

  const outPath = writeQaReport(report, options.reportOut);
  console.log(`Report written: ${outPath}`);
  console.log('');
  console.log('--- Report preview ---');
  console.log(markdown);

  const exitCode = report.goNoGo === 'NO-GO' ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
