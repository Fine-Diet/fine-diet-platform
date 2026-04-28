/**
 * Read-only operator helper for Packet 64.
 *
 * Usage:
 *   npx tsx scripts/support/exportPlanningGrocerySupportCase.ts <person_id>
 *
 * Or:
 *   PERSON_ID=<person_id> npx tsx scripts/support/exportPlanningGrocerySupportCase.ts
 */

import { loadEnvConfig } from '@next/env';

async function main() {
  loadEnvConfig(process.cwd());
  const { getPlanningGrocerySupportCase } = await import(
    '@/lib/admin/planningGrocerySupportCaseService'
  );

  const personId = process.argv[2] || process.env.PERSON_ID || '';
  if (!personId.trim()) {
    throw new Error('person_id is required. Pass it as an argument or PERSON_ID.');
  }

  const supportCase = await getPlanningGrocerySupportCase({
    person_id: personId,
    anomaly_limit: 25,
    include_details: true,
  });

  console.log(supportCase.copyable_report_markdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
