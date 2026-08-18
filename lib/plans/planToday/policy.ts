/**
 * Packet 4 — Simplified Plan Today policy v1.
 *
 * Walk today's enabled Meal Rhythm occasions. Reuse Plans Home guidance rows
 * and Packet 3 create/attach. No new planning model, no week wizard.
 */

import { coverageFromRows, isPlannedWindowState } from '@/lib/plans/decisioning/coverage';
import type { DayCoverageKind } from '@/lib/plans/decisioning/types';
import type {
  PlansMealGuidanceRow,
  PlansMealGuidanceStatus,
} from '@/lib/plans/home/types';

export {
  canonicalCreateMealReturnTo,
  isSafeAppReturnPath,
  PLAN_TODAY_RETURN_PATH,
} from '@/lib/plans/mealCreation/returnPath';

export const PLAN_TODAY_POLICY_ID = 'plan-today.simplified' as const;
export const PLAN_TODAY_POLICY_VERSION = 'v1' as const;

export type PlanTodayView = 'missing_rhythm' | 'board' | 'complete' | 'error';
export type PlanTodayOccasionStatus = 'open' | 'planned';

export interface PlanTodayOccasion {
  slotKey: string;
  label: string;
  targetTimeValue: string;
  status: PlanTodayOccasionStatus;
}

export interface PlanTodayProposal {
  policyId: typeof PLAN_TODAY_POLICY_ID;
  policyVersion: typeof PLAN_TODAY_POLICY_VERSION;
  date: string;
  view: PlanTodayView;
  coverage: DayCoverageKind;
  occasions: PlanTodayOccasion[];
  nextOpenSlotKey: string | null;
  openCount: number;
  plannedCount: number;
  canAttach: boolean;
  reasonCodes: string[];
}

export function proposePlanToday(args: {
  date: string;
  hasUsableRhythm: boolean;
  guidanceStatus: PlansMealGuidanceStatus;
  rows: PlansMealGuidanceRow[];
  planId: string | null;
}): PlanTodayProposal {
  const reasonCodes: string[] = ['meal_rhythm_enabled_occasions', 'packet_3_create_attach'];

  if (args.guidanceStatus === 'error') {
    return {
      policyId: PLAN_TODAY_POLICY_ID,
      policyVersion: PLAN_TODAY_POLICY_VERSION,
      date: args.date,
      view: 'error',
      coverage: 'unknown',
      occasions: [],
      nextOpenSlotKey: null,
      openCount: 0,
      plannedCount: 0,
      canAttach: false,
      reasonCodes: [...reasonCodes, 'guidance_error'],
    };
  }

  if (!args.hasUsableRhythm || args.guidanceStatus === 'no_schedule') {
    return {
      policyId: PLAN_TODAY_POLICY_ID,
      policyVersion: PLAN_TODAY_POLICY_VERSION,
      date: args.date,
      view: 'missing_rhythm',
      coverage: 'unknown',
      occasions: [],
      nextOpenSlotKey: null,
      openCount: 0,
      plannedCount: 0,
      canAttach: false,
      reasonCodes: [...reasonCodes, 'missing_usable_meal_rhythm'],
    };
  }

  const occasions: PlanTodayOccasion[] = args.rows.map((row) => ({
    slotKey: row.slotKey,
    label: row.label,
    targetTimeValue: row.targetTimeValue,
    status: isPlannedWindowState(row.state) ? 'planned' : 'open',
  }));
  const open = occasions.filter((row) => row.status === 'open');
  const planned = occasions.filter((row) => row.status === 'planned');
  const coverage = coverageFromRows(args.rows);
  const canAttach = args.guidanceStatus === 'ready' && Boolean(args.planId);

  if (args.guidanceStatus === 'no_active_plan') {
    reasonCodes.push('no_active_plan_attach_deferred');
  } else if (args.guidanceStatus === 'out_of_range') {
    reasonCodes.push('today_outside_active_plan');
  } else if (canAttach) {
    reasonCodes.push('canonical_planned_meal_attach');
  }

  if (coverage === 'covered') {
    reasonCodes.push('today_enabled_occasions_planned');
  } else if (coverage === 'partial') {
    reasonCodes.push('today_remaining_open_occasions');
  } else {
    reasonCodes.push('today_empty_enabled_occasions');
  }

  return {
    policyId: PLAN_TODAY_POLICY_ID,
    policyVersion: PLAN_TODAY_POLICY_VERSION,
    date: args.date,
    view: coverage === 'covered' ? 'complete' : 'board',
    coverage,
    occasions,
    nextOpenSlotKey: open[0]?.slotKey ?? null,
    openCount: open.length,
    plannedCount: planned.length,
    canAttach,
    reasonCodes,
  };
}
