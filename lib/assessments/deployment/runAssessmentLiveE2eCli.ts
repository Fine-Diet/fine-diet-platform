import * as fs from 'fs';
import * as path from 'path';

import {
  defaultLiveE2eReportPath,
  renderLiveE2eMarkdown,
  runLiveE2e,
} from '@/lib/assessments/deployment/liveE2eOperator';
import type { AssessmentDeploymentConfig } from '@/lib/assessments/deployment/types';

export function parseLiveE2eCliArgs(argv: string[]): {
  baseUrl?: string;
  reportOut?: string;
} {
  let baseUrl: string | undefined;
  let reportOut: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length);
    } else if (arg === '--base-url' && argv[i + 1]) {
      baseUrl = argv[++i];
    } else if (arg.startsWith('--report-out=')) {
      reportOut = arg.slice('--report-out='.length);
    } else if (arg === '--report-out' && argv[i + 1]) {
      reportOut = argv[++i];
    }
  }

  return { baseUrl, reportOut };
}

export async function runAssessmentLiveE2eCli(
  config: AssessmentDeploymentConfig,
  argv: string[]
): Promise<void> {
  const { baseUrl, reportOut } = parseLiveE2eCliArgs(argv);
  const resolvedBaseUrl = (baseUrl ?? config.liveE2e.defaultBaseUrl).replace(/\/$/, '');

  const report = await runLiveE2e(config, resolvedBaseUrl);
  const markdown = renderLiveE2eMarkdown(report);

  const defaultPath = path.join(
    process.cwd(),
    '.reports/assessments',
    defaultLiveE2eReportPath(config.slug, report.generatedAt)
  );
  const outPath = reportOut ?? defaultPath;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, 'utf8');

  console.log(markdown);
  console.log(`\nReport written: ${outPath}`);

  const allPass =
    report.outcomes.every((o) => o.status === 'pass') &&
    report.siblingRegression.status === 'pass';

  if (!allPass) {
    process.exitCode = 1;
  }
}
