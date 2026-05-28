import type {
  BaselineRecommendationActionType,
  BaselineRecommendationEvaluation,
  BaselineRecommendationMetricsSnapshot,
  BaselineRecommendedStep,
  JsonObject,
  ProgramCheckinResponse,
  ProgramEnrollment,
  ProgramRecommendation,
} from './runtimeTypes';

export const BASELINE_RECOMMENDATION_TYPE = 'baseline_day_21_v1' as const;
export const BASELINE_RECOMMENDATION_PROGRAM_DAY = 21 as const;
const RULE_VERSION = 'baseline_recommendation_engine_v1' as const;
const BASELINE_CHECKIN_DAYS = [7, 14, 21] as const;
const SCORE_FIELDS = ['digestion_score', 'energy_score', 'sleep_score'] as const;

function completedResponses(
  responses: ProgramCheckinResponse[],
): ProgramCheckinResponse[] {
  return responses
    .filter((response) => response.response_status === 'completed')
    .sort((a, b) => a.checkin_day - b.checkin_day);
}

function getNumber(payload: JsonObject, key: string): number | null {
  const value = payload[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getString(payload: JsonObject, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getStringArray(payload: JsonObject, key: string): string[] {
  const value = payload[key];
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );
  }
  if (value === true) return ['reported'];
  if (typeof value === 'string' && value.trim() && value !== 'none') {
    return [value.trim()];
  }
  return [];
}

function hasGiRedFlags(responses: ProgramCheckinResponse[]): boolean {
  return responses.some(
    (response) => getStringArray(response.response_payload_json, 'gi_red_flags').length > 0,
  );
}

function objectiveWorseningFields(
  responses: ProgramCheckinResponse[],
): string[] {
  if (responses.length < 2) return [];

  const first = responses[0].response_payload_json;
  const last = responses[responses.length - 1].response_payload_json;

  return SCORE_FIELDS.filter((field) => {
    const firstValue = getNumber(first, field);
    const lastValue = getNumber(last, field);
    return firstValue != null && lastValue != null && lastValue <= firstValue - 1;
  });
}

function subjectiveDay21Decline(day21: ProgramCheckinResponse | null): boolean {
  if (!day21 || day21.response_status !== 'completed') return false;
  const payload = day21.response_payload_json;
  const stabilityDelta = getNumber(payload, 'stability_delta');
  const digestionModifier = getString(payload, 'digestion_modifier');

  return (
    (stabilityDelta != null && stabilityDelta < 0) ||
    digestionModifier === 'worse'
  );
}

function digestionUnstable(latest: ProgramCheckinResponse | null): boolean {
  if (!latest) return false;
  const payload = latest.response_payload_json;
  const score = getNumber(payload, 'digestion_score');
  const modifier = getString(payload, 'digestion_modifier');
  const bmFrequency = getString(payload, 'bm_frequency');

  return (
    (score != null && score <= 2) ||
    modifier === 'worse' ||
    modifier === 'variable' ||
    bmFrequency === 'every_few_days' ||
    bmFrequency === 'multiple_daily' ||
    bmFrequency === 'variable'
  );
}

function underFueledOrProteinUnstable(
  latest: ProgramCheckinResponse | null,
): boolean {
  if (!latest) return false;
  const payload = latest.response_payload_json;
  const mealsPerDay = getString(payload, 'meals_per_day');
  const proteinConsistency = getString(payload, 'protein_consistency');
  const hungerPattern = getString(payload, 'hunger_pattern');

  return (
    mealsPerDay === '1' ||
    mealsPerDay === 'variable' ||
    proteinConsistency === 'low' ||
    proteinConsistency === 'moderate' ||
    hungerPattern === 'early_hunger' ||
    hungerPattern === 'late_day_hunger' ||
    hungerPattern === 'variable'
  );
}

function buildRecommendation(
  actionType: BaselineRecommendationActionType,
  recommendedStep: BaselineRecommendedStep,
  reasonSnippet: string,
) {
  return {
    action_type: actionType,
    recommended_step: recommendedStep,
    reason_snippet: reasonSnippet,
    rule_version: RULE_VERSION,
  };
}

export function evaluateBaselineRecommendation(input: {
  enrollment: ProgramEnrollment;
  checkinResponses: ProgramCheckinResponse[];
  existingRecommendations?: ProgramRecommendation[];
}): BaselineRecommendationEvaluation {
  const relevantResponses = input.checkinResponses
    .filter((response) =>
      BASELINE_CHECKIN_DAYS.includes(
        response.checkin_day as (typeof BASELINE_CHECKIN_DAYS)[number],
      ),
    )
    .sort((a, b) => a.checkin_day - b.checkin_day);
  const completed = completedResponses(relevantResponses);
  const skipped = relevantResponses.filter(
    (response) => response.response_status === 'skipped',
  );
  const day21 =
    relevantResponses.find((response) => response.checkin_day === 21) ?? null;
  const latestCompleted = completed[completed.length - 1] ?? null;
  const hasRedFlags = hasGiRedFlags(completed);
  const worseningFields = objectiveWorseningFields(completed);
  const day21Decline = subjectiveDay21Decline(day21);
  const unstableDigestion = digestionUnstable(latestCompleted);
  const underFueled = underFueledOrProteinUnstable(latestCompleted);

  let payload;
  if (hasRedFlags) {
    payload = buildRecommendation(
      'personalized_care',
      'PERSONALIZED_CARE',
      'One or more Baseline check-ins included a safety flag, so the next step should be reviewed with personalized support.',
    );
  } else if (worseningFields.length > 0 || day21Decline) {
    payload = buildRecommendation(
      'personalized_care',
      'PERSONALIZED_CARE',
      'Baseline signals moved in a less stable direction, so a personalized review is the safest next step.',
    );
  } else if (completed.length < 2) {
    payload = buildRecommendation(
      'baseline_repeat',
      'BASELINE_REPEAT',
      'There is not enough completed Baseline signal data yet, so repeating Baseline is the most conservative next step.',
    );
  } else if (unstableDigestion) {
    payload = buildRecommendation(
      'guided_program',
      'DIGESTIVE_FOUNDATIONS',
      'Digestive pattern signals were still variable, so a gentle digestive foundations path is the clearest next review step.',
    );
  } else if (underFueled) {
    payload = buildRecommendation(
      'guided_program',
      'PROTEIN_SUFFICIENCY',
      'Meal rhythm or protein consistency looked uneven, so protein sufficiency is the most practical next focus.',
    );
  } else {
    payload = buildRecommendation(
      'guided_program',
      'INFLAMMATION_REGULATION',
      'Baseline signals look stable enough to review a general inflammation regulation path next.',
    );
  }

  const metricsSnapshot: BaselineRecommendationMetricsSnapshot = {
    completed_checkin_count: completed.length,
    skipped_checkin_count: skipped.length,
    day_21_handled: Boolean(day21),
    has_gi_red_flags: hasRedFlags,
    objective_worsening_fields: worseningFields,
    subjective_day_21_decline: day21Decline,
    digestion_unstable: unstableDigestion,
    under_fueled_or_protein_unstable: underFueled,
  };

  return {
    recommendationType: BASELINE_RECOMMENDATION_TYPE,
    programDay: BASELINE_RECOMMENDATION_PROGRAM_DAY,
    basedOnCheckinResponseId: day21?.id ?? null,
    payload,
    inputSnapshot: {
      enrollment_id: input.enrollment.id,
      program_slug: input.enrollment.program_slug,
      evaluated_checkin_days: relevantResponses.map((response) => response.checkin_day),
      checkin_response_ids: relevantResponses.map((response) => response.id),
      checkin_status_by_day: Object.fromEntries(
        relevantResponses.map((response) => [
          String(response.checkin_day),
          response.response_status,
        ]),
      ),
      existing_recommendation_ids: (input.existingRecommendations ?? []).map(
        (recommendation) => recommendation.id,
      ),
    },
    metricsSnapshot,
  };
}
