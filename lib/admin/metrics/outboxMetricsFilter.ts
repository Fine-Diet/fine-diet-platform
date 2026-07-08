/**
 * Optional assessment_type filter for admin outbox delivery metrics (Packet X4c).
 */

export const OUTBOX_METRICS_ASSESSMENT_TYPES = ['gut-check', 'baseline-readiness'] as const;

export type OutboxMetricsAssessmentType =
  (typeof OUTBOX_METRICS_ASSESSMENT_TYPES)[number];

export function parseOutboxMetricsAssessmentTypeFilter(
  value: string | string[] | undefined
): { ok: true; assessmentType: OutboxMetricsAssessmentType | null } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, assessmentType: null };
  }

  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = raw?.trim();
  if (!normalized) {
    return { ok: true, assessmentType: null };
  }

  if (
    !(OUTBOX_METRICS_ASSESSMENT_TYPES as readonly string[]).includes(normalized)
  ) {
    return {
      ok: false,
      error: `Invalid assessment_type. Allowed: ${OUTBOX_METRICS_ASSESSMENT_TYPES.join(', ')}`,
    };
  }

  return { ok: true, assessmentType: normalized as OutboxMetricsAssessmentType };
}
