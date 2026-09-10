import {
  computeQuantities,
  convertBetweenUnits,
  getValidUnits,
  normalizeUnit,
} from '@/lib/units/convert';

import { scaleMealNutrition } from './recompute';
import type { MealComponent } from './types';

function cloneComponent(component: MealComponent): MealComponent {
  return {
    ...component,
    macros: { ...component.macros },
    ...(component.measures
      ? { measures: component.measures.map((measure) => ({ ...measure })) }
      : {}),
  };
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isRecipeReference(component: MealComponent): boolean {
  return (
    component.component_kind === 'recipe_document' ||
    (typeof component.recipe_meal_document_id === 'string' &&
      component.recipe_meal_document_id.trim().length > 0)
  );
}

function hasTrustedFoodGrounding(component: MealComponent): boolean {
  return (
    !isRecipeReference(component) &&
    typeof component.food_object_id === 'string' &&
    component.food_object_id.length > 0 &&
    (component.match_status === 'matched' || component.match_status === 'partial')
  );
}

function canonicalUnits(component: MealComponent): string[] {
  return getValidUnits(component.serving_size_g, component.measures);
}

function gramsAgree(a: number, b: number): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= 0.01 * scale;
}

/**
 * Unit choices backed by this component's canonical serving/measure metadata.
 * The current legacy unit stays visible, but callers must still use the
 * conversion helper before changing to another option.
 */
export function getMealComponentValidUnits(component: MealComponent): string[] {
  const current =
    component.unit && component.unit.trim()
      ? normalizeUnit(component.unit)
      : null;
  if (!hasTrustedFoodGrounding(component)) {
    return current ? [current] : [];
  }
  return Array.from(
    new Set([
      ...(current ? [current] : []),
      ...canonicalUnits(component),
    ]),
  );
}

/**
 * Convert one grounded food component to another display unit while preserving
 * its physical gram amount. Returns null rather than guessing when either side
 * lacks a canonical conversion basis.
 */
export function convertMealComponentDisplayUnit(
  component: MealComponent,
  targetUnit: string,
): { quantity: number; unit: string; quantityG: number | null } | null {
  if (
    !hasTrustedFoodGrounding(component) ||
    !isPositive(component.quantity) ||
    !component.unit?.trim()
  ) {
    return null;
  }
  const fromUnit = normalizeUnit(component.unit);
  const toUnit = normalizeUnit(targetUnit);
  const validUnits = canonicalUnits(component);
  if (!validUnits.includes(fromUnit) || !validUnits.includes(toUnit)) return null;

  const quantity = convertBetweenUnits(
    component.quantity,
    fromUnit,
    toUnit,
    component.serving_size_g,
    component.measures,
  );
  if (!isPositive(quantity)) return null;

  const canonical = computeQuantities(
    toUnit,
    quantity,
    component.serving_size_g,
    component.measures,
  );
  return {
    quantity,
    unit: toUnit,
    quantityG: canonical.quantityG,
  };
}

/**
 * Logged snapshots can contain absolute `per_component` nutrition. When the
 * stored physical amount and canonical serving basis are both trustworthy,
 * recover the immutable per-serving nutrition once so subsequent quantity
 * edits always recompute from that base instead of repeatedly scaling an
 * already-scaled contribution.
 *
 * If recovery is unsafe, retain the unknown snapshot for display but force
 * Needs Review so it cannot remain authoritative after an edit.
 */
export function recoverGroundedPerServingNutrition(
  component: MealComponent,
): MealComponent {
  const next = cloneComponent(component);
  if (
    component.nutrition_basis !== 'per_component' ||
    isRecipeReference(component)
  ) {
    return next;
  }
  if (
    !hasTrustedFoodGrounding(component) ||
    !isPositive(component.quantity) ||
    !component.unit?.trim()
  ) {
    next.needs_review = true;
    return next;
  }

  const unit = normalizeUnit(component.unit);
  const validUnits = canonicalUnits(component);
  if (!validUnits.includes(unit)) {
    next.needs_review = true;
    return next;
  }
  if (
    unit !== 'serving' &&
    !isPositive(component.serving_size_g)
  ) {
    next.needs_review = true;
    return next;
  }

  const amount = computeQuantities(
    unit,
    component.quantity,
    component.serving_size_g,
    component.measures,
  );
  if (
    !isPositive(amount.servingQty) ||
    (component.quantity_g != null &&
      amount.quantityG != null &&
      !gramsAgree(component.quantity_g, amount.quantityG))
  ) {
    next.needs_review = true;
    return next;
  }

  const perServing = scaleMealNutrition(
    { calories: component.calories, macros: component.macros },
    1 / amount.servingQty,
  );
  next.calories = perServing.calories;
  next.macros = { ...perServing.macros };
  next.nutrition_basis = 'per_serving';
  next.quantity_g = amount.quantityG;
  return next;
}

/**
 * Resolve canonical grams for a quantity edit. This is intentionally strict:
 * unknown units return null so callers can mark review instead of inheriting
 * computeQuantities' legacy unknown-unit fallback.
 */
export function resolveMealComponentAmount(
  component: MealComponent,
  quantity: number | null,
  unit: string | null,
): { unit: string; quantityG: number | null } | null {
  if (!isPositive(quantity) || !unit?.trim()) return null;
  const normalized = normalizeUnit(unit);
  if (!canonicalUnits(component).includes(normalized)) return null;
  const amount = computeQuantities(
    normalized,
    quantity,
    component.serving_size_g,
    component.measures,
  );
  return { unit: normalized, quantityG: amount.quantityG };
}
