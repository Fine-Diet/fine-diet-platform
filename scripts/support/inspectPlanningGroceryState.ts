/**
 * Read-only operator helper for Packet 59.
 *
 * Usage:
 *   npx tsx scripts/support/inspectPlanningGroceryState.ts <person_id>
 */

import { loadEnvConfig } from '@next/env';

async function main() {
  loadEnvConfig(process.cwd());
  const { getPlanningGrocerySupportSnapshot } = await import(
    '@/lib/admin/planningSupportSnapshotService'
  );

  const personId = process.argv[2];
  if (!personId) {
    console.error('Usage: npx tsx scripts/support/inspectPlanningGroceryState.ts <person_id>');
    process.exit(1);
  }

  const snapshot = await getPlanningGrocerySupportSnapshot(personId);
  console.log(JSON.stringify(snapshot, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
