/**
 * Package 4 — pure MealDocument pointer helpers for planned_meals payloads.
 * Safe for client and server. Server attach gates live in mealDocumentPlanAttach.ts.
 */

import { resolveBaseServings } from '@/lib/meals/servingScale';
import type { MealDocument } from '@/lib/meals/types';

export function readSourceMealDocumentId(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload) return null;
  const value = payload.source_meal_document_id;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function stampPlannedMealDocumentPointer(
  payload: Record<string, unknown>,
  doc: Pick<MealDocument, 'id' | 'yield' | 'recipe_yield_servings'>,
  plannedServings?: number | null,
): Record<string, unknown> {
  if (!doc.id) return payload;
  const servings =
    typeof plannedServings === 'number' && Number.isFinite(plannedServings) && plannedServings > 0
      ? plannedServings
      : resolveBaseServings(doc);
  return {
    ...payload,
    source_meal_document_id: doc.id,
    planned_servings: servings,
    // Snapshot label: payload items/totals are schedule resilience, not library truth.
    meal_document_snapshot: true,
  };
}

export function isMealDocumentArchived(
  doc: Pick<MealDocument, 'lifecycle_state' | 'archived_at'>,
): boolean {
  if (doc.lifecycle_state === 'archived') return true;
  return typeof doc.archived_at === 'string' && doc.archived_at.trim().length > 0;
}
