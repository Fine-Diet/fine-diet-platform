import { getEnabledMealSlots } from '@/lib/journal/mealScheduleAssignment';
import { isUsableSavedMealSchedule } from '@/lib/plans/decisioning/usableMealRhythm';
import { ensurePlanOccasionStructureForPerson } from '@/lib/plans/planStructureServerService';
import {
  createManualPlanForPerson,
  listPlansForPerson,
} from '@/lib/plans/planServerService';
import {
  selectPlansHomePlanningTarget,
  type PlansHomePlanningTargetKind,
} from '@/lib/plans/home/planningTarget';
import type { MealSlotKey } from '@/lib/plans/types';
import { readPersonMetadata } from '@/lib/plans/personMetadataStore';
import { PlanStructureCommandError } from '@/lib/plans/planStructure/policy';

export interface PlansHomeTargetResult {
  planId: string;
  planDayId: string;
  planSlotId: string;
  dateLocal: string;
  slotKey: MealSlotKey;
  targetKind: PlansHomePlanningTargetKind | 'created_manual_dated_day';
  createdPlan: boolean;
  createdDay: boolean;
  createdSlot: boolean;
}

/**
 * Resolve the one writable selected-date target for Plans Home, then ensure
 * only that date and enabled Meal Rhythm occasion. It never activates,
 * archives, extends, or replaces a plan and never writes planned meals or Log.
 */
export async function resolvePlansHomeTargetForPerson(args: {
  personId: string;
  dateLocal: string;
  slotKey: MealSlotKey;
}): Promise<PlansHomeTargetResult> {
  // Validate the occasion before creating a date-local container so a stale
  // client can never leave behind an empty plan after the rhythm changed.
  const metadata = await readPersonMetadata(args.personId);
  if (!isUsableSavedMealSchedule(metadata.meal_schedule)) {
    throw new PlanStructureCommandError(
      'Set a meal rhythm before filling this occasion.',
      'missing_usable_meal_rhythm',
    );
  }
  const occasion = getEnabledMealSlots(metadata.meal_schedule)
    .find((slot) => slot.key === args.slotKey);
  if (!occasion?.enabled) {
    throw new PlanStructureCommandError(
      'That occasion is not enabled in your meal rhythm.',
      'occasion_not_enabled',
    );
  }

  let plans = await listPlansForPerson(args.personId);
  let selected = selectPlansHomePlanningTarget(plans, args.dateLocal);
  let createdPlan = false;

  if (!selected) {
    await createManualPlanForPerson({
      personId: args.personId,
      title: `Day plan · ${args.dateLocal}`,
      planShape: 'day',
      startDate: args.dateLocal,
      endDate: args.dateLocal,
    });
    createdPlan = true;

    // Re-read and apply the same deterministic selector. This makes repeated
    // saves reuse one target and resolves legacy duplicate candidates without
    // mutating any of them.
    plans = await listPlansForPerson(args.personId);
    selected = selectPlansHomePlanningTarget(plans, args.dateLocal);
  }

  if (!selected) {
    throw new Error('Could not resolve a writable planning day.');
  }

  const structure = await ensurePlanOccasionStructureForPerson({
    personId: args.personId,
    command: {
      planId: selected.plan.id,
      dateLocal: args.dateLocal,
      slotKey: args.slotKey,
    },
    allowWritableDatedDayPlan: true,
  });

  return {
    planId: structure.planId,
    planDayId: structure.planDayId,
    planSlotId: structure.planSlotId,
    dateLocal: structure.dateLocal,
    slotKey: structure.slotKey,
    targetKind: createdPlan ? 'created_manual_dated_day' : selected.kind,
    createdPlan,
    createdDay: structure.createdDay,
    createdSlot: structure.createdSlot,
  };
}
