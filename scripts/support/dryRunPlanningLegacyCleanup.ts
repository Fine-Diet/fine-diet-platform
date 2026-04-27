/**
 * Read-only operator helper for Packet 62.
 *
 * Usage:
 *   npx tsx scripts/support/dryRunPlanningLegacyCleanup.ts [person_id]
 */

import { loadEnvConfig } from '@next/env';

async function main() {
  loadEnvConfig(process.cwd());
  const { getPlanningLegacyCleanupDryRun } = await import(
    '@/lib/admin/planningLegacyCleanupReadinessService'
  );
  const personId = process.argv[2] || null;
  const dryRun = await getPlanningLegacyCleanupDryRun({ person_id: personId, limit: 50 });

  console.log(`Planning legacy cleanup dry-run generated at ${dryRun.generated_at}`);
  console.log('Mode: dry_run (no mutation)');
  if (dryRun.filters.person_id) {
    console.log(`Filter person_id: ${dryRun.filters.person_id}`);
  }
  console.log('');
  console.log('Summary');
  console.log(`- persons with legacy metadata: ${dryRun.summary.person_count_with_legacy_metadata}`);
  console.log(`- legacy records: ${dryRun.summary.legacy_record_count}`);
  console.log(`- cleanup candidates: ${dryRun.summary.cleanup_candidate_count}`);
  console.log(`- review required: ${dryRun.summary.review_required_count}`);
  console.log(`- malformed legacy: ${dryRun.summary.malformed_legacy_count}`);
  console.log(`- unmatched legacy: ${dryRun.summary.unmatched_legacy_count}`);
  console.log(`- table conflicts: ${dryRun.summary.table_conflict_count}`);
  console.log('');
  console.log('Review reasons');
  const reasons = Object.entries(dryRun.review_reasons).slice(0, 10);
  if (reasons.length === 0) {
    console.log('- none');
  } else {
    for (const [reason, count] of reasons) {
      console.log(`- ${reason}: ${count}`);
    }
  }
  console.log('');
  for (const note of dryRun.summary.notes) {
    console.log(`- ${note}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
