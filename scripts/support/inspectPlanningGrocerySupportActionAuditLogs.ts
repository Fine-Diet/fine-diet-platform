/**
 * Read-only operator helper for Packet 66.
 *
 * Usage:
 *   npx tsx scripts/support/inspectPlanningGrocerySupportActionAuditLogs.ts [target_person_id]
 */

import { loadEnvConfig } from '@next/env';

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'none';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

async function main() {
  loadEnvConfig(process.cwd());
  const { getPlanningGrocerySupportActionAuditLogs } = await import(
    '@/lib/admin/planningGrocerySupportActionAuditLogService'
  );

  const targetPersonId = process.argv[2] || null;
  const report = await getPlanningGrocerySupportActionAuditLogs({
    target_person_id: targetPersonId,
    limit: 50,
  });

  console.log(`Planning/grocery support action audit-log report generated at ${report.generated_at}`);
  if (report.filters_applied.target_person_id) {
    console.log(`Filter target_person_id: ${report.filters_applied.target_person_id}`);
  }
  console.log(`Rows returned: ${report.summary.total_returned}`);
  console.log(`By result: ${formatCounts(report.summary.by_result)}`);
  console.log(`By risk: ${formatCounts(report.summary.by_risk_level)}`);
  console.log(`By category: ${formatCounts(report.summary.by_action_category)}`);
  console.log(`Latest created_at: ${report.summary.latest_created_at ?? 'none'}`);
  for (const warning of report.warnings) {
    console.log(`Warning: ${warning}`);
  }
  console.log('');
  console.log('Read-only note: this script does not insert audit logs or execute support actions.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
