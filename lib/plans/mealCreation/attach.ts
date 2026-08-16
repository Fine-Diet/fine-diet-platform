/**
 * Pure planned-meal attach payload for an existing canonical MealDocument.
 * Pointer only — never clones the library row, never writes journal logs.
 */

import { mealDocumentToPlannedMealPayload } from '@/lib/meals/adapters';
import type { MealDocument } from '@/lib/meals/types';
import {
  findExistingCanonicalSlotAttach,
  stampPlannedMealDocumentPointer,
  type CanonicalSlotAttachMeal,
} from '@/lib/plans/mealDocumentPlanPointer';
import type { PlannedMealType } from '@/lib/plans/types';

export { findExistingCanonicalSlotAttach };

export function buildExistingMealAttachBody(args: {
  planId: string;
  planDayId: string;
  planSlotId: string;
  mealType: PlannedMealType;
  document: MealDocument;
}): {
  plan_id: string;
  plan_day_id: string;
  plan_slot_id: string;
  name: string;
  meal_type: PlannedMealType;
  payload: Record<string, unknown>;
} {
  if (!args.document.id) {
    throw new Error('Existing meal attach requires a canonical MealDocument id.');
  }
  const payload = stampPlannedMealDocumentPointer(
    mealDocumentToPlannedMealPayload(args.document) as Record<string, unknown>,
    args.document,
  );
  return {
    plan_id: args.planId,
    plan_day_id: args.planDayId,
    plan_slot_id: args.planSlotId,
    name: args.document.title.trim(),
    meal_type: args.mealType,
    payload,
  };
}

export function attachBodyUsesCanonicalId(
  body: ReturnType<typeof buildExistingMealAttachBody>,
  documentId: string,
): boolean {
  return body.payload.source_meal_document_id === documentId;
}

export function resolveCanonicalSlotAttachAction(args: {
  meals: readonly CanonicalSlotAttachMeal[];
  planId: string;
  planSlotId: string;
  documentId: string;
}): { action: 'reuse'; mealId: string } | { action: 'insert' } {
  const existing = findExistingCanonicalSlotAttach({
    meals: args.meals,
    planId: args.planId,
    planSlotId: args.planSlotId,
    sourceMealDocumentId: args.documentId,
  });
  if (existing) return { action: 'reuse', mealId: existing.id };
  return { action: 'insert' };
}
