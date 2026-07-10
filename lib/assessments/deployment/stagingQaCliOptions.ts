import * as path from 'path';

import { resolveStagingQaSecrets } from '@/lib/assessments/deployment/adminApiDiagnostics';
import type { AssessmentDeploymentConfig } from '@/lib/assessments/deployment/types';
import type {
  QaOperatorMode,
  QaOperatorOptions,
} from '@/lib/assessments/baselineReadiness/stagingQaOperator';

export function parseSlugFromArgv(argv: string[]): string {
  for (const arg of argv) {
    if (arg.startsWith('--slug=')) {
      return arg.slice('--slug='.length).trim();
    }
    if (arg === '--slug') {
      const idx = argv.indexOf(arg);
      const next = argv[idx + 1];
      if (next) return next.trim();
    }
  }
  throw new Error('Missing required --slug=<assessment-slug>');
}

export function parseStagingQaCliArgs(argv: string[]): Omit<
  QaOperatorOptions,
  'adminSessionCookie' | 'vercelProtectionBypass'
> {
  const hasApply = argv.includes('--apply');
  const mode: QaOperatorMode = hasApply ? 'apply' : 'dry-run';

  let environment: string | undefined;
  let baseUrl: string | undefined;
  let reportOut: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith('--environment=')) {
      environment = arg.slice('--environment='.length).trim();
    } else if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length).trim();
    } else if (arg.startsWith('--report-out=')) {
      reportOut = arg.slice('--report-out='.length).trim();
    }
  }

  return {
    mode,
    environment,
    baseUrl,
    confirmStagingWrite: argv.includes('--confirm-staging-write'),
    publishRevisions: argv.includes('--publish-revisions'),
    reportOut,
    skipForcedPreview: argv.includes('--skip-forced-preview'),
    skipPublicSafety: argv.includes('--skip-public-safety'),
    diagnoseApi: argv.includes('--diagnose-api'),
  };
}

export function buildStagingQaOptions(
  config: AssessmentDeploymentConfig,
  argv: string[]
): QaOperatorOptions {
  const secrets = resolveStagingQaSecrets(config);
  const filteredArgv = argv.filter(
    (a, i, arr) =>
      !a.startsWith('--slug=') &&
      a !== '--slug' &&
      !(arr[i - 1] === '--slug' && !a.startsWith('--'))
  );

  return {
    ...parseStagingQaCliArgs(filteredArgv),
    adminSessionCookie: secrets.adminSessionCookie,
    vercelProtectionBypass: secrets.vercelProtectionBypass,
  };
}

export function defaultStagingQaReportPath(
  config: AssessmentDeploymentConfig
): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(
    process.cwd(),
    '.reports',
    'assessments',
    `${config.stagingQa.reportFilenamePrefix}-${stamp}.md`
  );
}
