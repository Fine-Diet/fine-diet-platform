/**
 * Pure derivation helpers for the Adjust & log composer.
 *
 * Preview and submitted payload share one code path so servings scaling,
 * component recompute, and grounding cannot diverge.
 */
import { macrosToJournal } from '@/lib/meals/adapters';
import {
  recomputeMealDocumentNutrition,
  scaleMealNutrition,
  scaleTopLevelMealNutrition,
} from '@/lib/meals/recompute';
import type {
  GroupedMealEntryPayload,
  MealComponent,
  MealDocument,
  MealNutrition,
} from '@/lib/meals/types';
import { buildAdjustedPlannedMealIntakePayload } from './plannedMealExecutionPayload';
import { detachComponentGrounding } from '@/lib/meals/componentGrounding';

export interface AdjustedConsumptionDerivationInput {
  baseDocument: MealDocument;
  title: string;
  components: MealComponent[];
  consumedServings: number;
  note?: string | null;
}

export interface AdjustedConsumptionDerivation {
  document: MealDocument;
  /** Nutrition at consumed servings — same basis as the submitted payload. */
  consumedNutrition: MealNutrition | null;
  intakePayload: GroupedMealEntryPayload;
  needsReview: boolean;
}

function cloneComponent(component: MealComponent): MealComponent {
  return {
    ...component,
    macros: { ...component.macros },
    ...(component.measures ? { measures: component.measures.map((m) => ({ ...m })) } : {}),
  };
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeUnit(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function invalidatePerComponentNutrition(component: MealComponent): MealComponent {
  const next = detachComponentGrounding(component);
  next.quantity = component.quantity;
  next.unit = component.unit;
  return next;
}

/**
 * When a per_component row changes quantity only (unit unchanged), scale absolute
 * nutrition proportionally. Unit changes invalidate stale nutrition.
 */
export function updateComponentQuantityAndUnit(
  component: MealComponent,
  nextQuantity: number | null,
  nextUnit: string | null,
): MealComponent {
  const prev = cloneComponent(component);
  const next = cloneComponent(component);
  next.quantity = nextQuantity;
  next.unit = nextUnit;

  const unitChanged = normalizeUnit(prev.unit) !== normalizeUnit(nextUnit);
  const quantityChanged = prev.quantity !== nextQuantity;

  if (!unitChanged && !quantityChanged) return next;

  if (prev.nutrition_basis === 'per_component') {
    if (unitChanged) {
      return invalidatePerComponentNutrition(next);
    }
    if (
      quantityChanged &&
      isPositiveNumber(prev.quantity) &&
      isPositiveNumber(nextQuantity) &&
      prev.calories != null
    ) {
      const ratio = nextQuantity / prev.quantity;
      const scaled = scaleMealNutrition(
        { calories: prev.calories, macros: prev.macros },
        ratio,
      );
      next.calories = scaled.calories;
      next.macros = { ...scaled.macros };
      return next;
    }
    return invalidatePerComponentNutrition(next);
  }

  if (prev.nutrition_basis === 'per_serving') {
    return next;
  }

  if (prev.calories != null || prev.macros.protein_g != null) {
    next.needs_review = true;
  }
  return next;
}

/**
 * Free-text rename of a grounded component detaches canonical identity so stale
 * nutrition cannot ride under a new display name.
 */
export function updateComponentDisplayName(
  component: MealComponent,
  nextName: string,
): MealComponent {
  const trimmed = nextName;
  if (component.food_object_id && trimmed.trim() !== component.name.trim()) {
    return { ...detachComponentGrounding(component), name: trimmed };
  }
  return { ...cloneComponent(component), name: trimmed };
}

export function deriveAdjustedConsumption(
  input: AdjustedConsumptionDerivationInput,
): AdjustedConsumptionDerivation {
  const draft: MealDocument = {
    ...input.baseDocument,
    title: input.title.trim(),
    components: input.components.map(cloneComponent),
  };

  const { document, recompute } = recomputeMealDocumentNutrition(draft);
  const consumedNutrition = scaleTopLevelMealNutrition(document, input.consumedServings);
  const intakePayload = buildAdjustedPlannedMealIntakePayload(document, {
    consumed_servings: input.consumedServings,
    instance_note: input.note ?? null,
  });

  return {
    document,
    consumedNutrition,
    intakePayload,
    needsReview: recompute.needs_review || consumedNutrition == null,
  };
}

export function formatConsumedNutritionPreview(
  nutrition: MealNutrition | null,
  needsReview: boolean,
): string {
  if (needsReview || nutrition == null || nutrition.calories == null) {
    return 'Nutrition preview unavailable — review components before logging.';
  }
  const cal = Math.round(nutrition.calories);
  const protein = nutrition.macros.protein_g;
  const parts = [`${cal} cal`];
  if (protein != null) parts.push(`${Math.round(protein)}g protein`);
  parts.push('updated from components & servings');
  return parts.join(' · ');
}

/** Journal camelCase macros for display cross-checks in tests. */
export function consumedNutritionToJournalMacros(
  nutrition: MealNutrition | null,
): { protein?: number; carbs?: number; fat?: number } {
  return macrosToJournal(nutrition?.macros ?? { protein_g: null, carbs_g: null, fat_g: null });
}
