#!/usr/bin/env tsx
/**
 * Generic assessment copyVersion republish (Packet X10).
 *
 * Usage:
 *   npm run assessments:copyversion-republish -- --slug=baseline-readiness --dry-run
 */

import { requireDeploymentConfig } from '@/lib/assessments/deployment/configRegistry';
import { runAssessmentCopyVersionRepublishCli } from '@/lib/assessments/deployment/runAssessmentCopyVersionRepublishCli';

function parseSlug(argv: string[]): string {
  for (const arg of argv) {
    if (arg.startsWith('--slug=')) return arg.slice('--slug='.length).trim();
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
  await runAssessmentCopyVersionRepublishCli(config, filteredArgv);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
