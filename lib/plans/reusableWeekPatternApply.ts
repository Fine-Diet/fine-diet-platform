/**
 * Week pattern application span planning (once, N weeks, through end date).
 */

import {
  addDaysToDateKey,
  compareDateKeys,
  daysInRange,
  isRealCalendarDateKey,
} from '@/lib/plans/planDateRange';
import type { PlanDay } from '@/lib/plans/types';

export type WeekPatternApplicationMode = 'once' | 'repeat_weeks' | 'until_date';

export const WEEK_PATTERN_APPLICATION_MODES: readonly WeekPatternApplicationMode[] = [
  'once',
  'repeat_weeks',
  'until_date',
];

/** Bounds guard against accidental very large writes from a single request. */
export const MAX_WEEK_PATTERN_REPEAT_WEEKS = 52;
export const MAX_WEEK_PATTERN_APPLICATION_SPAN_COUNT = 104;
export const MAX_PLAN_HORIZON_EXTENSION_DAYS = 730;

export interface WeekPatternApplicationPlan {
  startPlanDayIds: string[];
  spanCount: number;
  requestedSpanCount: number;
}

export interface WeekPatternApplicationIntent {
  requestedSpanCount: number;
  requiredEndDateLocal: string;
}

/**
 * Distinguishes "the request itself is invalid" (→ 400) from "the
 * referenced day could not be located" (→ 404) so callers can map errors
 * to the correct HTTP status instead of guessing from message text.
 */
export type WeekPatternApplicationIntentErrorKind = 'validation' | 'not_found';

export function computeWeekPatternApplicationIntent(args: {
  orderedPlanDays: PlanDay[];
  targetStartPlanDayId: string;
  patternDayCount: number;
  mode: WeekPatternApplicationMode;
  repeatWeeks?: number;
  untilDateLocal?: string;
}): {
  intent: WeekPatternApplicationIntent | null;
  error?: string;
  errorKind?: WeekPatternApplicationIntentErrorKind;
} {
  const { targetStartPlanDayId, patternDayCount } = args;

  if (!WEEK_PATTERN_APPLICATION_MODES.includes(args.mode)) {
    return {
      intent: null,
      errorKind: 'validation',
      error: `application_mode must be one of: ${WEEK_PATTERN_APPLICATION_MODES.join(', ')}.`,
    };
  }

  if (patternDayCount <= 0) {
    return { intent: null, errorKind: 'validation', error: 'Pattern has no days to apply.' };
  }

  const ordered = [...args.orderedPlanDays].sort((a, b) => a.date_local.localeCompare(b.date_local));
  const startDay = ordered.find((day) => day.id === targetStartPlanDayId);
  if (!startDay) {
    return { intent: null, errorKind: 'not_found', error: 'Target start day not found.' };
  }

  const finalizeIntent = (
    intent: WeekPatternApplicationIntent,
  ): { intent: WeekPatternApplicationIntent | null; error?: string; errorKind?: WeekPatternApplicationIntentErrorKind } => {
    if (intent.requestedSpanCount > MAX_WEEK_PATTERN_APPLICATION_SPAN_COUNT) {
      return {
        intent: null,
        errorKind: 'validation',
        error: `Requested ${intent.requestedSpanCount} pattern span(s) exceeds the maximum of ${MAX_WEEK_PATTERN_APPLICATION_SPAN_COUNT}.`,
      };
    }
    const horizonDays = daysInRange(startDay.date_local, intent.requiredEndDateLocal);
    if (horizonDays > MAX_PLAN_HORIZON_EXTENSION_DAYS) {
      return {
        intent: null,
        errorKind: 'validation',
        error: `Requested application spans ${horizonDays} day(s), which exceeds the maximum horizon of ${MAX_PLAN_HORIZON_EXTENSION_DAYS} days.`,
      };
    }
    return { intent };
  };

  if (args.mode === 'once') {
    return finalizeIntent({
      requestedSpanCount: 1,
      requiredEndDateLocal: addDaysToDateKey(startDay.date_local, patternDayCount - 1),
    });
  }

  if (args.mode === 'repeat_weeks') {
    const repeatWeeks = args.repeatWeeks ?? 1;
    if (!Number.isInteger(repeatWeeks) || repeatWeeks < 1) {
      return {
        intent: null,
        errorKind: 'validation',
        error: 'repeat_weeks must be a positive integer.',
      };
    }
    if (repeatWeeks > MAX_WEEK_PATTERN_REPEAT_WEEKS) {
      return {
        intent: null,
        errorKind: 'validation',
        error: `repeat_weeks must not exceed ${MAX_WEEK_PATTERN_REPEAT_WEEKS}.`,
      };
    }
    return finalizeIntent({
      requestedSpanCount: repeatWeeks,
      requiredEndDateLocal: addDaysToDateKey(
        startDay.date_local,
        repeatWeeks * patternDayCount - 1,
      ),
    });
  }

  const untilDateLocalRaw = args.untilDateLocal?.trim();
  if (!untilDateLocalRaw) {
    return {
      intent: null,
      errorKind: 'validation',
      error: 'until_date_local is required for until_date application.',
    };
  }
  if (!isRealCalendarDateKey(untilDateLocalRaw)) {
    return {
      intent: null,
      errorKind: 'validation',
      error: 'until_date_local must be a valid YYYY-MM-DD calendar date.',
    };
  }
  if (compareDateKeys(untilDateLocalRaw, startDay.date_local) < 0) {
    return {
      intent: null,
      errorKind: 'validation',
      error: 'until_date_local must be on or after the target start day.',
    };
  }
  const untilDateLocal = untilDateLocalRaw;

  let spanCount = 0;
  let spanStart = startDay.date_local;
  let lastSpanEnd = '';
  while (true) {
    const spanEnd = addDaysToDateKey(spanStart, patternDayCount - 1);
    if (compareDateKeys(spanEnd, untilDateLocal) > 0) break;
    spanCount += 1;
    lastSpanEnd = spanEnd;
    spanStart = addDaysToDateKey(spanEnd, 1);
    if (spanCount > MAX_WEEK_PATTERN_APPLICATION_SPAN_COUNT) break;
  }

  if (spanCount === 0 || !lastSpanEnd) {
    return {
      intent: null,
      errorKind: 'validation',
      error: 'No pattern spans fit before the selected end date.',
    };
  }

  return finalizeIntent({
    requestedSpanCount: spanCount,
    requiredEndDateLocal: lastSpanEnd,
  });
}

export function computeWeekPatternApplicationPlan(args: {
  orderedPlanDays: PlanDay[];
  targetStartPlanDayId: string;
  patternDayCount: number;
  mode: WeekPatternApplicationMode;
  repeatWeeks?: number;
  untilDateLocal?: string;
}): {
  plan: WeekPatternApplicationPlan | null;
  error?: string;
  errorKind?: WeekPatternApplicationIntentErrorKind;
} {
  const intentResult = computeWeekPatternApplicationIntent(args);
  if (!intentResult.intent) {
    return { plan: null, error: intentResult.error, errorKind: intentResult.errorKind };
  }

  const { orderedPlanDays, targetStartPlanDayId, patternDayCount } = args;
  const ordered = [...orderedPlanDays].sort((a, b) => a.date_local.localeCompare(b.date_local));
  const startIndex = ordered.findIndex((day) => day.id === targetStartPlanDayId);
  const startPlanDayIds: string[] = [];

  if (args.mode === 'once') {
    startPlanDayIds.push(ordered[startIndex]!.id);
    return {
      plan: {
        startPlanDayIds,
        spanCount: 1,
        requestedSpanCount: intentResult.intent.requestedSpanCount,
      },
    };
  }

  if (args.mode === 'repeat_weeks') {
    const repeatWeeks = args.repeatWeeks ?? 1;
    for (let week = 0; week < repeatWeeks; week += 1) {
      const index = startIndex + week * patternDayCount;
      const spanEnd = ordered[index + patternDayCount - 1];
      if (!spanEnd) {
        return {
          plan: null,
          error: `Target plan does not have enough contiguous days for ${repeatWeeks} pattern span(s).`,
        };
      }
      startPlanDayIds.push(ordered[index]!.id);
    }
    return {
      plan: {
        startPlanDayIds,
        spanCount: startPlanDayIds.length,
        requestedSpanCount: intentResult.intent.requestedSpanCount,
      },
    };
  }

  let index = startIndex;
  while (index + patternDayCount <= ordered.length) {
    const spanEnd = ordered[index + patternDayCount - 1]!;
    if (spanEnd.date_local > (args.untilDateLocal?.trim() ?? '')) break;
    startPlanDayIds.push(ordered[index]!.id);
    index += patternDayCount;
  }

  if (startPlanDayIds.length !== intentResult.intent.requestedSpanCount) {
    return {
      plan: null,
      error: 'Could not resolve the full until-date application span.',
    };
  }

  return {
    plan: {
      startPlanDayIds,
      spanCount: startPlanDayIds.length,
      requestedSpanCount: intentResult.intent.requestedSpanCount,
    },
  };
}

export function collectPlanDayIdsForApplicationPlan(args: {
  orderedPlanDays: PlanDay[];
  startPlanDayIds: string[];
  patternDayCount: number;
}): string[] {
  const ordered = [...args.orderedPlanDays].sort((a, b) => a.date_local.localeCompare(b.date_local));
  const ids: string[] = [];
  for (const startId of args.startPlanDayIds) {
    const startIndex = ordered.findIndex((day) => day.id === startId);
    if (startIndex < 0) continue;
    for (let offset = 0; offset < args.patternDayCount; offset += 1) {
      const day = ordered[startIndex + offset];
      if (day) ids.push(day.id);
    }
  }
  return ids;
}

export const WEEK_PATTERN_SPAN_DATE_GAP_ERROR =
  'Target plan days are not date-contiguous for this application span. ' +
  'Pattern day offsets must map to consecutive calendar dates.';

/**
 * Defense-in-depth check: `computeWeekPatternApplicationPlan` resolves
 * target days by array *position* (startIndex + offset). That is only
 * correct if the underlying plan_days are genuinely date-contiguous. This
 * asserts the actual calendar dates for every resolved span are
 * consecutive from each span's start date — not just that array indices
 * lined up — and fails clearly (rather than silently misapplying a
 * pattern) if the plan has date gaps or duplicate date_local rows.
 */
export function assertWeekPatternApplicationSpanDatesContiguous(args: {
  orderedPlanDays: PlanDay[];
  startPlanDayIds: string[];
  patternDayCount: number;
}): void {
  const ordered = [...args.orderedPlanDays].sort((a, b) => a.date_local.localeCompare(b.date_local));
  const byId = new Map(ordered.map((day) => [day.id, day]));

  for (const startId of args.startPlanDayIds) {
    const startIndex = ordered.findIndex((day) => day.id === startId);
    if (startIndex < 0) throw new Error(WEEK_PATTERN_SPAN_DATE_GAP_ERROR);
    const startDate = byId.get(startId)?.date_local;
    if (!startDate) throw new Error(WEEK_PATTERN_SPAN_DATE_GAP_ERROR);

    let expectedDate = startDate;
    for (let offset = 0; offset < args.patternDayCount; offset += 1) {
      const day = ordered[startIndex + offset];
      if (!day || day.date_local !== expectedDate) {
        throw new Error(WEEK_PATTERN_SPAN_DATE_GAP_ERROR);
      }
      expectedDate = addDaysToDateKey(expectedDate, 1);
    }
  }
}
