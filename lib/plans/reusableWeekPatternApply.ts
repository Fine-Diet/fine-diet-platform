/**
 * Week pattern application span planning (once, N weeks, through end date).
 */

import type { PlanDay } from '@/lib/plans/types';

export type WeekPatternApplicationMode = 'once' | 'repeat_weeks' | 'until_date';

export interface WeekPatternApplicationPlan {
  startPlanDayIds: string[];
  spanCount: number;
}

export function computeWeekPatternApplicationPlan(args: {
  orderedPlanDays: PlanDay[];
  targetStartPlanDayId: string;
  patternDayCount: number;
  mode: WeekPatternApplicationMode;
  repeatWeeks?: number;
  untilDateLocal?: string;
}): { plan: WeekPatternApplicationPlan | null; error?: string } {
  const { orderedPlanDays, targetStartPlanDayId, patternDayCount } = args;
  if (patternDayCount <= 0) {
    return { plan: null, error: 'Pattern has no days to apply.' };
  }

  const ordered = [...orderedPlanDays].sort((a, b) => a.date_local.localeCompare(b.date_local));
  const startIndex = ordered.findIndex((day) => day.id === targetStartPlanDayId);
  if (startIndex < 0) {
    return { plan: null, error: 'Target start day not found.' };
  }

  const startPlanDayIds: string[] = [];

  if (args.mode === 'once') {
    if (startIndex + patternDayCount > ordered.length) {
      return {
        plan: null,
        error: 'Target plan does not have enough contiguous days for this pattern.',
      };
    }
    startPlanDayIds.push(ordered[startIndex]!.id);
    return { plan: { startPlanDayIds, spanCount: 1 } };
  }

  if (args.mode === 'repeat_weeks') {
    const repeatWeeks = args.repeatWeeks ?? 1;
    if (!Number.isInteger(repeatWeeks) || repeatWeeks < 1) {
      return { plan: null, error: 'repeat_weeks must be a positive integer.' };
    }
    for (let week = 0; week < repeatWeeks; week += 1) {
      const index = startIndex + week * patternDayCount;
      if (index + patternDayCount > ordered.length) {
        if (startPlanDayIds.length === 0) {
          return {
            plan: null,
            error: 'Target plan does not have enough contiguous days for this pattern.',
          };
        }
        break;
      }
      startPlanDayIds.push(ordered[index]!.id);
    }
    return { plan: { startPlanDayIds, spanCount: startPlanDayIds.length } };
  }

  const untilDateLocal = args.untilDateLocal?.trim();
  if (!untilDateLocal) {
    return { plan: null, error: 'until_date_local is required for until_date application.' };
  }

  let index = startIndex;
  while (index + patternDayCount <= ordered.length) {
    const spanEnd = ordered[index + patternDayCount - 1]!;
    if (spanEnd.date_local > untilDateLocal) break;
    startPlanDayIds.push(ordered[index]!.id);
    index += patternDayCount;
  }

  if (startPlanDayIds.length === 0) {
    return {
      plan: null,
      error: 'No pattern spans fit before the selected end date.',
    };
  }

  return { plan: { startPlanDayIds, spanCount: startPlanDayIds.length } };
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
