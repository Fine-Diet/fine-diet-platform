/**
 * Package 3 — Shared pure serving/yield scaling for display & downstream qty.
 *
 * Complements lib/meals/recompute.ts (nutrition scaling). This module scales
 * component quantities for a chosen serving count WITHOUT mutating the
 * canonical MealDocument. Callers that need nutrition should use
 * scaleTopLevelMealNutrition / scaleMealNutrition from recompute.ts.
 *
 * Single calculation layer: quantity' = quantity × (targetServings / baseServings).
 */

import { ROUNDING_DECIMALS, scaleMealNutrition } from './recompute';
import type { MealComponent, MealDocument, MealNutrition } from './types';

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function roundQuantity(value: number, decimals: number = ROUNDING_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Resolve the document's base servings for scaling. Prefer confirmed yield,
 * then recipe_yield_servings, else 1 for assembled meals with no yield.
 * Returns null when yield exists but is not a safe positive basis.
 */
export function resolveBaseServings(doc: Pick<
  MealDocument,
  'yield' | 'recipe_yield_servings'
>): number | null {
  if (doc.yield != null) {
    if (isPositiveNumber(doc.yield.servings)) return doc.yield.servings;
    return null;
  }
  if (isPositiveNumber(doc.recipe_yield_servings)) return doc.recipe_yield_servings;
  return 1;
}

/**
 * Scale factor from base servings → target servings. Null when unsafe.
 */
export function servingScaleFactor(
  baseServings: number | null,
  targetServings: number,
): number | null {
  if (!isPositiveNumber(baseServings) || !isPositiveNumber(targetServings)) {
    return null;
  }
  return targetServings / baseServings;
}

/**
 * Scale component quantities for display/downstream use. Pure; never mutates
 * inputs. Null quantities stay null. Units are unchanged.
 *
 * Factor contract:
 *   - finite factor >= 0 is applied (0 empties amounts)
 *   - negative, NaN, ±Infinity are rejected — return shallow clones unchanged
 *     (never invent negative food quantities)
 */
export function scaleComponentQuantities(
  components: MealComponent[],
  factor: number,
  decimals: number = ROUNDING_DECIMALS,
): MealComponent[] {
  const cloneUnchanged = () =>
    components.map((c) => ({ ...c, macros: { ...c.macros } }));

  if (!Number.isFinite(factor) || factor < 0) {
    return cloneUnchanged();
  }

  return components.map((c) => {
    const quantity =
      c.quantity == null ? null : roundQuantity(c.quantity * factor, decimals);
    const quantity_g =
      c.quantity_g == null || c.quantity_g === undefined
        ? c.quantity_g
        : roundQuantity(c.quantity_g * factor, decimals);
    return {
      ...c,
      quantity,
      ...(quantity_g !== undefined ? { quantity_g } : {}),
      macros: { ...c.macros },
    };
  });
}

export interface ScaledMealView {
  /** Factor applied (target / base). */
  factor: number;
  base_servings: number;
  target_servings: number;
  components: MealComponent[];
  /** Scaled top-level nutrition when safely derivable; else null. */
  nutrition: MealNutrition | null;
}

/**
 * Build a scaled VIEW of a MealDocument for a target serving count.
 * Does NOT mutate the canonical document. Nutrition uses the shared
 * recompute scale helpers (trusted-only).
 */
export function scaleMealDocumentForServings(
  document: MealDocument,
  targetServings: number,
  options?: {
    /** Optional nutrition already scaled by caller; else scale from per_serving. */
    scaleNutrition?: boolean;
  },
): ScaledMealView | null {
  const base = resolveBaseServings(document);
  const factor = servingScaleFactor(base, targetServings);
  if (factor == null || base == null) return null;

  const components = scaleComponentQuantities(document.components, factor);
  let nutrition: MealNutrition | null = null;

  if (options?.scaleNutrition !== false) {
    if (document.per_serving) {
      nutrition = scaleMealNutrition(document.per_serving, targetServings);
    } else if (document.totals && base === 1) {
      nutrition = scaleMealNutrition(document.totals, targetServings);
    } else if (document.totals && isPositiveNumber(base)) {
      const perServing = scaleMealNutrition(document.totals, 1 / base);
      nutrition = scaleMealNutrition(perServing, targetServings);
    }
  }

  return {
    factor,
    base_servings: base,
    target_servings: targetServings,
    components,
    nutrition,
  };
}
