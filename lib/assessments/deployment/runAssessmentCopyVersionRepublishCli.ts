import * as fs from 'fs';
import * as path from 'path';

import { loadEnvConfig } from '@next/env';

import { runCopyVersionRepublish } from '@/lib/assessments/deployment/copyVersionRepublish';
import type { AssessmentDeploymentConfig } from '@/lib/assessments/deployment/types';

export function parseCopyVersionRepublishArgs(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.includes('--dry-run') };
}

export async function runAssessmentCopyVersionRepublishCli(
  config: AssessmentDeploymentConfig,
  argv: string[]
): Promise<void> {
  if (!config.copyVersionRepublish) {
    throw new Error(`Assessment "${config.slug}" has no copyVersionRepublish config`);
  }

  loadEnvConfig(process.cwd());
  const { dryRun } = parseCopyVersionRepublishArgs(argv);
  const mod = await import('@/lib/supabaseServerClient');
  const results = await runCopyVersionRepublish(config, dryRun, mod.supabaseAdmin);

  const report = {
    slug: config.slug,
    dryRun,
    timestamp: new Date().toISOString(),
    results,
  };

  const outDir = path.join(process.cwd(), '.reports/assessments');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(outDir, `${config.slug}-copyversion-republish-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport: ${reportPath}`);

  if (results.some((r) => r.status === 'fail')) {
    process.exitCode = 1;
  }
}
