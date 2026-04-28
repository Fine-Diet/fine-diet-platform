/**
 * Read-only operator helper for Packet 63.
 *
 * Usage:
 *   npx tsx scripts/support/reportPlanningGroceryAnomalies.ts [person_id]
 */

import { loadEnvConfig } from '@next/env';

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'none';
  return entries.map(([key, count]) => `${key}=${count}`).join(', ');
}

async function main() {
  loadEnvConfig(process.cwd());
  const { getPlanningGroceryAnomalies } = await import(
    '@/lib/admin/planningGroceryAnomalyService'
  );
  const personId = process.argv[2] || null;
  const report = await getPlanningGroceryAnomalies({ person_id: personId, limit: 100 });

  console.log(`Planning/grocery anomaly report generated at ${report.generated_at}`);
  if (report.filters_applied.person_id) {
    console.log(`Filter person_id: ${report.filters_applied.person_id}`);
  }
  console.log('');
  console.log(`Total anomalies shown: ${report.summary.anomaly_count}`);
  console.log(`Persons with shown anomalies: ${report.summary.person_count}`);
  console.log(`By severity: ${formatCounts(report.summary.by_severity)}`);
  console.log(`By category: ${formatCounts(report.summary.by_category)}`);
  console.log(`By code: ${formatCounts(report.summary.by_code)}`);
  console.log('');
  console.log('Top persons');
  for (const person of report.persons.slice(0, 10)) {
    console.log(
      `- ${person.person_id}: total=${person.anomaly_count}, highest=${person.highest_severity}, severity=${formatCounts(person.by_severity)}`,
    );
  }
  if (report.persons.length === 0) {
    console.log('- none');
  }
  console.log('');
  for (const note of report.summary.notes) {
    console.log(`- ${note}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
