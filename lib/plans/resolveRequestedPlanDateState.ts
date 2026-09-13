import {
  isDateInPlanCoverage,
  resolvePlanDateCoverage,
  type PlanDateCoverage,
} from '@/lib/plans/home/buildGuidance';
import type {
  MealSlotKey,
  Plan,
  PlanDay,
  PlanSlot,
  ResolvedScheduleSlot,
} from '@/lib/plans/types';

export type RequestedPlanDateStateKind =
  | 'in_range_materialized'
  | 'in_range_unmaterialized'
  | 'out_of_range';

export interface RequestedPlanDateState {
  kind: RequestedPlanDateStateKind;
  coverage: PlanDateCoverage;
}

export const OUT_OF_RANGE_PLAN_DATE_MESSAGE =
  'This date is outside the active plan. Choose a date in the plan or open Week.';

export const NO_ACTIVE_PLAN_DATE_MESSAGE =
  'There is no active plan to show for this date.';

/**
 * Plan membership for a requested Day date.
 *
 * Coverage comes from the Plan’s declared start/end (with plan-shape
 * fallback). Existing plan_days rows may widen that span, but their
 * absence never shrinks it. Row existence only distinguishes
 * materialized vs unmaterialized in-range dates.
 */
export function resolveRequestedPlanDateState(args: {
  plan: Pick<Plan, 'start_date' | 'end_date' | 'plan_shape'>;
  days: Array<Pick<PlanDay, 'date_local'>>;
  requestedDate: string;
}): RequestedPlanDateState {
  const declared = resolvePlanDateCoverage({
    plan: args.plan,
    days: [],
  });
  const fromDays =
    args.days.length > 0
      ? resolvePlanDateCoverage({ plan: args.plan, days: args.days })
      : declared;
  const coverage: PlanDateCoverage = {
    start: declared.start <= fromDays.start ? declared.start : fromDays.start,
    end: declared.end >= fromDays.end ? declared.end : fromDays.end,
  };

  if (!isDateInPlanCoverage(args.requestedDate, coverage)) {
    return { kind: 'out_of_range', coverage };
  }

  const materialized = args.days.some((day) => day.date_local === args.requestedDate);
  return {
    kind: materialized ? 'in_range_materialized' : 'in_range_unmaterialized',
    coverage,
  };
}

export function presentationSlotIdForScheduleKey(slotKey: MealSlotKey): string {
  return `pending:${slotKey}`;
}

export function scheduleKeyFromPresentationSlotId(slotId: string): MealSlotKey | null {
  if (!slotId.startsWith('pending:')) return null;
  const key = slotId.slice('pending:'.length);
  return key.length > 0 ? (key as MealSlotKey) : null;
}

/** Presentation-only slots. IDs are not persisted PlanSlot identities. */
export function presentationSlotsFromSchedule(
  scheduleSlots: ResolvedScheduleSlot[],
): Array<{ slot: PlanSlot; slotKey: MealSlotKey }> {
  return scheduleSlots
    .filter((entry) => entry.enabled)
    .map((entry, index) => ({
      slotKey: entry.key,
      slot: {
        id: presentationSlotIdForScheduleKey(entry.key),
        plan_day_id: '',
        person_id: '',
        slot_block: entry.slot_block,
        slot_ordinal: index,
        slot_label: entry.label,
        target_time: entry.target_time,
        created_at: '',
        updated_at: '',
      },
    }));
}
