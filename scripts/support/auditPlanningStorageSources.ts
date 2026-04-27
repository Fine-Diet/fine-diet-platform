/**
 * Read-only operator helper for Packet 61.
 *
 * Usage:
 *   npx tsx scripts/support/auditPlanningStorageSources.ts [person_id]
 */

import { loadEnvConfig } from '@next/env';

async function main() {
  loadEnvConfig(process.cwd());
  const { getPlanningStorageAudit } = await import('@/lib/admin/planningStorageAuditService');
  const personId = process.argv[2] || null;
  const audit = await getPlanningStorageAudit({ person_id: personId, limit: 50 });

  console.log(`Planning storage audit generated at ${audit.generated_at}`);
  if (audit.filters.person_id) {
    console.log(`Filter person_id: ${audit.filters.person_id}`);
  }
  console.log('');
  console.log('Tables');
  for (const table of Object.values(audit.tables)) {
    console.log(
      `- ${table.table}: total=${table.total_rows}, table_direct=${table.storage_sources.table_direct}, legacy_metadata=${table.storage_sources.legacy_metadata}, unknown=${table.storage_sources.unknown}, persons=${table.distinct_person_count}`,
    );
  }
  console.log('');
  console.log(
    `Persons: ${audit.persons.length} shown, legacy-backed persons=${audit.cleanup_readiness.legacy_backfilled_person_count}, table-direct persons=${audit.cleanup_readiness.table_direct_person_count}, unknown rows=${audit.cleanup_readiness.unknown_storage_source_count}`,
  );
  console.log(`Anomalies shown: ${audit.anomalies.length}`);
  for (const note of audit.cleanup_readiness.notes) {
    console.log(`- ${note}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
