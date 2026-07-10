import {
  renderAdminApiDiagnosticsMarkdown,
} from '@/lib/assessments/deployment/adminApiDiagnostics';
import { runAssessmentStagingQa } from '@/lib/assessments/deployment/stagingQaRunner';
import {
  buildStagingQaOptions,
} from '@/lib/assessments/deployment/stagingQaCliOptions';
import type { AssessmentDeploymentConfig } from '@/lib/assessments/deployment/types';
import {
  renderQaReportMarkdown,
  writeQaReport,
} from '@/lib/assessments/baselineReadiness/stagingQaOperator';

export { parseSlugFromArgv, buildStagingQaOptions } from '@/lib/assessments/deployment/stagingQaCliOptions';

export async function runAssessmentStagingQaCli(
  config: AssessmentDeploymentConfig,
  argv: string[]
): Promise<void> {
  const options = buildStagingQaOptions(config, argv);
  const report = await runAssessmentStagingQa(config, options);
  const markdown = renderQaReportMarkdown(report);

  console.log(`=== ${config.displayTitle} Staging QA Operator ===`);
  console.log(`Slug: ${config.slug}`);
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

  const outPath = writeQaReport(
    report,
    options.reportOut,
    config.stagingQa.reportFilenamePrefix
  );
  console.log(`Report written: ${outPath}`);
  console.log('');
  console.log('--- Report preview ---');
  console.log(markdown);

  const exitCode = report.goNoGo === 'NO-GO' ? 1 : 0;
  process.exit(exitCode);
}
