/**
 * Meal Object Foundation — Packet 3: Deterministic Recompute Service
 *
 * Pure, deterministic nutrition recompute for canonical `MealComponent[]`.
 * Totals are computed ONLY from component nutrition fields, and ONLY when a
 * component is grounded and its unit/quantity conversion is trusted. Anything
 * ambiguous or ungrounded is surfaced as a structured review issue and the
 * component is marked `needs_review` — never silently recomputed and never
 * assigned invented numbers.
 *
 * CORE RULE — No AI in nutrition math. This module is deterministic code only.
 *
 * SCOPE / SAFETY (P3):
 *   - No AI, no food search, no Supabase, no fetch, no network, no DB.
 *   - No server-only imports. Usable from future client OR server code.
 *   - Pure functions: inputs are never mutated. Callers receive new objects.
 *   - NOT wired into any runtime API/page/component. Additive only.
 *   - NDS is NOT recomputed here. `MealDocument.nds` nullability is preserved
 *     verbatim (see recomputeMealDocumentNutrition).
 *
 * Reuses the existing deterministic unit primitives in lib/units/convert.ts
 * (normalizeUnit / findMeasure) for unit interpretation, but guards every path
 * so an unknown/unconvertible unit becomes a review issue rather than a silent
 * fallback guess.
 *
 * FLOATING-POINT ROUNDING (documented + stable):
 *   All scaled and summed values are rounded to ROUNDING_DECIMALS (default 2)
 *   decimal places via half-up rounding with an epsilon nudge:
 *       round(x) = Math.round((x + Number.EPSILON) * 10^d) / 10^d
 *   Each component contribution is rounded BEFORE summation, and the final
 *   totals are rounded again. This makes results stable across runs and avoids
 *   binary artifacts (e.g. 0.1 + 0.2 → 0.3, not 0.30000000000000004).
 *
 * Source of truth: docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md (§5 recompute
 * policy, §11 migrations). See also the packet brief recompute policy.
 */

import { findMeasure, normalizeUnit } from '@/lib/units/convert';

import type {
  CanonicalMacros,
  MealComponent,
  MealDocument,
  MealNutrition,
} from './types';

// ============================================================================
// Constants
// ============================================================================

/** Decimal places every scaled/summed value is rounded to. */
export const ROUNDING_DECIMALS = 2;

/**
 * Relative tolerance used when cross-checking a unit-derived gram amount
 * against an explicit `quantity_g`. 1% (with a tiny absolute floor) absorbs
 * benign rounding while still catching genuine contradictions.
 */
const GRAM_AGREEMENT_TOLERANCE = 0.01;

// ============================================================================
// Issue model
// ============================================================================

/**
 * Why a component could not be safely recomputed. Each code maps to the audit
 * §5 policy decisions:
 *   - ungrounded_component       no nutrition AND no grounded food object.
 *   - missing_component_nutrition grounded, but carries no nutrition fields
 *                                 (P3 cannot fetch nutrients from the DB).
 *   - missing_conversion_basis   has quantity but no unit / no serving-size
 *                                 basis to scale per-serving nutrition.
 *   - unit_not_comparable        unit string cannot be interpreted (unknown
 *                                 measure not present in `measures`).
 *   - conflicting_nutrition_basis internal contradiction (e.g. unit-derived
 *                                 grams disagree with `quantity_g`).
 *   - untrusted_grounding        match_status guessed / none — never silently
 *                                 recomputed (prefer review over math).
 *   - flagged_for_review         component arrived already `needs_review`.
 */
export type MealRecomputeIssueCode =
  | 'ungrounded_component'
  | 'missing_component_nutrition'
  | 'missing_conversion_basis'
  | 'unit_not_comparable'
  | 'conflicting_nutrition_basis'
  | 'untrusted_grounding'
  | 'flagged_for_review';

/** A single structured review issue tied to a component. */
export interface MealRecomputeIssue {
  component_id: string;
  component_index: number;
  code: MealRecomputeIssueCode;
  message: string;
}

// ============================================================================
// Scale-factor model
// ============================================================================

/** How a component's scale factor was derived. */
export type MealScaleBasis =
  | 'absolute' // per_component nutrition — already the contribution (factor 1)
  | 'servings' // per_serving nutrition × serving count
  | 'grams' // grams → servings via serving_size_g
  | 'household_measure'; // measure → grams → servings via serving_size_g

/**
 * Result of deriving a deterministic scale factor for one component. When
 * `ok` is false the `code` explains why the factor could not be derived.
 */
export type MealComponentScaleResult =
  | { ok: true; factor: number; basis: MealScaleBasis }
  | { ok: false; code: MealRecomputeIssueCode };

// ============================================================================
// Per-component + document recompute results
// ============================================================================

export interface MealComponentRecomputeResult {
  component_id: string;
  index: number;
  /** 'recomputed' ⇒ contribution is included in the meal totals. */
  status: 'recomputed' | 'needs_review';
  /** The contribution included in totals when recomputed; null otherwise. */
  nutrition: MealNutrition | null;
  /** Scale factor applied to the component's base nutrition (null on review). */
  scale_factor: number | null;
  scale_basis: MealScaleBasis | null;
  /** Review issues for THIS component (empty when recomputed). */
  issues: MealRecomputeIssue[];
  /**
   * A CLONE of the input component with `needs_review` reconciled (true for a
   * review result, false for a recomputed one). The input is never mutated.
   */
  component: MealComponent;
}

export interface MealRecomputeResult {
  /** Sum of the safely-recomputed component contributions (rounded). */
  totals: MealNutrition;
  /** Per-component breakdown, index-aligned with the input array. */
  components: MealComponentRecomputeResult[];
  /** True when ANY component could not be safely recomputed. */
  needs_review: boolean;
  recomputed_count: number;
  review_count: number;
  /** Flattened issues across all components. */
  issues: MealRecomputeIssue[];
}

export interface MealRecomputeOptions {
  /** Decimal places to round to. Defaults to ROUNDING_DECIMALS (2). */
  roundingDecimals?: number;
}

export interface MealDocumentRecomputeResult {
  /**
   * A CLONE of the input document with recomputed `totals`, review-reconciled
   * `components`, and `review_state` upgraded to 'needs_review' when any
   * component needs review. NDS fields are passed through untouched (the
   * nullability of `nds` is preserved — P3 never computes NDS).
   */
  document: MealDocument;
  recompute: MealRecomputeResult;
}

// ============================================================================
// Numeric helpers (pure)
// ============================================================================

/** Half-up rounding with an epsilon nudge for binary-float stability. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function scaleValue(
  value: number | null | undefined,
  factor: number,
  decimals: number,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return roundTo(value * factor, decimals);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Relative agreement check between a unit-derived gram amount and quantity_g. */
function gramsAgree(a: number, b: number): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= GRAM_AGREEMENT_TOLERANCE * scale;
}

function hasAnyNutrition(component: MealComponent): boolean {
  const m = component.macros;
  return (
    component.calories != null ||
    m.protein_g != null ||
    m.carbs_g != null ||
    m.fat_g != null ||
    m.fiber_g != null ||
    m.added_sugar_g != null
  );
}

/** A component is grounded for recompute when its match status is trusted. */
function hasTrustedGrounding(component: MealComponent): boolean {
  return (
    component.match_status === 'matched' ||
    component.match_status === 'partial' ||
    component.source_kind === 'user_entered'
  );
}

function cloneComponent(
  component: MealComponent,
  overrides?: Partial<MealComponent>,
): MealComponent {
  return {
    ...component,
    macros: { ...component.macros },
    ...(component.measures ? { measures: component.measures.map((m) => ({ ...m })) } : {}),
    ...(component.display_snapshot ? { display_snapshot: { ...component.display_snapshot } } : {}),
    ...(component.nutrition_snapshot
      ? {
          nutrition_snapshot: {
            ...component.nutrition_snapshot,
            per_serving: component.nutrition_snapshot.per_serving
              ? {
                  calories: component.nutrition_snapshot.per_serving.calories,
                  macros: { ...component.nutrition_snapshot.per_serving.macros },
                }
              : null,
          },
        }
      : {}),
    ...overrides,
  };
}

// ============================================================================
// Public: scaleMealNutrition
// ============================================================================

/**
 * Scale a nutrition block by a multiplier. Null fields stay null (never
 * invented). Optional macro keys (fiber_g / added_sugar_g) are preserved only
 * when present on the input. Rounded to `decimals` places (default 2).
 */
export function scaleMealNutrition(
  nutrition: MealNutrition,
  factor: number,
  decimals: number = ROUNDING_DECIMALS,
): MealNutrition {
  const m = nutrition.macros;
  const macros: CanonicalMacros = {
    protein_g: scaleValue(m.protein_g, factor, decimals),
    carbs_g: scaleValue(m.carbs_g, factor, decimals),
    fat_g: scaleValue(m.fat_g, factor, decimals),
  };
  if (m.fiber_g !== undefined) macros.fiber_g = scaleValue(m.fiber_g, factor, decimals);
  if (m.added_sugar_g !== undefined) {
    macros.added_sugar_g = scaleValue(m.added_sugar_g, factor, decimals);
  }
  return { calories: scaleValue(nutrition.calories, factor, decimals), macros };
}

// ============================================================================
// Public: scaleTopLevelMealNutrition
//
// Canonical, deterministic mapping from a MealDocument's stored nutrition to the
// nutrition for a chosen number of CONSUMED servings. Single source of truth for
// both the server grouped-log write path (groupedMealLoggingService) and the
// client log picker (AddToLogPanel) so the two never diverge. Pure; never
// mutates the document.
// ============================================================================

/** True when a nutrition block carries at least one non-null value. */
function hasNutritionValues(n: MealNutrition | null | undefined): n is MealNutrition {
  if (!n) return false;
  const m = n.macros;
  return (
    n.calories != null ||
    m.protein_g != null ||
    m.carbs_g != null ||
    m.fat_g != null ||
    m.fiber_g != null ||
    m.added_sugar_g != null
  );
}

/**
 * Whether the document's nutrition is trusted enough to scale to a top-level
 * number. A document flagged needs_review (or carrying any needs_review
 * component) is NOT trusted — its top-level nutrition is left unknown rather
 * than invented (needs-review/unknown ⇒ do not invent).
 */
function isTrustedNutrition(doc: MealDocument): boolean {
  if (doc.review_state === 'needs_review') return false;
  return !doc.components.some((c) => c.needs_review);
}

/**
 * The document's effective per-serving yield, when a SAFE basis exists:
 *   - a confirmed yield with positive servings, else
 *   - a positive recipe_yield_servings mirror.
 * Returns null when no safe servings basis is known.
 */
function effectiveYieldServings(doc: MealDocument): number | null {
  if (doc.yield && doc.yield.confirmed && isPositiveNumber(doc.yield.servings)) {
    return doc.yield.servings;
  }
  if (isPositiveNumber(doc.recipe_yield_servings)) return doc.recipe_yield_servings;
  return null;
}

/**
 * Deterministically scale a MealDocument's top-level nutrition to the amount
 * actually consumed. Pure; never mutates `document`. Returns null whenever the
 * result cannot be derived SAFELY (so callers omit top-level numbers rather than
 * inventing them).
 *
 * Priority:
 *   1. Trusted per-serving nutrition × consumed_servings (the primary path; a
 *      confirmed import may carry per-serving estimates with null totals).
 *   2. Totals with a safe per-serving basis: totals ÷ confirmed yield × consumed.
 *   3. A single-serving document (no yield concept at all): totals describe one
 *      serving, so totals × consumed.
 *   4. Otherwise null — totals exist but there is no safe per-serving basis.
 */
export function scaleTopLevelMealNutrition(
  document: MealDocument,
  consumedServings: number,
): MealNutrition | null {
  if (!isTrustedNutrition(document)) return null;
  if (!isPositiveNumber(consumedServings)) return null;

  // (1) Trusted per-serving nutrition — scale directly.
  if (hasNutritionValues(document.per_serving)) {
    return scaleMealNutrition(document.per_serving, consumedServings);
  }

  // (2)/(3)/(4) Fall back to totals only where a safe basis exists.
  if (hasNutritionValues(document.totals)) {
    const yieldServings = effectiveYieldServings(document);
    if (yieldServings != null) {
      const perServing =
        yieldServings === 1
          ? document.totals
          : scaleMealNutrition(document.totals, 1 / yieldServings);
      return scaleMealNutrition(perServing, consumedServings);
    }
    // No yield concept at all ⇒ totals already describe a single serving.
    if (document.yield == null && document.recipe_yield_servings == null) {
      return scaleMealNutrition(document.totals, consumedServings);
    }
    // Totals exist but no safe per-serving basis — do not invent.
    return null;
  }

  return null;
}

// ============================================================================
// Public: deriveComponentScaleFactor
// ============================================================================

/**
 * Derive the deterministic factor that maps a component's STORED nutrition to
 * its actual contribution at the stored quantity.
 *
 *   - nutrition_basis 'per_component': the stored nutrition is already the
 *     contribution ⇒ factor 1 ('absolute'). Units are irrelevant.
 *   - nutrition_basis 'per_serving': the stored nutrition is per ONE serving;
 *     the factor is the number of servings the quantity represents, derived
 *     from (in priority) explicit unit, then grams.
 *
 * Returns a failure code instead of guessing when the conversion is unsafe.
 */
export function deriveComponentScaleFactor(
  component: MealComponent,
): MealComponentScaleResult {
  if (component.nutrition_basis === 'per_component') {
    return { ok: true, factor: 1, basis: 'absolute' };
  }

  // per_serving: derive the number of servings.
  const ssg = isPositiveNumber(component.serving_size_g)
    ? component.serving_size_g
    : null;
  const qty = component.quantity;
  const qg = isNonNegativeNumber(component.quantity_g) ? component.quantity_g : null;
  const rawUnit = component.unit;

  // ----- Path A: an explicit unit is provided -----
  if (rawUnit != null && rawUnit.trim() !== '') {
    const norm = normalizeUnit(rawUnit);

    if (norm === 'serving') {
      if (!isPositiveNumber(qty)) return { ok: false, code: 'missing_conversion_basis' };
      if (qg != null && ssg != null && !gramsAgree(qg, qty * ssg)) {
        return { ok: false, code: 'conflicting_nutrition_basis' };
      }
      return { ok: true, factor: qty, basis: 'servings' };
    }

    if (norm === 'g') {
      if (!isPositiveNumber(qty)) return { ok: false, code: 'missing_conversion_basis' };
      if (ssg == null) return { ok: false, code: 'missing_conversion_basis' };
      // unit 'g' ⇒ quantity is itself a gram amount; it must agree with quantity_g.
      if (qg != null && !gramsAgree(qg, qty)) {
        return { ok: false, code: 'conflicting_nutrition_basis' };
      }
      return { ok: true, factor: qty / ssg, basis: 'grams' };
    }

    // Household measure unit (cup, tbsp, oz, ...).
    const measure = findMeasure(norm, component.measures);
    if (!measure || !isPositiveNumber(measure.grams)) {
      return { ok: false, code: 'unit_not_comparable' };
    }
    if (!isPositiveNumber(qty)) return { ok: false, code: 'missing_conversion_basis' };
    if (ssg == null) return { ok: false, code: 'missing_conversion_basis' };
    const grams = qty * measure.grams;
    if (qg != null && !gramsAgree(qg, grams)) {
      return { ok: false, code: 'conflicting_nutrition_basis' };
    }
    return { ok: true, factor: grams / ssg, basis: 'household_measure' };
  }

  // ----- Path B: no unit, but a canonical gram amount is known -----
  if (qg != null) {
    if (ssg == null) return { ok: false, code: 'missing_conversion_basis' };
    return { ok: true, factor: qg / ssg, basis: 'grams' };
  }

  // ----- Path C: nothing usable to scale per-serving nutrition -----
  return { ok: false, code: 'missing_conversion_basis' };
}

// ============================================================================
// Public: markComponentNeedsNutritionReview
// ============================================================================

/**
 * Return a CLONE of `component` flagged `needs_review = true`. The `reason` is
 * surfaced through the recompute issue list (the canonical MealComponent has
 * no field to persist a reason), so it is accepted for caller symmetry and not
 * stored on the component. Never mutates the input.
 */
export function markComponentNeedsNutritionReview(
  component: MealComponent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reason?: string,
): MealComponent {
  return cloneComponent(component, { needs_review: true });
}

// ============================================================================
// Public: canRecomputeComponent
// ============================================================================

/** True when the component can be safely, deterministically recomputed. */
export function canRecomputeComponent(component: MealComponent): boolean {
  return analyzeComponent(component, 0, ROUNDING_DECIMALS).status === 'recomputed';
}

// ============================================================================
// Internal: analyze one component
// ============================================================================

const ISSUE_MESSAGES: Record<MealRecomputeIssueCode, string> = {
  ungrounded_component:
    'component has no nutrition fields and no grounded food object; nutrition cannot be invented',
  missing_component_nutrition:
    'component is grounded but carries no nutrition fields; P3 does not fetch nutrients from the database',
  missing_conversion_basis:
    'per-serving nutrition cannot be scaled: quantity is present but there is no unit or serving-size basis',
  unit_not_comparable:
    'unit cannot be interpreted (unknown household measure); not comparable to servings or grams',
  conflicting_nutrition_basis:
    'unit-derived grams disagree with quantity_g; recompute prefers review over silent math',
  untrusted_grounding:
    'match_status is guessed/none; component is preserved and flagged rather than silently recomputed',
  flagged_for_review:
    'component arrived already flagged needs_review; preserved without silent recompute',
};

function analyzeComponent(
  component: MealComponent,
  index: number,
  decimals: number,
): MealComponentRecomputeResult {
  const review = (code: MealRecomputeIssueCode): MealComponentRecomputeResult => ({
    component_id: component.component_id,
    index,
    status: 'needs_review',
    nutrition: null,
    scale_factor: null,
    scale_basis: null,
    issues: [
      {
        component_id: component.component_id,
        component_index: index,
        code,
        message: ISSUE_MESSAGES[code],
      },
    ],
    component: markComponentNeedsNutritionReview(component, ISSUE_MESSAGES[code]),
  });

  const hasNutrition = hasAnyNutrition(component);
  const hasFoodObject = component.food_object_id != null && component.food_object_id !== '';
  const isRecipeReference =
    component.component_kind === 'recipe_document' ||
    (typeof component.recipe_meal_document_id === 'string' &&
      component.recipe_meal_document_id.trim().length > 0);

  // Package 5A — recipe references contribute via immutable nutrition_snapshot
  // (also copied onto calories/macros at attach time).
  if (isRecipeReference) {
    const snapshot = component.nutrition_snapshot;
    const snapshotNutrition = snapshot?.per_serving ?? null;
    const snapshotHasNutrition =
      !!snapshotNutrition &&
      (snapshotNutrition.calories != null ||
        snapshotNutrition.macros.protein_g != null ||
        snapshotNutrition.macros.carbs_g != null ||
        snapshotNutrition.macros.fat_g != null);
    const baseNutrition: MealNutrition | null = hasNutrition
      ? { calories: component.calories, macros: component.macros }
      : snapshotHasNutrition
        ? snapshotNutrition
        : null;

    if (!baseNutrition || snapshot?.status === 'unavailable') {
      return review('missing_component_nutrition');
    }
    if (component.needs_review === true && snapshot?.status !== 'available') {
      return review('flagged_for_review');
    }

    const quantity =
      typeof component.quantity === 'number' && Number.isFinite(component.quantity)
        ? component.quantity
        : null;
    if (quantity == null || quantity < 0) return review('missing_conversion_basis');

    const nutrition = scaleMealNutrition(baseNutrition, quantity, decimals);
    return {
      component_id: component.component_id,
      index,
      status: 'recomputed',
      nutrition,
      scale_factor: quantity,
      scale_basis: 'servings',
      issues: [],
      component: cloneComponent(component, {
        needs_review: snapshot?.status === 'estimated' ? component.needs_review : false,
        nutrition_basis: 'per_serving',
      }),
    };
  }

  // (5) Ungrounded: no nutrition AND no grounded food object. Don't invent.
  if (!hasNutrition && !hasFoodObject) return review('ungrounded_component');

  // Grounded but no nutrition numbers — P3 cannot resolve via DB.
  if (!hasNutrition) return review('missing_component_nutrition');

  // (4)/(7) Untrusted grounding — preserve + flag, never silently recompute.
  if (!hasTrustedGrounding(component)) return review('untrusted_grounding');

  // Respect an explicit inbound review flag (prefer review over silent math).
  if (component.needs_review === true) return review('flagged_for_review');

  // (4)/(6) Derive the deterministic scale factor.
  const scale = deriveComponentScaleFactor(component);
  if (!scale.ok) return review(scale.code);

  // (1)/(2)/(3) Safe to recompute deterministically.
  const base: MealNutrition = { calories: component.calories, macros: component.macros };
  const nutrition = scaleMealNutrition(base, scale.factor, decimals);

  return {
    component_id: component.component_id,
    index,
    status: 'recomputed',
    nutrition,
    scale_factor: scale.factor,
    scale_basis: scale.basis,
    issues: [],
    component: cloneComponent(component, { needs_review: false }),
  };
}

// ============================================================================
// Internal: sum recomputed contributions (rounded, null-aware)
// ============================================================================

function sumContributions(
  contributions: MealNutrition[],
  decimals: number,
): MealNutrition {
  let calories: number | null = null;
  let protein: number | null = null;
  let carbs: number | null = null;
  let fat: number | null = null;
  let fiber: number | null = null;
  let sugar: number | null = null;
  let hasFiber = false;
  let hasSugar = false;

  const add = (acc: number | null, value: number | null | undefined): number | null =>
    value == null ? acc : (acc ?? 0) + value;

  for (const n of contributions) {
    calories = add(calories, n.calories);
    protein = add(protein, n.macros.protein_g);
    carbs = add(carbs, n.macros.carbs_g);
    fat = add(fat, n.macros.fat_g);
    if (n.macros.fiber_g !== undefined) {
      hasFiber = true;
      fiber = add(fiber, n.macros.fiber_g);
    }
    if (n.macros.added_sugar_g !== undefined) {
      hasSugar = true;
      sugar = add(sugar, n.macros.added_sugar_g);
    }
  }

  const round = (value: number | null): number | null =>
    value == null ? null : roundTo(value, decimals);

  const macros: CanonicalMacros = {
    protein_g: round(protein),
    carbs_g: round(carbs),
    fat_g: round(fat),
  };
  if (hasFiber) macros.fiber_g = round(fiber);
  if (hasSugar) macros.added_sugar_g = round(sugar);

  return { calories: round(calories), macros };
}

// ============================================================================
// Public: recomputeMealNutrition
// ============================================================================

/**
 * Recompute meal totals from a component list. Totals reflect ONLY the safely
 * recomputed (deterministic) subset; every other component is reported with a
 * structured issue and marked `needs_review`. Inputs are never mutated.
 *
 * An empty list yields empty totals (calories null, macros all null) and
 * needs_review = false.
 */
export function recomputeMealNutrition(
  components: MealComponent[],
  options?: MealRecomputeOptions,
): MealRecomputeResult {
  const decimals = options?.roundingDecimals ?? ROUNDING_DECIMALS;

  const results = components.map((component, index) =>
    analyzeComponent(component, index, decimals),
  );

  const recomputed = results.filter((r) => r.status === 'recomputed');
  const totals = sumContributions(
    recomputed.map((r) => r.nutrition as MealNutrition),
    decimals,
  );

  const issues = results.flatMap((r) => r.issues);
  const reviewCount = results.length - recomputed.length;

  return {
    totals,
    components: results,
    needs_review: reviewCount > 0,
    recomputed_count: recomputed.length,
    review_count: reviewCount,
    issues,
  };
}

// ============================================================================
// Public: recomputeMealDocumentNutrition
// ============================================================================

/**
 * Recompute a document's totals from its components. Returns a CLONE of the
 * document with:
 *   - `totals` set to the recomputed (safe-subset) totals;
 *   - `components` replaced with the review-reconciled clones;
 *   - `review_state` upgraded to 'needs_review' when any component needs review
 *     (otherwise left unchanged — never silently downgraded to 'confirmed').
 *
 * NDS is intentionally NOT touched: `nds`, `nds_version`, and
 * `classifier_version` are passed through verbatim, preserving the nullability
 * of `MealDocument.nds`. P3 does not compute NDS.
 *
 * The input document (and its component array) is never mutated.
 */
export function recomputeMealDocumentNutrition(
  document: MealDocument,
  options?: MealRecomputeOptions,
): MealDocumentRecomputeResult {
  const recompute = recomputeMealNutrition(document.components, options);

  const components = recompute.components.map((r) => r.component);
  const review_state: MealDocument['review_state'] = recompute.needs_review
    ? 'needs_review'
    : document.review_state;

  const nextDocument: MealDocument = {
    ...document,
    components,
    totals: recompute.totals,
    review_state,
    // NDS fields untouched on purpose (preserve nullability; no NDS in P3).
  };

  return { document: nextDocument, recompute };
}
