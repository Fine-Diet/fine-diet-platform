import {
  OUTBOX_METRICS_ASSESSMENT_TYPES,
  parseOutboxMetricsAssessmentTypeFilter,
} from '@/lib/admin/metrics/outboxMetricsFilter';

describe('outboxMetricsFilter', () => {
  it('returns null when filter is omitted or blank', () => {
    expect(parseOutboxMetricsAssessmentTypeFilter(undefined)).toEqual({
      ok: true,
      assessmentType: null,
    });
    expect(parseOutboxMetricsAssessmentTypeFilter('')).toEqual({
      ok: true,
      assessmentType: null,
    });
    expect(parseOutboxMetricsAssessmentTypeFilter(['   '])).toEqual({
      ok: true,
      assessmentType: null,
    });
  });

  it('accepts known assessment types', () => {
    for (const assessmentType of OUTBOX_METRICS_ASSESSMENT_TYPES) {
      expect(parseOutboxMetricsAssessmentTypeFilter(assessmentType)).toEqual({
        ok: true,
        assessmentType,
      });
    }
  });

  it('rejects unknown assessment types', () => {
    const result = parseOutboxMetricsAssessmentTypeFilter('protein-sufficiency');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid assessment_type');
      expect(result.error).toContain('gut-check');
      expect(result.error).toContain('baseline-readiness');
    }
  });
});
