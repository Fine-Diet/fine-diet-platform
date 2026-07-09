#!/usr/bin/env tsx
/**
 * Generic assessment live E2E verifier (Packet X10).
 *
 * Usage:
 *   npm run assessments:live-e2e -- --slug=baseline-readiness
 *   npm run assessments:live-e2e -- --slug=baseline-readiness --base-url=https://myfinediet.com
 */

import { requireDeploymentConfig } from '@/lib/assessments/deployment/configRegistry';
import { runAssessmentLiveE2eCli } from '@/lib/assessments/deployment/runAssessmentLiveE2eCli';

function parseSlug(argv: string[]): string {
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

async function main() {
  const argv = process.argv.slice(2);
  const slug = parseSlug(argv);
  const config = requireDeploymentConfig(slug);
  const filteredArgv = argv.filter(
    (a, i, arr) =>
      !a.startsWith('--slug=') &&
      a !== '--slug' &&
      !(arr[i - 1] === '--slug' && !a.startsWith('--'))
  );
  await runAssessmentLiveE2eCli(config, filteredArgv);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
