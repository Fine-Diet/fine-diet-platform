/**
 * Packet 64 — read-only planning/grocery support case export.
 *
 * This service assembles compact operator context from existing read-only admin
 * support services. It does not call compatibility stores or mutation helpers.
 */

import {
  getPlanningGroceryAnomalies,
  type PlanningGroceryAnomalySeverity,
} from './planningGroceryAnomalyService';
import {
  getPlanningGrocerySupportSnapshot,
  type PlanningGrocerySupportSnapshot,
} from './planningSupportSnapshotService';
import { getPlanningLegacyCleanupDryRun } from './planningLegacyCleanupReadinessService';
import { getPlanningStorageAudit } from './planningStorageAuditService';

export type SupportCaseSeverity = 'info' | 'warning' | 'high';
export type SupportCaseHighestSeverity = 'none' | SupportCaseSeverity;

export interface SupportCaseSection {
  key: string;
  title: string;
  severity?: SupportCaseSeverity;
  bullets: string[];
  evidence?: string[];
  related_links?: Array<{ label: string; href: string }>;
}

export interface PlanningGrocerySupportCase {
  generated_at: string;
  mode: 'support_case_export';
  person: {
    person_id: string;
    user_id: string | null;
    email: string | null;
    display_name: string | null;
    status: string | null;
  };
  summary: {
    reusable_template_count: number;
    reusable_week_pattern_count: number;
    pantry_item_count: number;
    grocery_resolution_count: number;
    active_plan_count: number;
    recent_planned_meal_count: number;
    grocery_list_count: number;
    anomaly_count: number;
    highest_anomaly_severity: SupportCaseHighestSeverity;
    legacy_cleanup_candidate_count: number;
    review_required_count: number;
  };
  storage_summary: PlanningGrocerySupportSnapshot['storage_summary'];
  anomaly_summary: {
    by_severity: Record<PlanningGroceryAnomalySeverity, number>;
    by_category: Record<string, number>;
    by_code: Record<string, number>;
    top_anomalies: Array<{
      code: string;
      severity: PlanningGroceryAnomalySeverity;
      category: string;
      title: string;
      message: string;
      related_table?: string;
      related_row_id?: string;
      evidence: string[];
    }>;
  };
  legacy_cleanup_summary: {
    cleanup_candidate_count: number;
    review_required_count: number;
    malformed_legacy_count: number;
    unmatched_legacy_count: number;
    table_conflict_count: number;
    review_reasons: Record<string, number>;
  };
  snapshot_highlights: {
    active_plan_titles: string[];
    recent_meal_states: Record<'pending' | 'eaten' | 'skipped', number>;
    grocery_lists: Array<{
      id: string;
      title: string | null;
      status: string;
      items_count: number;
      unresolved_items_count: number;
    }>;
    warnings: string[];
  };
  report_sections: SupportCaseSection[];
  links: {
    snapshot_url: string;
    storage_audit_url: string;
    legacy_cleanup_dry_run_url: string;
    anomalies_url: string;
  };
  warnings: string[];
  non_goals: string[];
  copyable_report_markdown: string;
}

export interface PlanningGrocerySupportCaseOptions {
  person_id: string;
  anomaly_limit?: number | null;
  include_details?: boolean | null;
}

const DEFAULT_ANOMALY_LIMIT = 25;
const MAX_ANOMALY_LIMIT = 100;

function normalizeAnomalyLimit(limit: number | null | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_ANOMALY_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_ANOMALY_LIMIT);
}

function severityRank(severity: SupportCaseHighestSeverity): number {
  if (severity === 'high') return 3;
  if (severity === 'warning') return 2;
  if (severity === 'info') return 1;
  return 0;
}

function highestSeverity(values: PlanningGroceryAnomalySeverity[]): SupportCaseHighestSeverity {
  return values.reduce<SupportCaseHighestSeverity>((highest, severity) => {
    return severityRank(severity) > severityRank(highest) ? severity : highest;
  }, 'none');
}

function countMealStates(
  meals: PlanningGrocerySupportSnapshot['active_planning']['recent_planned_meals'],
): Record<'pending' | 'eaten' | 'skipped', number> {
  return meals.reduce(
    (counts, meal) => {
      counts[meal.execution_state] += 1;
      return counts;
    },
    { pending: 0, eaten: 0, skipped: 0 },
  );
}

function withPersonId(path: string, personId: string): string {
  return `${path}?person_id=${encodeURIComponent(personId)}`;
}

function bullet(value: string): string {
  return value.trim();
}

function summarizeStorageBucket(
  label: string,
  bucket: PlanningGrocerySupportSnapshot['storage_summary']['reusable_day_templates'],
): string {
  return `${label}: total ${bucket.total}, table_direct ${bucket.table_direct}, legacy_metadata ${bucket.legacy_metadata}, unknown ${bucket.unknown}`;
}

function buildLinks(personId: string): PlanningGrocerySupportCase['links'] {
  return {
    snapshot_url: withPersonId('/admin/support/planning-grocery', personId),
    storage_audit_url: withPersonId('/admin/support/planning-storage-audit', personId),
    legacy_cleanup_dry_run_url: withPersonId(
      '/admin/support/planning-legacy-cleanup-dry-run',
      personId,
    ),
    anomalies_url: withPersonId('/admin/support/planning-grocery-anomalies', personId),
  };
}

function buildSections(options: {
  supportCase: Omit<PlanningGrocerySupportCase, 'report_sections' | 'copyable_report_markdown'>;
  includeDetails: boolean;
}): SupportCaseSection[] {
  const { supportCase, includeDetails } = options;
  const sections: SupportCaseSection[] = [
    {
      key: 'overview',
      title: 'Support Case Overview',
      severity:
        supportCase.summary.highest_anomaly_severity === 'none'
          ? 'info'
          : supportCase.summary.highest_anomaly_severity,
      bullets: [
        bullet(`Person: ${supportCase.person.person_id}`),
        bullet(`Email: ${supportCase.person.email ?? 'unknown'}`),
        bullet(`Planning state: ${supportCase.summary.active_plan_count} plans, ${supportCase.summary.recent_planned_meal_count} recent planned meals, ${supportCase.summary.grocery_list_count} grocery lists.`),
        bullet(`Reusable/grocery state: ${supportCase.summary.reusable_template_count} day templates, ${supportCase.summary.reusable_week_pattern_count} week patterns, ${supportCase.summary.pantry_item_count} pantry items, ${supportCase.summary.grocery_resolution_count} ingredient resolutions.`),
      ],
      related_links: [
        { label: 'Planning/Grocery Snapshot', href: supportCase.links.snapshot_url },
      ],
    },
    {
      key: 'storage',
      title: 'Storage Provenance Summary',
      severity:
        Object.values(supportCase.storage_summary).some((bucket) => bucket.unknown > 0)
          ? 'warning'
          : 'info',
      bullets: [
        summarizeStorageBucket('Reusable day templates', supportCase.storage_summary.reusable_day_templates),
        summarizeStorageBucket('Reusable week patterns', supportCase.storage_summary.reusable_week_patterns),
        summarizeStorageBucket('Pantry/on-hand items', supportCase.storage_summary.pantry_on_hand_items),
        summarizeStorageBucket('Grocery ingredient resolutions', supportCase.storage_summary.grocery_ingredient_resolutions),
      ],
      related_links: [{ label: 'Planning Storage Audit', href: supportCase.links.storage_audit_url }],
    },
    {
      key: 'legacy_cleanup_readiness',
      title: 'Legacy Cleanup Readiness',
      severity:
        supportCase.summary.review_required_count > 0 ||
        supportCase.legacy_cleanup_summary.table_conflict_count > 0
          ? 'warning'
          : 'info',
      bullets: [
        bullet(`Cleanup candidates: ${supportCase.legacy_cleanup_summary.cleanup_candidate_count}`),
        bullet(`Review required: ${supportCase.legacy_cleanup_summary.review_required_count}`),
        bullet(`Malformed legacy: ${supportCase.legacy_cleanup_summary.malformed_legacy_count}`),
        bullet(`Unmatched legacy: ${supportCase.legacy_cleanup_summary.unmatched_legacy_count}`),
        bullet(`Table conflicts: ${supportCase.legacy_cleanup_summary.table_conflict_count}`),
      ],
      evidence: Object.entries(supportCase.legacy_cleanup_summary.review_reasons).map(
        ([reason, count]) => `${reason}: ${count}`,
      ),
      related_links: [
        { label: 'Legacy Cleanup Dry-Run', href: supportCase.links.legacy_cleanup_dry_run_url },
      ],
    },
    {
      key: 'anomalies',
      title: 'Anomaly Summary',
      severity:
        supportCase.summary.highest_anomaly_severity === 'none'
          ? 'info'
          : supportCase.summary.highest_anomaly_severity,
      bullets: [
        bullet(`Anomalies shown: ${supportCase.summary.anomaly_count}`),
        bullet(`Highest severity: ${supportCase.summary.highest_anomaly_severity}`),
        bullet(`By severity: high ${supportCase.anomaly_summary.by_severity.high}, warning ${supportCase.anomaly_summary.by_severity.warning}, info ${supportCase.anomaly_summary.by_severity.info}`),
      ],
      evidence: Object.entries(supportCase.anomaly_summary.by_code).map(
        ([code, count]) => `${code}: ${count}`,
      ),
      related_links: [{ label: 'Planning/Grocery Anomalies', href: supportCase.links.anomalies_url }],
    },
  ];

  if (includeDetails) {
    sections.push({
      key: 'snapshot_highlights',
      title: 'Snapshot Highlights',
      severity: supportCase.snapshot_highlights.warnings.length > 0 ? 'warning' : 'info',
      bullets: [
        bullet(
          `Recent meal states: pending ${supportCase.snapshot_highlights.recent_meal_states.pending}, eaten ${supportCase.snapshot_highlights.recent_meal_states.eaten}, skipped ${supportCase.snapshot_highlights.recent_meal_states.skipped}`,
        ),
        bullet(
          `Active plan titles: ${
            supportCase.snapshot_highlights.active_plan_titles.length > 0
              ? supportCase.snapshot_highlights.active_plan_titles.join(', ')
              : 'none'
          }`,
        ),
        bullet(
          `Grocery lists: ${supportCase.snapshot_highlights.grocery_lists
            .map(
              (list) =>
                `${list.title ?? list.id} (${list.items_count} items, ${list.unresolved_items_count} unresolved)`,
            )
            .join('; ') || 'none'}`,
        ),
      ],
      evidence: supportCase.snapshot_highlights.warnings,
      related_links: [
        { label: 'Planning/Grocery Snapshot', href: supportCase.links.snapshot_url },
      ],
    });
  }

  return sections;
}

export function renderPlanningGrocerySupportCaseMarkdown(
  supportCase: Omit<PlanningGrocerySupportCase, 'copyable_report_markdown'>,
): string {
  const lines: string[] = [
    `# Planning/Grocery Support Case`,
    '',
    `Generated: ${supportCase.generated_at}`,
    `Person: ${supportCase.person.person_id}`,
    `Email: ${supportCase.person.email ?? 'unknown'}`,
    `Name: ${supportCase.person.display_name ?? 'unknown'}`,
    '',
    `## Summary`,
    `- Plans: ${supportCase.summary.active_plan_count}`,
    `- Recent planned meals: ${supportCase.summary.recent_planned_meal_count}`,
    `- Grocery lists: ${supportCase.summary.grocery_list_count}`,
    `- Pantry items: ${supportCase.summary.pantry_item_count}`,
    `- Grocery resolutions: ${supportCase.summary.grocery_resolution_count}`,
    `- Anomalies: ${supportCase.summary.anomaly_count} (highest: ${supportCase.summary.highest_anomaly_severity})`,
    `- Legacy cleanup candidates: ${supportCase.summary.legacy_cleanup_candidate_count}`,
    `- Legacy review required: ${supportCase.summary.review_required_count}`,
    '',
  ];

  for (const section of supportCase.report_sections) {
    lines.push(`## ${section.title}`);
    if (section.severity) lines.push(`Severity: ${section.severity}`);
    for (const item of section.bullets) {
      lines.push(`- ${item}`);
    }
    if (section.evidence && section.evidence.length > 0) {
      lines.push('Evidence:');
      for (const item of section.evidence.slice(0, 10)) {
        lines.push(`- ${item}`);
      }
    }
    if (section.related_links && section.related_links.length > 0) {
      lines.push('Links:');
      for (const link of section.related_links) {
        lines.push(`- ${link.label}: ${link.href}`);
      }
    }
    lines.push('');
  }

  lines.push('## Non-goals');
  for (const item of supportCase.non_goals) {
    lines.push(`- ${item}`);
  }

  return lines.join('\n');
}

export async function getPlanningGrocerySupportCase(
  options: PlanningGrocerySupportCaseOptions,
): Promise<PlanningGrocerySupportCase> {
  const personId = options.person_id.trim();
  if (!personId) {
    throw new Error('person_id is required.');
  }

  const anomalyLimit = normalizeAnomalyLimit(options.anomaly_limit);
  const includeDetails = options.include_details !== false;

  const [snapshot, storageAudit, legacyDryRun, anomalyReport] = await Promise.all([
    getPlanningGrocerySupportSnapshot(personId),
    getPlanningStorageAudit({ person_id: personId, limit: 50 }),
    getPlanningLegacyCleanupDryRun({ person_id: personId, limit: 100 }),
    getPlanningGroceryAnomalies({ person_id: personId, limit: anomalyLimit }),
  ]);

  const links = buildLinks(personId);
  const anomalySeverities = anomalyReport.anomalies.map((anomaly) => anomaly.severity);
  const topAnomalies = anomalyReport.anomalies.slice(0, anomalyLimit).map((anomaly) => ({
    code: anomaly.code,
    severity: anomaly.severity,
    category: anomaly.category,
    title: anomaly.title,
    message: anomaly.message,
    related_table: anomaly.related_table,
    related_row_id: anomaly.related_row_id,
    evidence: anomaly.evidence.slice(0, 5),
  }));

  const baseSupportCase: Omit<
    PlanningGrocerySupportCase,
    'report_sections' | 'copyable_report_markdown'
  > = {
    generated_at: new Date().toISOString(),
    mode: 'support_case_export',
    person: {
      person_id: snapshot.person.id,
      user_id: snapshot.person.auth_user_id,
      email: snapshot.person.email,
      display_name: snapshot.person.name,
      status: snapshot.person.status,
    },
    summary: {
      reusable_template_count: snapshot.reusable_planning.day_templates.length,
      reusable_week_pattern_count: snapshot.reusable_planning.week_patterns.length,
      pantry_item_count: snapshot.grocery_state.pantry_on_hand_items.length,
      grocery_resolution_count: snapshot.grocery_state.ingredient_resolutions.length,
      active_plan_count: snapshot.active_planning.plans.length,
      recent_planned_meal_count: snapshot.active_planning.recent_planned_meals.length,
      grocery_list_count: snapshot.grocery_lists.length,
      anomaly_count: anomalyReport.summary.anomaly_count,
      highest_anomaly_severity: highestSeverity(anomalySeverities),
      legacy_cleanup_candidate_count: legacyDryRun.summary.cleanup_candidate_count,
      review_required_count:
        legacyDryRun.summary.review_required_count +
        legacyDryRun.summary.malformed_legacy_count +
        legacyDryRun.summary.unmatched_legacy_count +
        legacyDryRun.summary.table_conflict_count,
    },
    storage_summary: snapshot.storage_summary,
    anomaly_summary: {
      by_severity: anomalyReport.summary.by_severity,
      by_category: anomalyReport.summary.by_category,
      by_code: anomalyReport.summary.by_code,
      top_anomalies: topAnomalies,
    },
    legacy_cleanup_summary: {
      cleanup_candidate_count: legacyDryRun.summary.cleanup_candidate_count,
      review_required_count: legacyDryRun.summary.review_required_count,
      malformed_legacy_count: legacyDryRun.summary.malformed_legacy_count,
      unmatched_legacy_count: legacyDryRun.summary.unmatched_legacy_count,
      table_conflict_count: legacyDryRun.summary.table_conflict_count,
      review_reasons: legacyDryRun.review_reasons,
    },
    snapshot_highlights: {
      active_plan_titles: snapshot.active_planning.plans
        .slice(0, 5)
        .map((plan) => plan.title ?? plan.id),
      recent_meal_states: countMealStates(snapshot.active_planning.recent_planned_meals),
      grocery_lists: snapshot.grocery_lists.slice(0, 5).map((list) => ({
        id: list.id,
        title: list.title,
        status: list.status,
        items_count: list.items_count,
        unresolved_items_count: list.unresolved_items_count,
      })),
      warnings: [
        ...snapshot.warnings,
        ...storageAudit.anomalies.map((anomaly) => anomaly.message),
      ],
    },
    links,
    warnings: [
      ...snapshot.warnings,
      ...anomalyReport.summary.notes,
      ...legacyDryRun.summary.notes,
    ],
    non_goals: [
      'This export is internal operator context only.',
      'This export does not mutate, repair, delete, clean up, backfill, or regenerate data.',
      'This export summarizes existing read-only support views and links to detailed admin pages.',
      'This export is not customer-facing.',
    ],
  };

  const reportSections = buildSections({
    supportCase: baseSupportCase,
    includeDetails,
  });
  const supportCaseWithoutMarkdown = {
    ...baseSupportCase,
    report_sections: reportSections,
  };

  return {
    ...supportCaseWithoutMarkdown,
    copyable_report_markdown: renderPlanningGrocerySupportCaseMarkdown(
      supportCaseWithoutMarkdown,
    ),
  };
}
