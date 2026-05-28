import { evaluateBaselineRecommendation } from '../baselineRecommendationEngine';
import type {
  JsonObject,
  ProgramCheckinResponse,
  ProgramEnrollment,
} from '../runtimeTypes';

function enrollment(): ProgramEnrollment {
  return {
    id: 'enrollment-1',
    person_id: 'person-1',
    program_id: 'program-1',
    program_slug: 'baseline',
    program_version_id: 'version-1',
    source_type: 'entitlement',
    source_ref: null,
    entitlement_key: 'program:baseline',
    assignment_id: null,
    purchase_date: null,
    selected_start_date: '2026-05-01',
    started_at: null,
    completed_at: null,
    status: 'active',
    timezone: 'UTC',
    current_capacity: 'steady',
    paused_days_total: 0,
    pause_until: null,
    input_snapshot_json: {},
    computed_metrics_snapshot_json: {},
    metadata: {},
    created_by_user_id: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
  };
}

function response(
  checkinDay: number,
  payload: JsonObject,
  status: ProgramCheckinResponse['response_status'] = 'completed',
): ProgramCheckinResponse {
  return {
    id: `response-${checkinDay}`,
    enrollment_id: 'enrollment-1',
    checkin_template_id: `template-${checkinDay}`,
    checkin_day: checkinDay,
    response_status: status,
    response_payload_json: status === 'completed' ? payload : {},
    skipped_reason: status === 'skipped' ? 'Skipped from test.' : null,
    responded_at: status === 'completed' ? '2026-05-21T00:00:00.000Z' : null,
    skipped_at: status === 'skipped' ? '2026-05-21T00:00:00.000Z' : null,
    input_snapshot_json: {},
    computed_metrics_snapshot_json: {},
    metadata: {},
    created_at: '2026-05-21T00:00:00.000Z',
    updated_at: '2026-05-21T00:00:00.000Z',
  };
}

const stablePayload = {
  digestion_score: 4,
  digestion_modifier: 'same',
  bm_frequency: 'daily',
  meals_per_day: '3',
  protein_consistency: 'steady',
  hunger_pattern: 'steady',
  energy_score: 4,
  sleep_score: 4,
  gi_red_flags: [],
};

describe('evaluateBaselineRecommendation', () => {
  test('routes GI red flags to PERSONALIZED_CARE', () => {
    const out = evaluateBaselineRecommendation({
      enrollment: enrollment(),
      checkinResponses: [
        response(7, stablePayload),
        response(14, { ...stablePayload, gi_red_flags: ['pain'] }),
        response(21, stablePayload),
      ],
    });

    expect(out.payload.recommended_step).toBe('PERSONALIZED_CARE');
    expect(out.payload.action_type).toBe('personalized_care');
    expect(out.metricsSnapshot.has_gi_red_flags).toBe(true);
  });

  test('keeps insufficient completed check-ins conservative', () => {
    const out = evaluateBaselineRecommendation({
      enrollment: enrollment(),
      checkinResponses: [
        response(7, stablePayload),
        response(14, {}, 'skipped'),
        response(21, {}, 'skipped'),
      ],
    });

    expect(out.payload.recommended_step).toBe('BASELINE_REPEAT');
    expect(out.metricsSnapshot.completed_checkin_count).toBe(1);
    expect(out.metricsSnapshot.skipped_checkin_count).toBe(2);
  });

  test('routes unstable digestion to DIGESTIVE_FOUNDATIONS', () => {
    const out = evaluateBaselineRecommendation({
      enrollment: enrollment(),
      checkinResponses: [
        response(7, { ...stablePayload, digestion_score: 2 }),
        response(14, { ...stablePayload, digestion_score: 2 }),
        response(21, {
          ...stablePayload,
          digestion_score: 2,
          digestion_modifier: 'variable',
          bm_frequency: 'variable',
        }),
      ],
    });

    expect(out.payload.recommended_step).toBe('DIGESTIVE_FOUNDATIONS');
    expect(out.metricsSnapshot.digestion_unstable).toBe(true);
  });

  test('routes under-fueled or protein instability to PROTEIN_SUFFICIENCY', () => {
    const out = evaluateBaselineRecommendation({
      enrollment: enrollment(),
      checkinResponses: [
        response(7, stablePayload),
        response(14, stablePayload),
        response(21, {
          ...stablePayload,
          meals_per_day: '1',
          protein_consistency: 'low',
        }),
      ],
    });

    expect(out.payload.recommended_step).toBe('PROTEIN_SUFFICIENCY');
    expect(out.metricsSnapshot.under_fueled_or_protein_unstable).toBe(true);
  });

  test('routes stable non-elimination-specific signals to INFLAMMATION_REGULATION', () => {
    const out = evaluateBaselineRecommendation({
      enrollment: enrollment(),
      checkinResponses: [
        response(7, stablePayload),
        response(14, stablePayload),
        response(21, { ...stablePayload, stability_delta: 1 }),
      ],
    });

    expect(out.payload.recommended_step).toBe('INFLAMMATION_REGULATION');
  });

  test('routes objective or subjective worsening to PERSONALIZED_CARE', () => {
    const out = evaluateBaselineRecommendation({
      enrollment: enrollment(),
      checkinResponses: [
        response(7, stablePayload),
        response(14, stablePayload),
        response(21, {
          ...stablePayload,
          digestion_score: 3,
          energy_score: 2,
          stability_delta: -1,
        }),
      ],
    });

    expect(out.payload.recommended_step).toBe('PERSONALIZED_CARE');
    expect(out.metricsSnapshot.objective_worsening_fields).toContain(
      'energy_score',
    );
    expect(out.metricsSnapshot.subjective_day_21_decline).toBe(true);
  });
});
