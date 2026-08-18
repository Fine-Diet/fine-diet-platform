/**
 * Packet 3 canonical MealDocument attach as a shared internal server command.
 *
 * Pointer-only: stamps `source_meal_document_id`, reuses the existing
 * planned-meal row for the same plan/slot/document, otherwise inserts.
 * Does not ensure plan_day/plan_slot structure and does not overwrite
 * a different meal already on the slot.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { buildExistingMealAttachBody } from '@/lib/plans/mealCreation/attach';
import {
  findExistingCanonicalSlotAttach,
  readSourceMealDocumentId,
} from '@/lib/plans/mealDocumentPlanPointer';
import {
  getPlan,
  insertPlannedMeal,
  listMealsForDay,
  recomputeMealNDSShape,
  recomputePlanDayProjection,
} from '@/lib/plans/planServerService';
import { PlanNotFoundError, PlanRequestValidationError } from '@/lib/plans/planRequestErrors';
import type { MealDocument } from '@/lib/meals/types';
import type { PlannedMeal, PlannedMealType } from '@/lib/plans/types';

export async function attachCanonicalMealForPerson(args: {
  personId: string;
  planId: string;
  planDayId: string;
  planSlotId: string;
  mealType: PlannedMealType;
  document: MealDocument;
}): Promise<{ meal: PlannedMeal; reused: boolean }> {
  if (!args.document.id) {
    throw new PlanRequestValidationError(
      'Existing meal attach requires a canonical MealDocument id.',
    );
  }

  const plan = await getPlan(args.personId, args.planId);
  if (!plan) throw new PlanNotFoundError('Plan not found.');

  const { data: dayRow, error: dayErr } = await supabaseAdmin
    .from('plan_days')
    .select('id, plan_id, person_id')
    .eq('id', args.planDayId)
    .eq('person_id', args.personId)
    .maybeSingle();
  if (dayErr) throw new Error(`Failed to load plan_day: ${dayErr.message}`);
  if (!dayRow || dayRow.plan_id !== args.planId) {
    throw new PlanNotFoundError('Plan day not found under this plan.');
  }

  const { data: slotRow, error: slotErr } = await supabaseAdmin
    .from('plan_slots')
    .select('id, plan_day_id, person_id')
    .eq('id', args.planSlotId)
    .eq('person_id', args.personId)
    .maybeSingle();
  if (slotErr) throw new Error(`Failed to load plan_slot: ${slotErr.message}`);
  if (!slotRow || slotRow.plan_day_id !== args.planDayId) {
    throw new PlanNotFoundError('Slot not found under this day.');
  }

  const body = buildExistingMealAttachBody({
    planId: args.planId,
    planDayId: args.planDayId,
    planSlotId: args.planSlotId,
    mealType: args.mealType,
    document: args.document,
  });
  const sourceMealDocumentId = readSourceMealDocumentId(body.payload);
  if (!sourceMealDocumentId || sourceMealDocumentId !== args.document.id) {
    throw new PlanRequestValidationError(
      'Existing meal attach requires a canonical MealDocument id.',
    );
  }

  const existingMeals = await listMealsForDay(args.personId, args.planDayId);
  const existing = findExistingCanonicalSlotAttach({
    meals: existingMeals,
    planId: args.planId,
    planSlotId: args.planSlotId,
    sourceMealDocumentId,
  });
  if (existing) {
    return { meal: existing, reused: true };
  }

  const derived = recomputeMealNDSShape(body.name, body.payload as {
    items?: Array<{ food_object_id?: string | null; calories?: number | null }>;
    totals?: { calories?: number; protein_g?: number };
  });

  const meal = await insertPlannedMeal({
    personId: args.personId,
    planId: args.planId,
    planDayId: args.planDayId,
    planSlotId: args.planSlotId,
    name: body.name,
    meal_type: body.meal_type,
    payload: body.payload,
    protein_score_10: derived.protein_score_10,
    is_main_meal: derived.is_main_meal,
    psq_multiplier: derived.psq_multiplier,
    meal_derived_data: derived.meal_derived_data as unknown as Record<string, unknown>,
    nds_confidence: derived.nds_confidence,
  });

  await recomputePlanDayProjection(args.personId, args.planDayId);
  return { meal, reused: false };
}
