import { selectPlansHomePlanningTarget } from '@/lib/plans/home/planningTarget';
import {
  resolveFrozenPlanEnabledScheduleSlots,
  templateSlotsFromResolvedSchedule,
} from '@/lib/plans/frozenPlanSchedule';
import type {
  Plan,
  PlanDay,
  PlanDayTemplate,
  PlanSlot,
  PlannedMeal,
} from '@/lib/plans/types';

export interface MonthProjectionServices {
  list: () => Promise<Plan[]>;
  getDetail: (planId: string) => Promise<{
    plan: Plan;
    days: PlanDay[];
    slots: PlanSlot[];
    meals: PlannedMeal[];
  }>;
}

export interface MonthProjectionData {
  planDays: PlanDay[];
  planSlots: PlanSlot[];
  meals: PlannedMeal[];
  coveringPlanByDate: Record<string, Plan>;
}

export function blankDayTemplateFromSlots(
  personId: string,
  slots: PlanDayTemplate['slots'],
  sourcePlanDayId = 'month-modal-draft',
): PlanDayTemplate {
  return {
    id: '',
    person_id: personId,
    name: 'Unnamed Day Plan',
    scope: 'day',
    source_plan_id: '',
    source_plan_day_id: sourcePlanDayId,
    source_date_local: '',
    slots,
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '',
    updated_at: '',
  };
}

export function blankDayTemplateForDateContext(args: {
  personId: string;
  dateLocal: string;
  profileSeedSlots: PlanDayTemplate['slots'];
  coveringPlan: Plan | null;
}): PlanDayTemplate {
  if (args.coveringPlan) {
    const frozen = resolveFrozenPlanEnabledScheduleSlots(args.coveringPlan);
    if (frozen.length > 0) {
      return blankDayTemplateFromSlots(
        args.personId,
        templateSlotsFromResolvedSchedule(frozen),
        `month-frozen:${args.dateLocal}`,
      );
    }
  }
  return blankDayTemplateFromSlots(args.personId, args.profileSeedSlots);
}

export async function fetchMonthProjectionData(
  services: MonthProjectionServices,
  visibleDates: string[],
): Promise<MonthProjectionData> {
  const plans = await services.list();
  const targetPlanIds = Array.from(
    new Set(
      visibleDates.flatMap((dateLocal) => {
        const target = selectPlansHomePlanningTarget(plans, dateLocal);
        return target ? [target.plan.id] : [];
      }),
    ),
  );
  const details = await Promise.all(
    targetPlanIds.map((planId) => services.getDetail(planId)),
  );
  const detailByPlanId = new Map(details.map((detail) => [detail.plan.id, detail]));
  const coveringPlanByDate: Record<string, Plan> = {};
  for (const dateLocal of visibleDates) {
    const target = selectPlansHomePlanningTarget(plans, dateLocal);
    if (target) coveringPlanByDate[dateLocal] = target.plan;
  }
  const selectedDays = visibleDates.flatMap((dateLocal) => {
    const target = selectPlansHomePlanningTarget(plans, dateLocal);
    const detail = target ? detailByPlanId.get(target.plan.id) : null;
    const day = detail?.days.find((row) => row.date_local === dateLocal);
    return day ? [day] : [];
  });
  const selectedDayIds = new Set(selectedDays.map((day) => day.id));

  return {
    planDays: selectedDays,
    planSlots: details.flatMap((detail) =>
      detail.slots.filter((slot) => selectedDayIds.has(slot.plan_day_id)),
    ),
    meals: details.flatMap((detail) =>
      detail.meals.filter((meal) => selectedDayIds.has(meal.plan_day_id)),
    ),
    coveringPlanByDate,
  };
}
