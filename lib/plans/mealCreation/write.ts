/**
 * Canonical Packet 3 writes: MealDocument create, then planned_meals pointer.
 * Never posts journal log / execute / log-instance.
 */

import type { MealDocument } from '@/lib/meals/types';
import { planService } from '@/lib/plans/planService';
import { buildExistingMealAttachBody, resolveCanonicalSlotAttachAction } from './attach';
import type { PlannedMealType } from '@/lib/plans/types';

const DOCUMENT_CREATE_PATH = '/api/journal/meals/documents';
const PLANNED_MEAL_CREATE_PATH = '/api/journal/plans/meals';

export const MEAL_CREATION_WRITE_PATHS = {
  documentCreate: DOCUMENT_CREATE_PATH,
  plannedMealCreate: PLANNED_MEAL_CREATE_PATH,
} as const;

export async function createCanonicalSimpleMeal(
  document: MealDocument,
): Promise<{ ok: true; document: MealDocument } | { ok: false; error: string }> {
  const body = { ...document, person_id: null, id: null };
  try {
    const res = await fetch(DOCUMENT_CREATE_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      document?: MealDocument;
      error?: string;
    };
    if (!res.ok || !json.document?.id) {
      return { ok: false, error: json.error ?? 'Could not save this meal.' };
    }
    return { ok: true, document: json.document };
  } catch {
    return { ok: false, error: 'Could not save this meal.' };
  }
}

export async function fetchCanonicalMealDocument(
  documentId: string,
): Promise<{ ok: true; document: MealDocument } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/journal/meals/documents/${encodeURIComponent(documentId)}`, {
      credentials: 'include',
    });
    const json = (await res.json().catch(() => ({}))) as {
      document?: MealDocument;
      error?: string;
    };
    if (!res.ok || !json.document?.id) {
      return { ok: false, error: json.error ?? 'Could not load that meal.' };
    }
    return { ok: true, document: json.document };
  } catch {
    return { ok: false, error: 'Could not load that meal.' };
  }
}

export async function attachCanonicalMealToPlan(args: {
  planId: string;
  planDayId: string;
  planSlotId: string;
  mealType: PlannedMealType;
  document: MealDocument;
}): Promise<{ ok: true; reused: boolean } | { ok: false; error: string }> {
  try {
    if (!args.document.id) {
      return { ok: false, error: 'Existing meal attach requires a canonical MealDocument id.' };
    }
    const detail = await planService.getDetail(args.planId);
    const decision = resolveCanonicalSlotAttachAction({
      meals: detail.meals,
      planId: args.planId,
      planSlotId: args.planSlotId,
      documentId: args.document.id,
    });
    if (decision.action === 'reuse') {
      return { ok: true, reused: true };
    }
    const body = buildExistingMealAttachBody(args);
    await planService.createMeal({
      plan_id: body.plan_id,
      plan_day_id: body.plan_day_id,
      plan_slot_id: body.plan_slot_id,
      name: body.name,
      meal_type: body.meal_type,
      payload: body.payload,
    });
    return { ok: true, reused: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not add this meal to the plan.',
    };
  }
}
