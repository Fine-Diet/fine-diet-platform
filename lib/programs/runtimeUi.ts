import type {
  ProgramCapacity,
  ProgramEnrollmentStatus,
  ProgramRecommendation,
  ProgramRuntimeSummary,
} from './runtimeTypes';

/** Resolved statuses that block a fresh start / represent an open journey. */
const OPEN_DISPLAY_STATUSES = new Set<ProgramEnrollmentStatus>([
  'pre_start',
  'active',
  'paused',
]);

function summaryRecencyKey(summary: ProgramRuntimeSummary): string {
  // ISO timestamps sort lexicographically; id breaks ties stably.
  return [
    summary.enrollment.updated_at ?? '',
    summary.enrollment.created_at ?? '',
    summary.enrollment.id ?? '',
  ].join('\0');
}

/**
 * Pick the one runtime summary a Programs UI surface should display for a
 * slug. Order-independent: newest open enrollment wins; otherwise newest
 * terminal enrollment wins.
 */
export function selectDisplayRuntimeSummaryForSlug(
  summaries: readonly ProgramRuntimeSummary[],
  slug: string,
): ProgramRuntimeSummary | null {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  const matching = summaries.filter(
    (summary) => summary.program.slug.toLowerCase() === normalized,
  );
  if (matching.length === 0) return null;

  const open = matching.filter((summary) =>
    OPEN_DISPLAY_STATUSES.has(summary.resolved_status),
  );
  const pool = open.length > 0 ? open : matching;

  return pool.reduce((best, current) =>
    summaryRecencyKey(current) > summaryRecencyKey(best) ? current : best,
  );
}

/**
 * Collapse a runtime summary list to one display summary per program slug
 * using {@link selectDisplayRuntimeSummaryForSlug}.
 */
export function indexDisplayRuntimeSummariesBySlug(
  summaries: readonly ProgramRuntimeSummary[],
): Map<string, ProgramRuntimeSummary> {
  const map = new Map<string, ProgramRuntimeSummary>();
  for (let i = 0; i < summaries.length; i += 1) {
    const summary = summaries[i];
    const slug = summary.program.slug;
    const existing = map.get(slug);
    if (!existing) {
      map.set(slug, summary);
      continue;
    }
    const winner = selectDisplayRuntimeSummaryForSlug(
      [existing, summary],
      slug,
    );
    if (winner) map.set(slug, winner);
  }
  return map;
}

export type BaselineCardRuntimeState =
  | 'locked'
  | 'start_ready'
  | 'pre_start'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type BaselineDetailRuntimeState =
  | 'not_in_library'
  | 'start_ready'
  | 'pre_start'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type BaselinePrepModuleAccess = 'hidden' | 'primary' | 'reference';

// Generic aliases (P1b). The runtime-state shapes are not Baseline-specific.
export type ProgramCardRuntimeState = BaselineCardRuntimeState;
export type ProgramDetailRuntimeState = BaselineDetailRuntimeState;
export type ProgramPrepModuleAccess = BaselinePrepModuleAccess;

export interface RecommendationRevealDetails {
  actionType: string | null;
  recommendedStep: string | null;
  reasonSnippet: string | null;
  status: ProgramRecommendation['status'];
}

export interface BaselineWeekOneCapacityCopy {
  label: string;
  title: string;
  body: string;
  practice: string;
}

export interface BaselineWeekTwoCapacityCopy {
  label: string;
  title: string;
  body: string;
  practice: string;
}

export interface BaselineWeekThreeCapacityCopy {
  label: string;
  title: string;
  body: string;
  practice: string;
}

export function resolveProgramCardRuntimeState({
  hasAccess,
  summary,
}: {
  hasAccess: boolean;
  summary: ProgramRuntimeSummary | null;
}): ProgramCardRuntimeState {
  if (!hasAccess && !summary) return 'locked';
  if (!summary) return 'start_ready';

  switch (summary.resolved_status) {
    case 'pre_start':
      return 'pre_start';
    case 'active':
      return 'active';
    case 'paused':
      return 'paused';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'start_ready';
  }
}

export function resolveProgramDetailRuntimeState({
  inLibrary,
  hasAccess,
  summary,
}: {
  inLibrary: boolean;
  hasAccess: boolean;
  summary: ProgramRuntimeSummary | null;
}): ProgramDetailRuntimeState {
  if (!inLibrary || (!hasAccess && !summary)) return 'not_in_library';
  if (!summary) return 'start_ready';

  switch (summary.resolved_status) {
    case 'pre_start':
      return 'pre_start';
    case 'active':
      return 'active';
    case 'paused':
      return 'paused';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'start_ready';
  }
}

export function resolveProgramPrepModuleAccess(
  summary: ProgramRuntimeSummary | null,
): ProgramPrepModuleAccess {
  if (!summary) return 'hidden';

  if (summary.resolved_status === 'pre_start' || summary.current_day === 0) {
    return 'primary';
  }

  if (summary.resolved_status === 'active') {
    return 'reference';
  }

  return 'hidden';
}

/**
 * A check-in is due when the program is active and the seeded next-check-in
 * template lands on the current runtime day and has not yet been answered.
 *
 * This is template-driven (not tied to Baseline's 7/14/21 cadence), so any
 * program's check-in cadence is honored. Baseline behavior is unchanged because
 * its templates fall on days 7/14/21.
 */
export function isCheckinDue(
  summary: ProgramRuntimeSummary | null,
): boolean {
  if (!summary || summary.resolved_status !== 'active') return false;
  if (summary.next_checkin_template?.checkin_day !== summary.current_day) {
    return false;
  }

  return summary.latest_checkin_response?.checkin_day !== summary.current_day;
}

export function shouldShowBaselineWeekOneModules(
  summary: ProgramRuntimeSummary | null,
): boolean {
  return Boolean(
    summary &&
      summary.resolved_status === 'active' &&
      summary.current_day >= 1 &&
      summary.current_day <= 7,
  );
}

export function getBaselineWeekOneCapacityCopy(
  capacity: ProgramCapacity | null | undefined,
): BaselineWeekOneCapacityCopy {
  switch (capacity) {
    case 'low':
      return {
        label: 'Low capacity',
        title: 'Keep the rhythm very small',
        body: 'Use the smallest repeatable version of the practice. If energy feels low, prioritize timing over variety.',
        practice:
          'Choose one familiar breakfast or lunch and repeat it as needed.',
      };
    case 'high':
      return {
        label: 'High capacity',
        title: 'Add steadiness without adding pressure',
        body: 'You can prepare a little more, but the aim is still repeatable rhythm, not a stricter plan.',
        practice:
          'Set up two repeatable meal options and notice which one feels easiest to return to.',
      };
    case 'steady':
    default:
      return {
        label: 'Steady capacity',
        title: 'Build a rhythm you can repeat',
        body: 'Keep meals simple enough to repeat while you observe timing, energy, and hunger patterns.',
        practice:
          'Pick a repeatable breakfast and lunch rhythm for the next few days.',
      };
  }
}

export function shouldShowBaselineWeekTwoModules(
  summary: ProgramRuntimeSummary | null,
): boolean {
  return Boolean(
    summary &&
      summary.resolved_status === 'active' &&
      summary.current_day >= 8 &&
      summary.current_day <= 14,
  );
}

export function getBaselineWeekTwoCapacityCopy(
  capacity: ProgramCapacity | null | undefined,
): BaselineWeekTwoCapacityCopy {
  switch (capacity) {
    case 'low':
      return {
        label: 'Low capacity',
        title: 'Choose one gentle transition',
        body: 'No overhaul is needed. Pick one meal transition and slow the first few bites before changing foods.',
        practice:
          'At one meal today, sit down if possible and take the first few bites slowly.',
      };
    case 'high':
      return {
        label: 'High capacity',
        title: 'Add one recovery anchor',
        body: 'If you have more room, add a repeatable recovery cue without turning it into stricter rules.',
        practice:
          'Choose a simple wind-down cue or warm meal anchor you can repeat this week.',
      };
    case 'steady':
    default:
      return {
        label: 'Steady capacity',
        title: 'Support calm digestion with rhythm',
        body: 'Keep meals seated when possible, use warm or easy meals when useful, and keep one wake or wind-down cue consistent.',
        practice:
          'Pair a steady meal rhythm with one calm recovery cue today.',
      };
  }
}

export function shouldShowBaselineWeekThreeModules(
  summary: ProgramRuntimeSummary | null,
): boolean {
  return Boolean(
    summary &&
      summary.resolved_status === 'active' &&
      summary.current_day >= 15 &&
      summary.current_day <= 21,
  );
}

export function getBaselineWeekThreeCapacityCopy(
  capacity: ProgramCapacity | null | undefined,
): BaselineWeekThreeCapacityCopy {
  switch (capacity) {
    case 'low':
      return {
        label: 'Low capacity',
        title: 'Return to one reliable anchor',
        body: 'If things feel messy, return to one reliable meal or one rhythm anchor. That is enough for today.',
        practice:
          'Choose the most reliable meal or timing anchor and repeat that before adding anything new.',
      };
    case 'high':
      return {
        label: 'High capacity',
        title: 'Choose maintenance anchors, not new rules',
        body: 'If you have more room, choose one or two anchors you want to maintain without making Baseline stricter.',
        practice:
          'Name 1-2 meal or rhythm anchors that helped most and keep them simple.',
      };
    case 'steady':
    default:
      return {
        label: 'Steady capacity',
        title: 'Notice what helped most',
        body: 'Use this week to identify the meal or rhythm that helped you return to steadiness most often.',
        practice:
          'Pick one adjustment to carry forward and one reliable meal to repeat.',
      };
  }
}

export function isDay21Handled(summary: ProgramRuntimeSummary | null): boolean {
  const response = summary?.latest_checkin_response;
  if (!response || response.checkin_day !== 21) return false;

  return (
    response.response_status === 'completed' ||
    response.response_status === 'skipped'
  );
}

export function shouldShowRecommendationReveal(
  summary: ProgramRuntimeSummary | null,
): boolean {
  return isDay21Handled(summary);
}

export function formatRecommendedStepLabel(value: string | null): string {
  if (!value) return 'Not set';

  const normalized = value.replace(/[_-]+/g, ' ').trim();
  if (!normalized) return 'Not set';

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPayloadString(
  recommendation: ProgramRecommendation,
  key: string,
): string | null {
  const value = recommendation.recommendation_payload_json[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getRecommendationRevealDetails(
  recommendation: ProgramRecommendation | null,
): RecommendationRevealDetails | null {
  if (!recommendation) return null;

  return {
    actionType: getPayloadString(recommendation, 'action_type'),
    recommendedStep: getPayloadString(recommendation, 'recommended_step'),
    reasonSnippet: getPayloadString(recommendation, 'reason_snippet'),
    status: recommendation.status,
  };
}

// ---------------------------------------------------------------------------
// Backward-compatible Baseline-named aliases (P1b).
// The implementations above are generic; these aliases keep existing callers
// and tests working. Prefer the generic names in new code.
// ---------------------------------------------------------------------------

/** @deprecated Use {@link resolveProgramCardRuntimeState}. */
export const resolveBaselineCardRuntimeState = resolveProgramCardRuntimeState;

/** @deprecated Use {@link resolveProgramDetailRuntimeState}. */
export const resolveBaselineDetailRuntimeState =
  resolveProgramDetailRuntimeState;

/** @deprecated Use {@link resolveProgramPrepModuleAccess}. */
export const resolveBaselinePrepModuleAccess = resolveProgramPrepModuleAccess;

/** @deprecated Use {@link isCheckinDue}. */
export const isBaselineCheckinDue = isCheckinDue;
