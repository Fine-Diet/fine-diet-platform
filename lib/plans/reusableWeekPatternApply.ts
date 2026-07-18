/**
 * Week pattern application span planning (once, N weeks, through end date).
 */

import { addDaysToDateKey, compareDateKeys } from '@/lib/plans/planDateRange';
import type { PlanDay } from '@/lib/plans/types';

export type WeekPatternApplicationMode = 'once' | 'repeat_weeks' | 'until_date';

export interface WeekPatternApplicationPlan {
  startPlanDayIds: string[];
  spanCount: number;
  requestedSpanCount: number;
}

export interface WeekPatternApplicationIntent {
  requestedSpanCount: number;
  requiredEndDateLocal: string;
}

export function computeWeekPatternApplicationIntent(args: {
  orderedPlanDays: PlanDay[];
  targetStartPlanDayId: string;
  patternDayCount: number;
  mode: WeekPatternApplicationMode;
  repeatWeeks?: number;
  untilDateLocal?: string;
}): { intent: WeekPatternApplicationIntent | null; error?: string } {
  const { targetStartPlanDayId, patternDayCount } = args;
  if (patternDayCount <= 0) {
    return { intent: null, error: 'Pattern has no days to apply.' };
  }

  const ordered = [...args.orderedPlanDays].sort((a, b) => a.date_local.localeCompare(b.date_local));
  const startDay = ordered.find((day) => day.id === targetStartPlanDayId);
  if (!startDay) {
    return { intent: null, error: 'Target start day not found.' };
  }

  if (args.mode === 'once') {
    return {
      intent: {
        requestedSpanCount: 1,
        requiredEndDateLocal: addDaysToDateKey(startDay.date_local, patternDayCount - 1),
      },
    };
  }

  if (args.mode === 'repeat_weeks') {
    const repeatWeeks = args.repeatWeeks ?? 1;
    if (!Number.isInteger(repeatWeeks) || repeatWeeks < 1) {
      return { intent: null, error: 'repeat_weeks must be a positive integer.' };
    }
    return {
      intent: {
        requestedSpanCount: repeatWeeks,
        requiredEndDateLocal: addDaysToDateKey(
          startDay.date_local,
          repeatWeeks * patternDayCount - 1,
        ),
      },
    };
  }

  const untilDateLocal = args.untilDateLocal?.trim();
  if (!untilDateLocal) {
    return { intent: null, error: 'until_date_local is required for until_date application.' };
  }

  let spanCount = 0;
  let spanStart = startDay.date_local;
  let lastSpanEnd = '';
  while (true) {
    const spanEnd = addDaysToDateKey(spanStart, patternDayCount - 1);
    if (compareDateKeys(spanEnd, untilDateLocal) > 0) break;
    spanCount += 1;
    lastSpanEnd = spanEnd;
    spanStart = addDaysToDateKey(spanEnd, 1);
  }

  if (spanCount === 0 || !lastSpanEnd) {
    return {
      intent: null,
      error: 'No pattern spans fit before the selected end date.',
    };
  }

  return {
    intent: {
      requestedSpanCount: spanCount,
      requiredEndDateLocal: lastSpanEnd,
    },
  };
}

export function computeWeekPatternApplicationPlan(args: {
  orderedPlanDays: PlanDay[];
  targetStartPlanDayId: string;
  patternDayCount: number;
  mode: WeekPatternApplicationMode;
  repeatWeeks?: number;
  untilDateLocal?: string;
}): { plan: WeekPatternApplicationPlan | null; error?: string } {
  const intentResult = computeWeekPatternApplicationIntent(args);
  if (!intentResult.intent) {
    return { plan: null, error: intentResult.error };
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
