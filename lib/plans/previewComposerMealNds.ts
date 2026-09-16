import {
  mealDocumentToPlannedMealPayload,
} from '@/lib/meals/adapters';
import type { PlannedMealAuthoringGroup, MealDocument } from '@/lib/meals/types';
import { recomputeMealNDSShape } from '@/lib/plans/mealNDSShapeRecompute';
import { projectSingleMealAsDay } from '@/lib/plans/projection';
import type { PlannedMeal, PlannedMealType } from '@/lib/plans/types';

/**
 * Shared capture-draft NDS preview used by dated Plans and reusable Day Plans.
 * Pure: no network, no persistence. Returns null when the draft cannot yet
 * support a numeric day-equivalent score.
 */
export function previewComposerMealNds(
  document: MealDocument,
  authoringGroups: PlannedMealAuthoringGroup[],
  mealType: PlannedMealType,
  persistedMeal?: PlannedMeal,
): number | null {
  if (document.components.length === 0 || document.totals?.calories == null) return null;

  const payload = mealDocumentToPlannedMealPayload(document, authoringGroups);
  const derived = recomputeMealNDSShape(document.title, payload);
  const meal: PlannedMeal = persistedMeal
    ? {
        ...persistedMeal,
        name: document.title,
        meal_type: mealType,
        payload,
        ...derived,
      }
    : {
        id: 'composer-preview',
        plan_id: '',
        plan_day_id: '',
        plan_slot_id: null,
        person_id: '',
        name: document.title,
        meal_type: mealType,
        payload,
        source_template_id: document.source.source_template_id ?? null,
        source_imported_meal_id: document.source.source_imported_meal_id ?? null,
        reusable_provenance: null,
        execution_state: 'pending',
        journal_entry_id: null,
        nds_version: document.nds_version ?? '',
        classifier_version: document.classifier_version ?? '',
        created_at: '',
        updated_at: '',
        ...derived,
      };
  const score = projectSingleMealAsDay(meal).nds_score_100;
  return Number.isFinite(score) ? score : null;
}
