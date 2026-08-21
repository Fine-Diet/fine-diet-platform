/**
 * Packet 7 — ensure canonical plan_day / plan_slot structure.
 *
 * Structure only. Never creates, activates, or extends a plan, and never
 * writes planned meals. Packet 3 remains the sole attach writer.
 */

import { resolveMealSlotQueryParam } from '@/lib/journal/mealScheduleAssignment';
import { isRealCalendarDateKey } from '@/lib/plans/planDateRange';
import type { MealSlotKey, ResolvedScheduleSlot } from '@/lib/plans/types';

export const PLAN_STRUCTURE_POLICY_ID = 'plan-structure.ensure' as const;
export const PLAN_STRUCTURE_POLICY_VERSION = 'v1' as const;

export const PLAN_DAY_STRUCTURE_INSERT = {
  onConflict: 'plan_id,date_local',
  ignoreDuplicates: true,
} as const;

export const PLAN_STRUCTURE_ENSURE_ATTEMPTS = 4 as const;

export type PlanStructureEnsureReasonCode =
  | 'invalid_request'
  | 'no_active_plan'
  | 'not_canonical_active_plan'
  | 'date_outside_plan_coverage'
  | 'missing_usable_meal_rhythm'
  | 'occasion_not_enabled'
  | 'plan_not_found'
  | 'structure_write_failed';

export interface EnsurePlanOccasionStructureCommand {
  planId: string;
  dateLocal: string;
  slotKey: MealSlotKey;
}

export interface EnsurePlanOccasionStructureResult {
  planId: string;
  dateLocal: string;
  planDayId: string;
  planSlotId: string;
  slotKey: MealSlotKey;
  createdDay: boolean;
  createdSlot: boolean;
  reused: boolean;
}

export class PlanStructureCommandError extends Error {
  readonly status: 400 | 404;
  readonly reasonCode: PlanStructureEnsureReasonCode;

  constructor(
    message: string,
    reasonCode: PlanStructureEnsureReasonCode,
    status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = 'PlanStructureCommandError';
    this.reasonCode = reasonCode;
    this.status = status;
    Object.setPrototypeOf(this, PlanStructureCommandError.prototype);
  }
}

export function parseEnsurePlanOccasionStructureCommand(
  body: unknown,
): EnsurePlanOccasionStructureCommand | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.planId !== 'string' || record.planId.trim().length === 0) return null;
  if (!isRealCalendarDateKey(record.dateLocal)) return null;
  const slotKey = resolveMealSlotQueryParam(record.slotKey);
  if (!slotKey) return null;
  return {
    planId: record.planId.trim(),
    dateLocal: record.dateLocal,
    slotKey,
  };
}

/**
 * Canonical `slot_ordinal` is the 1-based index of this occasion in the full
 * enabled Meal Rhythm for the day — never the order in which occasions were
 * ensured. Lunch before Breakfast still assigns Lunch 2 and Breakfast 1 when
 * the saved rhythm orders Breakfast first.
 */
export function preferredSlotOrdinalForOccasion(
  enabledSlots: Array<Pick<ResolvedScheduleSlot, 'key' | 'enabled'>>,
  slotKey: MealSlotKey,
): number | null {
  const ordered = enabledSlots.filter((slot) => slot.enabled);
  const index = ordered.findIndex((slot) => slot.key === slotKey);
  if (index < 0) return null;
  return index + 1;
}

export function nextPlanSlotOrdinal(args: {
  preferredOrdinal: number;
  occupiedOrdinals: number[];
}): number {
  if (!args.occupiedOrdinals.includes(args.preferredOrdinal)) {
    return args.preferredOrdinal;
  }
  const max = args.occupiedOrdinals.reduce((highest, value) => Math.max(highest, value), 0);
  return max + 1;
}

export function canonicalEnsureSlotOrdinal(args: {
  enabledSlots: Array<Pick<ResolvedScheduleSlot, 'key' | 'enabled'>>;
  slotKey: MealSlotKey;
  occupiedOrdinals: number[];
}): number | null {
  const preferredOrdinal = preferredSlotOrdinalForOccasion(args.enabledSlots, args.slotKey);
  if (preferredOrdinal == null) return null;
  return nextPlanSlotOrdinal({
    preferredOrdinal,
    occupiedOrdinals: args.occupiedOrdinals,
  });
}

export function occasionNeedsStructureEnsure(args: {
  canFillOnPlan: boolean;
  hasPlanDay: boolean;
  hasMatchingSlot: boolean;
}): boolean {
  return args.canFillOnPlan && (!args.hasPlanDay || !args.hasMatchingSlot);
}
