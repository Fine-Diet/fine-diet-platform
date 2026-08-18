/**
 * Packet 8 — server command: repeat one canonical planned meal onto selected
 * open in-range enabled Meal Rhythm occasions.
 *
 * Reuses Packet 7 ensure for missing day/slot structure and Packet 3
 * attachCanonicalMealForPerson for the planned-meal write. Never overwrites
 * occupied destinations, never clones MealDocuments, never extends coverage.
 */

import { getEnabledMealSlots } from '@/lib/journal/mealScheduleAssignment';
import { selectCurrentPlan } from '@/lib/plans/currentPlan';
import { isUsableSavedMealSchedule } from '@/lib/plans/decisioning/usableMealRhythm';
import {
  isDateInPlanCoverage,
  resolvePlanDateCoverage,
} from '@/lib/plans/home/buildGuidance';
import { attachCanonicalMealForPerson } from '@/lib/plans/mealCreation/attachCanonicalMealForPerson';
import { mealTypeForSlotKey } from '@/lib/plans/mealCreation/candidatePolicy';
import { assertMealDocumentAttachableForPlan } from '@/lib/plans/mealDocumentPlanAttach';
import { readSourceMealDocumentId } from '@/lib/plans/mealDocumentPlanPointer';
import { readPersonMetadata } from '@/lib/plans/personMetadataStore';
import {
  deletePlannedMeal,
  getPlan,
  getPlanDayByDate,
  getPlannedMeal,
  listMealsForDay,
  listPlansForPerson,
  listSlotsForDay,
  recomputePlanDayProjection,
} from '@/lib/plans/planServerService';
import { ensurePlanOccasionStructureForPerson } from '@/lib/plans/planStructureServerService';
import { PlanRequestValidationError } from '@/lib/plans/planRequestErrors';
import { PlanStructureCommandError } from '@/lib/plans/planStructure/policy';
import { resolvePlanSlotForCreateKey } from '@/lib/plans/resolvePlanSlotForCreateKey';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { PlannedMeal, ResolvedScheduleSlot } from '@/lib/plans/types';
import {
  PlanRepeatCommandError,
  classifyRepeatOccupancy,
  collectOccupyingMeals,
  resolveRepeatInsertRace,
  summarizeRepeatDestinations,
  type PlanRepeatDestinationResult,
  type RepeatSelectedOpenCommand,
  type RepeatSelectedOpenResult,
} from '@/lib/plans/planRepeat/policy';

async function listPlanDayDates(personId: string, planId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('plan_days')
    .select('date_local')
    .eq('plan_id', planId)
    .eq('person_id', personId);
  if (error) throw new Error(`Failed to list plan_days: ${error.message}`);
  return ((data ?? []) as Array<{ date_local: string }>).map((row) => row.date_local);
}

function destinationResult(args: {
  dateLocal: string;
  slotKey: RepeatSelectedOpenCommand['destinations'][number]['slotKey'];
  status: PlanRepeatDestinationResult['status'];
  planDayId?: string | null;
  planSlotId?: string | null;
  plannedMealId?: string | null;
}): PlanRepeatDestinationResult {
  return {
    dateLocal: args.dateLocal,
    slotKey: args.slotKey,
    status: args.status,
    planDayId: args.planDayId ?? null,
    planSlotId: args.planSlotId ?? null,
    plannedMealId: args.plannedMealId ?? null,
  };
}

async function occupancyForDestination(args: {
  personId: string;
  occasion: ResolvedScheduleSlot;
  planDayId: string | null;
  planSlotId: string | null;
  sourceMealDocumentId: string;
}): Promise<{
  kind: 'open' | 'reused' | 'occupied';
  occupyingMeals: PlannedMeal[];
  reusedMealId: string | null;
}> {
  if (!args.planDayId) {
    return { kind: 'open', occupyingMeals: [], reusedMealId: null };
  }
  const [dayMeals, daySlots] = await Promise.all([
    listMealsForDay(args.personId, args.planDayId),
    listSlotsForDay(args.personId, args.planDayId),
  ]);
  const occupyingMeals = collectOccupyingMeals({
    occasion: args.occasion,
    dayMeals,
    daySlots,
    planSlotId: args.planSlotId,
  });
  const kind = classifyRepeatOccupancy({
    occupyingMeals,
    sourceMealDocumentId: args.sourceMealDocumentId,
  });
  const reusedMeal =
    kind === 'reused'
      ? occupyingMeals.find(
          (meal) => readSourceMealDocumentId(meal.payload) === args.sourceMealDocumentId,
        ) ?? null
      : null;
  return { kind, occupyingMeals, reusedMealId: reusedMeal?.id ?? null };
}

async function resolveExistingStructure(args: {
  personId: string;
  planId: string;
  dateLocal: string;
  slotKey: RepeatSelectedOpenCommand['destinations'][number]['slotKey'];
}): Promise<{ planDayId: string | null; planSlotId: string | null }> {
  const planDay = await getPlanDayByDate(args.personId, args.planId, args.dateLocal);
  if (!planDay) return { planDayId: null, planSlotId: null };
  const slots = await listSlotsForDay(args.personId, planDay.id);
  const slot = resolvePlanSlotForCreateKey(args.slotKey, slots);
  return {
    planDayId: planDay.id,
    planSlotId: slot?.id ?? null,
  };
}

export async function repeatSelectedOpenForPerson(args: {
  personId: string;
  command: RepeatSelectedOpenCommand;
}): Promise<RepeatSelectedOpenResult> {
  const { personId, command } = args;
  const plan = await getPlan(personId, command.planId);
  if (!plan) {
    throw new PlanRepeatCommandError('Plan not found.', 'plan_not_found', 404);
  }
  if (plan.status !== 'active') {
    throw new PlanRepeatCommandError(
      'That plan is not the active plan.',
      'not_canonical_active_plan',
    );
  }

  const current = selectCurrentPlan(await listPlansForPerson(personId));
  if (!current) {
    throw new PlanRepeatCommandError(
      'There is no active plan to repeat this meal onto.',
      'no_active_plan',
    );
  }
  if (current.id !== command.planId) {
    throw new PlanRepeatCommandError(
      'That plan is not the canonical active plan.',
      'not_canonical_active_plan',
    );
  }

  const sourceMeal = await getPlannedMeal(personId, command.sourcePlannedMealId);
  if (!sourceMeal) {
    throw new PlanRepeatCommandError('Source meal not found.', 'source_not_found', 404);
  }
  if (sourceMeal.plan_id !== command.planId) {
    throw new PlanRepeatCommandError(
      'Source meal is not on this plan.',
      'source_not_on_plan',
    );
  }

  const sourceMealDocumentId = readSourceMealDocumentId(sourceMeal.payload);
  if (!sourceMealDocumentId) {
    throw new PlanRepeatCommandError(
      'That planned meal has no reusable canonical meal.',
      'source_not_canonical',
    );
  }

  let document;
  try {
    document = await assertMealDocumentAttachableForPlan({
      personId,
      sourceMealDocumentId,
    });
  } catch (err) {
    if (err instanceof PlanRequestValidationError) {
      throw new PlanRepeatCommandError(
        'That planned meal has no reusable canonical meal.',
        'source_not_canonical',
      );
    }
    throw err;
  }

  const dayDates = await listPlanDayDates(personId, command.planId);
  const coverage = resolvePlanDateCoverage({
    plan,
    days: dayDates.map((date_local) => ({ date_local })),
  });

  const meta = await readPersonMetadata(personId);
  const mealSchedule = meta.meal_schedule;
  if (!isUsableSavedMealSchedule(mealSchedule)) {
    throw new PlanRepeatCommandError(
      'Set a meal rhythm before repeating onto occasions.',
      'missing_usable_meal_rhythm',
    );
  }
  const enabledSlots = getEnabledMealSlots(mealSchedule);

  const destinations: PlanRepeatDestinationResult[] = [];

  for (const dest of command.destinations) {
    if (!isDateInPlanCoverage(dest.dateLocal, coverage)) {
      destinations.push(
        destinationResult({
          dateLocal: dest.dateLocal,
          slotKey: dest.slotKey,
          status: 'out_of_range',
        }),
      );
      continue;
    }

    const occasion = enabledSlots.find((slot) => slot.key === dest.slotKey) ?? null;
    if (!occasion || !occasion.enabled) {
      destinations.push(
        destinationResult({
          dateLocal: dest.dateLocal,
          slotKey: dest.slotKey,
          status: 'occasion_not_enabled',
        }),
      );
      continue;
    }

    try {
      const existing = await resolveExistingStructure({
        personId,
        planId: command.planId,
        dateLocal: dest.dateLocal,
        slotKey: dest.slotKey,
      });
      const before = await occupancyForDestination({
        personId,
        occasion,
        planDayId: existing.planDayId,
        planSlotId: existing.planSlotId,
        sourceMealDocumentId,
      });
      if (before.kind === 'occupied') {
        destinations.push(
          destinationResult({
            dateLocal: dest.dateLocal,
            slotKey: dest.slotKey,
            status: 'occupied_skipped',
            planDayId: existing.planDayId,
            planSlotId: existing.planSlotId,
          }),
        );
        continue;
      }
      if (before.kind === 'reused') {
        destinations.push(
          destinationResult({
            dateLocal: dest.dateLocal,
            slotKey: dest.slotKey,
            status: 'reused',
            planDayId: existing.planDayId,
            planSlotId: existing.planSlotId,
            plannedMealId: before.reusedMealId,
          }),
        );
        continue;
      }

      const ensured = await ensurePlanOccasionStructureForPerson({
        personId,
        command: {
          planId: command.planId,
          dateLocal: dest.dateLocal,
          slotKey: dest.slotKey,
        },
      });

      const afterEnsure = await occupancyForDestination({
        personId,
        occasion,
        planDayId: ensured.planDayId,
        planSlotId: ensured.planSlotId,
        sourceMealDocumentId,
      });
      if (afterEnsure.kind === 'occupied') {
        destinations.push(
          destinationResult({
            dateLocal: dest.dateLocal,
            slotKey: dest.slotKey,
            status: 'occupied_skipped',
            planDayId: ensured.planDayId,
            planSlotId: ensured.planSlotId,
          }),
        );
        continue;
      }
      if (afterEnsure.kind === 'reused') {
        destinations.push(
          destinationResult({
            dateLocal: dest.dateLocal,
            slotKey: dest.slotKey,
            status: 'reused',
            planDayId: ensured.planDayId,
            planSlotId: ensured.planSlotId,
            plannedMealId: afterEnsure.reusedMealId,
          }),
        );
        continue;
      }

      const attached = await attachCanonicalMealForPerson({
        personId,
        planId: command.planId,
        planDayId: ensured.planDayId,
        planSlotId: ensured.planSlotId,
        mealType: mealTypeForSlotKey(dest.slotKey),
        document,
      });

      if (attached.reused) {
        destinations.push(
          destinationResult({
            dateLocal: dest.dateLocal,
            slotKey: dest.slotKey,
            status: 'reused',
            planDayId: ensured.planDayId,
            planSlotId: ensured.planSlotId,
            plannedMealId: attached.meal.id,
          }),
        );
        continue;
      }

      const raced = await occupancyForDestination({
        personId,
        occasion,
        planDayId: ensured.planDayId,
        planSlotId: ensured.planSlotId,
        sourceMealDocumentId,
      });
      const race = resolveRepeatInsertRace({
        insertedMealId: attached.meal.id,
        occupyingMeals: raced.occupyingMeals,
        sourceMealDocumentId,
      });
      if (race.deleteMealId === attached.meal.id) {
        await deletePlannedMeal(personId, attached.meal.id);
        await recomputePlanDayProjection(personId, ensured.planDayId);
        destinations.push(
          destinationResult({
            dateLocal: dest.dateLocal,
            slotKey: dest.slotKey,
            status:
              race.action === 'delete_inserted_and_reuse' ? 'reused' : 'occupied_skipped',
            planDayId: ensured.planDayId,
            planSlotId: ensured.planSlotId,
            plannedMealId: race.winnerMealId,
          }),
        );
        continue;
      }

      destinations.push(
        destinationResult({
          dateLocal: dest.dateLocal,
          slotKey: dest.slotKey,
          status: 'attached',
          planDayId: ensured.planDayId,
          planSlotId: ensured.planSlotId,
          plannedMealId: attached.meal.id,
        }),
      );
    } catch (err) {
      if (err instanceof PlanStructureCommandError) {
        const status =
          err.reasonCode === 'date_outside_plan_coverage'
            ? 'out_of_range'
            : err.reasonCode === 'occasion_not_enabled'
              ? 'occasion_not_enabled'
              : 'failed';
        destinations.push(
          destinationResult({
            dateLocal: dest.dateLocal,
            slotKey: dest.slotKey,
            status,
          }),
        );
        continue;
      }
      destinations.push(
        destinationResult({
          dateLocal: dest.dateLocal,
          slotKey: dest.slotKey,
          status: 'failed',
        }),
      );
    }
  }

  const counts = summarizeRepeatDestinations(destinations);
  return {
    planId: command.planId,
    sourcePlannedMealId: command.sourcePlannedMealId,
    sourceMealDocumentId,
    destinations,
    ...counts,
  };
}
