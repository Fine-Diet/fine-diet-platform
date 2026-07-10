#!/usr/bin/env tsx
/**
 * Generic assessment staging QA operator (Packet X11).
 *
 * Usage:
 *   npm run assessments:staging-qa -- --slug=baseline-readiness --dry-run
 *   npm run assessments:staging-qa -- --slug=baseline-readiness --diagnose-api --base-url=https://your-staging-host
 */

import { loadEnvConfig } from '@next/env';

import { requireDeploymentConfig } from '@/lib/assessments/deployment/configRegistry';
import {
  parseSlugFromArgv,
  runAssessmentStagingQaCli,
} from '@/lib/assessments/deployment/runAssessmentStagingQaCli';

async function main() {
  loadEnvConfig(process.cwd());

  const argv = process.argv.slice(2);
  const slug = parseSlugFromArgv(argv);
  const config = requireDeploymentConfig(slug);
  await runAssessmentStagingQaCli(config, argv);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
