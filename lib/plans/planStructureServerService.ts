/**
 * Packet 7 — server-side ensure of canonical plan_day / plan_slot structure.
 *
 * Creates only the missing day and the matching enabled Meal Rhythm occasion
 * slot. Does not activate, extend, or replace a plan; does not write
 * planned_meals; does not apply Day Templates / Week Patterns; does not call
 * horizon extension or generate-week.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { getEnabledMealSlots } from '@/lib/journal/mealScheduleAssignment';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import { selectCurrentPlan } from '@/lib/plans/currentPlan';
import { isUsableSavedMealSchedule } from '@/lib/plans/decisioning/usableMealRhythm';
import {
  isDateInPlanCoverage,
  resolvePlanDateCoverage,
} from '@/lib/plans/home/buildGuidance';
import { readPersonMetadata } from '@/lib/plans/personMetadataStore';
import {
  getPlan,
  getPlanDayByDate,
  listPlansForPerson,
  listSlotsForDay,
} from '@/lib/plans/planServerService';
import {
  isPlanDayDateUniqueViolation,
  isPlanSlotOrdinalUniqueViolation,
} from '@/lib/plans/planSlotIdentity';
import { resolvePlanSlotForCreateKey } from '@/lib/plans/resolvePlanSlotForCreateKey';
import type { PlanDay, PlanSlot, ResolvedScheduleSlot } from '@/lib/plans/types';
import {
  PLAN_STRUCTURE_ENSURE_ATTEMPTS,
  PlanStructureCommandError,
  canonicalEnsureSlotOrdinal,
  type EnsurePlanOccasionStructureCommand,
  type EnsurePlanOccasionStructureResult,
} from '@/lib/plans/planStructure/policy';

async function listPlanDayDates(personId: string, planId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('plan_days')
    .select('date_local')
    .eq('plan_id', planId)
    .eq('person_id', personId);
  if (error) throw new Error(`Failed to list plan_days: ${error.message}`);
  return ((data ?? []) as Array<{ date_local: string }>).map((row) => row.date_local);
}

async function insertCanonicalPlanDay(args: {
  personId: string;
  planId: string;
  dateLocal: string;
}): Promise<{ day: PlanDay | null; created: boolean }> {
  const { error } = await supabaseAdmin.from('plan_days').insert({
    person_id: args.personId,
    plan_id: args.planId,
    date_local: args.dateLocal,
    projected_nds_100: 0,
    projected_wfr_10: 0,
    projected_ps_10: 0,
    projected_pnd_10: 0,
    projected_fp_10: 0,
    projected_as_10: 0,
    projected_mnc_10: 0,
    projected_ob_10: 0,
    projection_confidence: 'low',
    projection_debug_json: null,
    notes: null,
    nds_version: NDS_VERSION,
    classifier_version: CLASSIFIER_VERSION,
  });

  if (error) {
    if (error.code === '23505' || isPlanDayDateUniqueViolation(error)) {
      return {
        day: await getPlanDayByDate(args.personId, args.planId, args.dateLocal),
        created: false,
      };
    }
    throw new Error(`Failed to insert plan_day: ${error.message}`);
  }

  return {
    day: await getPlanDayByDate(args.personId, args.planId, args.dateLocal),
    created: true,
  };
}

async function insertCanonicalPlanSlot(args: {
  personId: string;
  planDayId: string;
  occasion: ResolvedScheduleSlot;
  slotOrdinal: number;
  enabledSlots: ResolvedScheduleSlot[];
}): Promise<{ slot: PlanSlot | null; created: boolean }> {
  const { error } = await supabaseAdmin.from('plan_slots').insert({
    person_id: args.personId,
    plan_day_id: args.planDayId,
    slot_block: args.occasion.slot_block,
    slot_ordinal: args.slotOrdinal,
    slot_label: args.occasion.label,
    target_time: args.occasion.target_time,
  });

  if (error) {
    if (isPlanSlotOrdinalUniqueViolation(error)) {
      return { slot: null, created: false };
    }
    throw new Error(`Failed to insert plan_slot: ${error.message}`);
  }

  const slots = await listSlotsForDay(args.personId, args.planDayId);
  return {
    slot: resolvePlanSlotForCreateKey(args.occasion.key, slots, {
      enabledSlots: args.enabledSlots,
    }),
    created: true,
  };
}

export async function ensurePlanOccasionStructureForPerson(args: {
  personId: string;
  command: EnsurePlanOccasionStructureCommand;
}): Promise<EnsurePlanOccasionStructureResult> {
  const { personId, command } = args;
  const plan = await getPlan(personId, command.planId);
  if (!plan) {
    throw new PlanStructureCommandError('Plan not found.', 'plan_not_found', 404);
  }
  if (plan.status !== 'active') {
    throw new PlanStructureCommandError(
      'That plan is not the active plan.',
      'not_canonical_active_plan',
    );
  }

  const current = selectCurrentPlan(await listPlansForPerson(personId));
  if (!current) {
    throw new PlanStructureCommandError(
      'There is no active plan to attach this occasion to.',
      'no_active_plan',
    );
  }
  if (current.id !== command.planId) {
    throw new PlanStructureCommandError(
      'That plan is not the canonical active plan.',
      'not_canonical_active_plan',
    );
  }

  const dayDates = await listPlanDayDates(personId, command.planId);
  const coverage = resolvePlanDateCoverage({
    plan,
    days: dayDates.map((date_local) => ({ date_local })),
  });
  if (!isDateInPlanCoverage(command.dateLocal, coverage)) {
    throw new PlanStructureCommandError(
      'That date is outside the active plan.',
      'date_outside_plan_coverage',
    );
  }

  const meta = await readPersonMetadata(personId);
  const mealSchedule = meta.meal_schedule;
  if (!isUsableSavedMealSchedule(mealSchedule)) {
    throw new PlanStructureCommandError(
      'Set a meal rhythm before filling this occasion.',
      'missing_usable_meal_rhythm',
    );
  }

  const enabledSlots = getEnabledMealSlots(mealSchedule);
  const occasion = enabledSlots.find((slot) => slot.key === command.slotKey) ?? null;
  if (!occasion || !occasion.enabled) {
    throw new PlanStructureCommandError(
      'That occasion is not enabled in your meal rhythm.',
      'occasion_not_enabled',
    );
  }

  if (canonicalEnsureSlotOrdinal({
    enabledSlots,
    slotKey: command.slotKey,
    occupiedOrdinals: [],
  }) == null) {
    throw new PlanStructureCommandError(
      'That occasion is not enabled in your meal rhythm.',
      'occasion_not_enabled',
    );
  }

  let createdDay = false;
  let createdSlot = false;
  let planDay: PlanDay | null = null;
  let planSlot: PlanSlot | null = null;

  for (let attempt = 0; attempt < PLAN_STRUCTURE_ENSURE_ATTEMPTS; attempt += 1) {
    planDay = await getPlanDayByDate(personId, command.planId, command.dateLocal);
    if (!planDay) {
      const insertedDay = await insertCanonicalPlanDay({
        personId,
        planId: command.planId,
        dateLocal: command.dateLocal,
      });
      planDay = insertedDay.day;
      if (insertedDay.created) createdDay = true;
    }
    if (!planDay) continue;

    const slots = await listSlotsForDay(personId, planDay.id);
    planSlot = resolvePlanSlotForCreateKey(command.slotKey, slots, { enabledSlots });
    if (planSlot) break;

    const occupiedOrdinals = slots.map((slot) => slot.slot_ordinal);
    const slotOrdinal = canonicalEnsureSlotOrdinal({
      enabledSlots,
      slotKey: command.slotKey,
      occupiedOrdinals,
    });
    if (slotOrdinal == null) {
      throw new PlanStructureCommandError(
        'That occasion is not enabled in your meal rhythm.',
        'occasion_not_enabled',
      );
    }
    const insertedSlot = await insertCanonicalPlanSlot({
      personId,
      planDayId: planDay.id,
      occasion,
      slotOrdinal,
      enabledSlots,
    });
    if (insertedSlot.slot) {
      if (insertedSlot.created) createdSlot = true;
      planSlot = insertedSlot.slot;
      break;
    }

    const retried = await listSlotsForDay(personId, planDay.id);
    planSlot = resolvePlanSlotForCreateKey(command.slotKey, retried, { enabledSlots });
    if (planSlot) break;
  }

  if (!planDay || !planSlot) {
    throw new PlanStructureCommandError(
      'Could not prepare that occasion. Try again.',
      'structure_write_failed',
    );
  }

  return {
    planId: command.planId,
    dateLocal: command.dateLocal,
    planDayId: planDay.id,
    planSlotId: planSlot.id,
    slotKey: command.slotKey,
    createdDay,
    createdSlot,
    reused: !createdDay && !createdSlot,
  };
}
