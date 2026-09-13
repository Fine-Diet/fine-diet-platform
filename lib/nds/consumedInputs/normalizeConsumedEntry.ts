/**
 * Pure normalization of one consumed journal entry into canonical NDS inputs.
 *
 * NDS-01 checkpoint A. Nothing here touches the database, the network, or the
 * clock. Food evidence is injected by the caller so the same function drives
 * both the server resolver and the regression matrix.
 *
 * Quantity-basis rules (the audited double-scaling defect):
 *
 *   flat food     payload.calories/macros are PER SERVING and scale with
 *                 payload.quantity, which the write boundary already normalized
 *                 to a serving multiplier (lib/units/convert.ts).
 *   grouped meal  payload.calories/macros are ALREADY-CONSUMED TOTALS. They are
 *                 counted exactly once; the applied multiplier is 1.
 *
 * Component scaling reuses `deriveComponentScaleFactor` from lib/meals/recompute
 * (stored nutrition -> contribution at the stored quantity) and then applies the
 * document-to-consumed factor, which mirrors `scaleTopLevelMealNutrition`:
 * recipes divide by their yield, single-serving meals do not.
 */

import type {
  CanonicalMacros,
  MealComponent,
  MealComponentKind,
  MealNutrition,
  MealNutritionBasis,
} from '@/lib/meals/types';
import { deriveComponentScaleFactor } from '@/lib/meals/recompute';
import { attributeConsumedDay } from '../dayIdentity';
import type {
  ConsumedEntryShape,
  ConsumedEvidenceProvenance,
  ConsumedFoodEvidence,
  ConsumedQuantityBasis,
  NormalizationIssue,
  NormalizationIssueCode,
  NormalizedConsumedComponent,
  NormalizedConsumedDay,
  NormalizedConsumedEntry,
  NormalizedMicronutrients,
  NormalizedNutrient,
} from './types';
import {
  combineNutrient,
  emptyMicronutrients,
  finiteOrNull,
  MICRONUTRIENT_KEYS,
  NDS_NORMALIZER_VERSION,
  roundTo,
  scaleOrNull,
  unknownNutrient,
} from './types';

// ============================================================================
// Input
// ============================================================================

/** The journal row fields the normalizer needs. */
export interface ConsumedEntryRow {
  id: string;
  person_id: string;
  entry_type: string;
  /** UTC instant as stored (timestamptz serialized). */
  occurred_at: string;
  payload: Record<string, unknown> | null;
  /** Canonical grams column, when the write boundary could derive it. */
  quantity_g?: number | null;
}

export interface NormalizeConsumedEntryOptions {
  /**
   * Food evidence keyed by food object id. The caller decides where each entry
   * came from and stamps `provenance` accordingly; the normalizer only reports
   * what it was given.
   */
  foodEvidence?: ReadonlyMap<string, ConsumedFoodEvidence>;
}

/**
 * Every food object a day's rows refer to, flat entries and grouped components
 * alike.
 *
 * Exported so a caller can load all evidence in ONE query before normalizing,
 * instead of the normalizer reaching into storage per entry. It walks payloads by
 * exactly the same rules the normalizer uses to look evidence up, so a reference
 * can never be fetched but missed, or missed but expected.
 */
export function collectReferencedFoodObjectIds(
  rows: readonly ConsumedEntryRow[],
): string[] {
  const ids = new Set<string>();

  for (const row of rows) {
    if (row.entry_type !== 'intake') continue;
    const payload = isPlainObject(row.payload) ? row.payload : null;
    if (!payload) continue;

    const flatId = nonEmptyString(payload.foodObjectId);
    if (flatId) ids.add(flatId);

    const group = isPlainObject(payload.meal_group) ? payload.meal_group : null;
    const components = group && Array.isArray(group.components) ? group.components : [];
    for (const component of components) {
      if (!isPlainObject(component)) continue;
      const componentId = nonEmptyString(component.food_object_id);
      if (componentId) ids.add(componentId);
    }
  }

  // Array.from, not spread: the build target does not downlevel iteration, so
  // spreading a Set here compiles to an empty array.
  return Array.from(ids);
}

/** Relative tolerance when comparing two independently derived kcal figures. */
const CALORIE_AGREEMENT_TOLERANCE = 0.1;

/** Absolute kcal floor below which a relative mismatch is not meaningful. */
const CALORIE_AGREEMENT_FLOOR = 10;

// ============================================================================
// Small helpers
// ============================================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveOrNull(value: unknown): number | null {
  const numeric = finiteOrNull(value);
  if (numeric === null || numeric <= 0) return null;
  return numeric;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function issue(
  code: NormalizationIssueCode,
  entryId: string,
  detail: string,
  componentId?: string,
): NormalizationIssue {
  return componentId ? { code, entryId, componentId, detail } : { code, entryId, detail };
}

/** Read `payload.macros.<key>` as a known number or null. */
function journalMacro(payload: Record<string, unknown>, key: string): number | null {
  const macros = isPlainObject(payload.macros) ? payload.macros : null;
  if (!macros) return null;
  return finiteOrNull(macros[key]);
}

function canonicalMacro(macros: CanonicalMacros | undefined | null, key: keyof CanonicalMacros): number | null {
  if (!macros) return null;
  return finiteOrNull(macros[key]);
}

function scaleMicronutrients(
  source: NormalizedMicronutrients,
  multiplier: number,
): NormalizedMicronutrients {
  const out = emptyMicronutrients();
  for (const key of MICRONUTRIENT_KEYS) {
    out[key] = scaleOrNull(source[key], multiplier);
  }
  return out;
}

/** Sum one micronutrient across components, keeping unknown distinct from zero. */
function sumMicronutrient(
  components: readonly NormalizedConsumedComponent[],
  key: keyof NormalizedMicronutrients,
): number | null {
  let total = 0;
  let known = false;
  for (const component of components) {
    const value = component.micronutrients[key];
    if (value !== null) {
      total += value;
      known = true;
    }
  }
  return known ? roundTo(total, 4) : null;
}

/** Do two independently derived kcal figures agree closely enough? */
function caloriesAgree(a: number, b: number): boolean {
  const larger = Math.max(Math.abs(a), Math.abs(b));
  if (larger <= CALORIE_AGREEMENT_FLOOR) return true;
  return Math.abs(a - b) / larger <= CALORIE_AGREEMENT_TOLERANCE;
}

// ============================================================================
// Flat food quantity basis
// ============================================================================

/**
 * Resolve the canonical serving multiplier for a legacy flat entry.
 *
 * The write boundary guarantees `payload.quantity` is a serving multiplier and
 * `quantity_g` holds canonical grams (lib/units/convert.ts). Rows that predate
 * that guarantee can carry a raw gram count in `quantity` with `unit: 'g'`.
 * Those are detected against `quantity_g`/`servingSizeG` and converted through
 * the canonical grams basis instead of being multiplied as a serving count.
 */
function resolveFlatQuantityBasis(
  row: ConsumedEntryRow,
  payload: Record<string, unknown>,
  issues: NormalizationIssue[],
): ConsumedQuantityBasis {
  const recordedQuantityRaw = payload.quantity;
  const recordedQuantity = finiteOrNull(recordedQuantityRaw);
  const recordedUnit = nonEmptyString(payload.unit);
  const servingSizeG = positiveOrNull(payload.servingSizeG);
  const columnGrams = finiteOrNull(row.quantity_g);

  if (recordedQuantityRaw !== undefined && recordedQuantity === null) {
    issues.push(
      issue(
        'non_finite_quantity',
        row.id,
        `payload.quantity is not a finite number (${JSON.stringify(recordedQuantityRaw)}); treating consumption as one serving`,
      ),
    );
  }

  let appliedMultiplier = recordedQuantity !== null && recordedQuantity > 0 ? recordedQuantity : 1;
  let consumedGrams = columnGrams;

  const unitIsGrams = recordedUnit !== null && /^(g|gram|grams)$/i.test(recordedUnit);

  if (unitIsGrams && servingSizeG !== null) {
    // Canonical grams basis. Prefer the stored gram column; fall back to
    // treating the recorded quantity as grams only when the column is absent.
    const grams = columnGrams ?? recordedQuantity;
    if (grams !== null && grams > 0) {
      const servingsFromGrams = grams / servingSizeG;
      if (!caloriesAgree(servingsFromGrams, appliedMultiplier)) {
        issues.push(
          issue(
            'grams_not_convertible',
            row.id,
            `unit 'g' entry has quantity=${appliedMultiplier} but ${grams}g / ${servingSizeG}g per serving = ${roundTo(servingsFromGrams, 4)} servings; using the canonical grams basis rather than multiplying grams as servings`,
          ),
        );
        appliedMultiplier = servingsFromGrams;
      }
      consumedGrams = grams;
    }
  } else if (consumedGrams === null && servingSizeG !== null) {
    consumedGrams = roundTo(appliedMultiplier * servingSizeG, 4);
  }

  return {
    kind: 'per_serving_times_quantity',
    appliedMultiplier: roundTo(appliedMultiplier, 6),
    recordedQuantity,
    recordedUnit,
    servingSizeG,
    consumedGrams,
  };
}

// ============================================================================
// Component normalization
// ============================================================================

function inferComponentKind(component: MealComponent): MealComponentKind {
  if (component.component_kind) return component.component_kind;
  if (component.recipe_meal_document_id) return 'recipe_document';
  if (component.food_object_id) return 'food_concept';
  return 'user_entered';
}

/**
 * Nutrition a component contributes at its STORED quantity, plus how that
 * evidence was grounded. Recipe references use their captured snapshot; a
 * missing snapshot stays missing rather than resolving today's mutable recipe.
 */
function resolveComponentStoredNutrition(
  component: MealComponent,
  kind: MealComponentKind,
  entryId: string,
  issues: NormalizationIssue[],
): {
  nutrition: MealNutrition | null;
  provenance: ConsumedEvidenceProvenance;
  evidenceToken: string | null;
  /** Extra factor applied on top of the component scale factor. */
  snapshotServings: number;
} {
  if (kind === 'recipe_document') {
    const snapshot = component.nutrition_snapshot ?? null;
    const perServing = snapshot?.per_serving ?? null;
    if (!snapshot || !perServing || snapshot.status === 'unavailable') {
      issues.push(
        issue(
          'recipe_reference_snapshot_missing',
          entryId,
          `recipe-reference component "${component.name}" has no usable captured nutrition snapshot; historical ingredient detail stays missing rather than being resolved from today's recipe`,
          component.component_id,
        ),
      );
      return {
        nutrition: null,
        provenance: 'unresolved',
        evidenceToken: component.recipe_version_token ?? null,
        snapshotServings: 1,
      };
    }
    // The snapshot is per ONE serving of the referenced recipe; the component
    // quantity says how many of those servings this parent uses.
    const servings = positiveOrNull(component.quantity) ?? 1;
    return {
      nutrition: perServing,
      provenance: 'recipe_reference_snapshot',
      evidenceToken: component.recipe_version_token ?? null,
      snapshotServings: servings,
    };
  }

  const hasOwnNutrition =
    finiteOrNull(component.calories) !== null ||
    canonicalMacro(component.macros, 'protein_g') !== null ||
    canonicalMacro(component.macros, 'carbs_g') !== null ||
    canonicalMacro(component.macros, 'fat_g') !== null ||
    canonicalMacro(component.macros, 'fiber_g') !== null ||
    canonicalMacro(component.macros, 'added_sugar_g') !== null;

  if (!hasOwnNutrition) {
    issues.push(
      issue(
        'food_reference_unresolved',
        entryId,
        `component "${component.name}" carries no nutrition evidence; identity is preserved and its contribution stays unknown`,
        component.component_id,
      ),
    );
    return {
      nutrition: null,
      provenance: 'unresolved',
      evidenceToken: null,
      snapshotServings: 1,
    };
  }

  return {
    nutrition: { calories: component.calories, macros: component.macros },
    provenance: 'instance_snapshot',
    evidenceToken: null,
    snapshotServings: 1,
  };
}

function normalizeComponent(
  component: MealComponent,
  documentToConsumedFactor: number,
  entryId: string,
  foodEvidence: ReadonlyMap<string, ConsumedFoodEvidence> | undefined,
  issues: NormalizationIssue[],
): NormalizedConsumedComponent {
  const kind = inferComponentKind(component);
  const declaredBasis: MealNutritionBasis = component.nutrition_basis ?? 'per_component';

  const scale = deriveComponentScaleFactor({
    ...component,
    nutrition_basis: declaredBasis,
  });

  let storedQuantityFactor = 1;
  if (scale.ok) {
    storedQuantityFactor = scale.factor;
  } else {
    issues.push(
      issue(
        'component_quantity_basis_unknown',
        entryId,
        `component "${component.name}" declares nutrition_basis='${declaredBasis}' but its quantity cannot be converted (${scale.code}); its stored nutrition is used unscaled and flagged rather than guessed`,
        component.component_id,
      ),
    );
  }

  const resolved = resolveComponentStoredNutrition(component, kind, entryId, issues);
  const multiplier = roundTo(
    storedQuantityFactor * resolved.snapshotServings * documentToConsumedFactor,
    6,
  );

  const nutrition = resolved.nutrition;
  const evidence = component.food_object_id
    ? foodEvidence?.get(component.food_object_id)
    : undefined;

  // Quality evidence (processing, micronutrients, omegas) comes from the food
  // reference; quantity comes from the component's own stored nutrition.
  const evidenceServings = evidence ? multiplier : 0;
  const micronutrients = evidence
    ? scaleMicronutrients(
        {
          ...emptyMicronutrients(),
          ...evidence.perServing.micronutrients,
        },
        evidenceServings,
      )
    : emptyMicronutrients();

  return {
    componentId: component.component_id,
    name: component.name,
    componentKind: kind,
    foodObjectId: component.food_object_id ?? null,
    declaredNutritionBasis: declaredBasis,
    appliedMultiplier: multiplier,
    calories: scaleOrNull(finiteOrNull(nutrition?.calories ?? null), multiplier),
    protein_g: scaleOrNull(canonicalMacro(nutrition?.macros, 'protein_g'), multiplier),
    fiber_g: scaleOrNull(canonicalMacro(nutrition?.macros, 'fiber_g'), multiplier),
    added_sugar_g: scaleOrNull(canonicalMacro(nutrition?.macros, 'added_sugar_g'), multiplier),
    omega3_g: evidence ? scaleOrNull(evidence.perServing.omega3_g, evidenceServings) : null,
    omega6_g: evidence ? scaleOrNull(evidence.perServing.omega6_g, evidenceServings) : null,
    micronutrients,
    processingClass: evidence?.processingClass ?? null,
    processingClassOverride: evidence?.processingClassOverride ?? null,
    category: evidence?.category ?? null,
    tags: evidence?.tags ?? [],
    brandName: evidence?.brandName ?? null,
    provenance: evidence && !nutrition ? evidence.provenance : resolved.provenance,
    evidenceToken: resolved.evidenceToken ?? evidence?.evidenceToken ?? null,
  };
}

// ============================================================================
// Grouped meal
// ============================================================================

function normalizeGroupedEntry(
  row: ConsumedEntryRow,
  payload: Record<string, unknown>,
  group: Record<string, unknown>,
  options: NormalizeConsumedEntryOptions,
  issues: NormalizationIssue[],
): NormalizedConsumedEntry {
  const consumedServings =
    positiveOrNull(group.consumed_servings) ?? positiveOrNull(payload.quantity) ?? 1;
  const plannedServings = positiveOrNull(group.planned_servings);

  // Mirrors scaleTopLevelMealNutrition: a recipe's stored components describe
  // the whole batch and divide by yield; a single-serving meal does not.
  const documentToConsumedFactor =
    plannedServings !== null ? consumedServings / plannedServings : consumedServings;

  const rawComponents = Array.isArray(group.components)
    ? (group.components as MealComponent[])
    : [];
  const components = rawComponents
    .filter(isPlainObject)
    .map((component) =>
      normalizeComponent(
        component as unknown as MealComponent,
        documentToConsumedFactor,
        row.id,
        options.foodEvidence,
        issues,
      ),
    );

  // Top-level mirror first, then the canonical `meal_group.totals` fallback.
  const totals = isPlainObject(group.totals) ? group.totals : null;
  const totalsMacros = totals && isPlainObject(totals.macros) ? totals.macros : null;

  const topCalories = finiteOrNull(payload.calories);
  const totalsCalories = totals ? finiteOrNull(totals.calories) : null;
  const parentCalories = topCalories ?? totalsCalories;

  const parentProtein =
    journalMacro(payload, 'protein') ?? (totalsMacros ? finiteOrNull(totalsMacros.protein_g) : null);
  const parentFiber = totalsMacros ? finiteOrNull(totalsMacros.fiber_g) : null;
  const parentAddedSugar = totalsMacros ? finiteOrNull(totalsMacros.added_sugar_g) : null;

  if (parentCalories === null) {
    issues.push(
      issue(
        'grouped_totals_missing',
        row.id,
        'grouped entry has neither a top-level calorie mirror nor meal_group.totals.calories; consumed energy stays unknown',
      ),
    );
  }

  // Fiber and added sugar fall back to the component sum, which is honest about
  // partial coverage: a known subtotal plus an unknown contributor is not a
  // known total.
  const fiber: NormalizedNutrient =
    parentFiber !== null
      ? { value: parentFiber, availability: 'known', knownContributorCount: 1, unknownContributorCount: 0 }
      : components.length > 0
        ? combineNutrient(components.map((c) => c.fiber_g))
        : unknownNutrient();

  const addedSugar: NormalizedNutrient =
    parentAddedSugar !== null
      ? { value: parentAddedSugar, availability: 'known', knownContributorCount: 1, unknownContributorCount: 0 }
      : components.length > 0
        ? combineNutrient(components.map((c) => c.added_sugar_g))
        : unknownNutrient();

  if (addedSugar.availability !== 'known') {
    issues.push(
      issue(
        'added_sugar_unknown',
        row.id,
        'added sugar has no complete evidence for this grouped entry; total sugar is not a substitute and a zero must not be assumed',
      ),
    );
  }

  // Parent/component agreement is reported, never reconciled proportionally.
  const componentCalorieTotal = combineNutrient(components.map((c) => c.calories));
  let consistency: NormalizedConsumedEntry['parentComponentConsistency'] = 'not_comparable';
  if (parentCalories !== null && componentCalorieTotal.availability === 'known') {
    consistency = caloriesAgree(parentCalories, componentCalorieTotal.value ?? 0)
      ? 'consistent'
      : 'mismatch';
    if (consistency === 'mismatch') {
      issues.push(
        issue(
          'parent_component_calorie_mismatch',
          row.id,
          `grouped parent declares ${parentCalories} kcal consumed but its components sum to ${componentCalorieTotal.value} kcal; both are reported and neither is rescaled to match the other`,
        ),
      );
    }
  }

  return {
    entryId: row.id,
    personId: row.person_id,
    occurredAtUtc: row.occurred_at,
    entryType: row.entry_type,
    displayName: nonEmptyString(payload.name) ?? nonEmptyString(group.name) ?? 'Unknown',
    shape: 'grouped_meal',
    dayAttribution: attributeConsumedDay({ occurred_at: row.occurred_at, payload }),
    quantityBasis: {
      kind: 'already_consumed_total',
      appliedMultiplier: 1,
      recordedQuantity: finiteOrNull(payload.quantity),
      recordedUnit: nonEmptyString(payload.unit),
      servingSizeG: positiveOrNull(payload.servingSizeG),
      consumedGrams: finiteOrNull(row.quantity_g),
    },
    calories:
      parentCalories !== null
        ? { value: parentCalories, availability: 'known', knownContributorCount: 1, unknownContributorCount: 0 }
        : unknownNutrient(1),
    protein_g:
      parentProtein !== null
        ? { value: parentProtein, availability: 'known', knownContributorCount: 1, unknownContributorCount: 0 }
        : unknownNutrient(1),
    fiber_g: fiber,
    added_sugar_g: addedSugar,
    components,
    componentsAreSubsetOfParentTotals: true,
    parentComponentConsistency: consistency,
    issues: issues.filter((i) => i.entryId === row.id),
    normalizerVersion: NDS_NORMALIZER_VERSION,
  };
}

// ============================================================================
// Flat food
// ============================================================================

function normalizeFlatEntry(
  row: ConsumedEntryRow,
  payload: Record<string, unknown>,
  shape: ConsumedEntryShape,
  options: NormalizeConsumedEntryOptions,
  issues: NormalizationIssue[],
): NormalizedConsumedEntry {
  const basis = resolveFlatQuantityBasis(row, payload, issues);
  const multiplier = basis.appliedMultiplier;

  const perServingCalories = finiteOrNull(payload.calories);
  const perServingProtein = journalMacro(payload, 'protein');

  const consumedCalories = scaleOrNull(perServingCalories, multiplier);
  const consumedProtein = scaleOrNull(perServingProtein, multiplier);

  const foodObjectId = nonEmptyString(payload.foodObjectId);
  const evidence = foodObjectId ? options.foodEvidence?.get(foodObjectId) : undefined;

  if (foodObjectId && !evidence) {
    issues.push(
      issue(
        'food_reference_unresolved',
        row.id,
        `entry references food object ${foodObjectId} but no evidence was resolved; nutrient detail stays unknown instead of being invented`,
      ),
    );
  }

  const consumedFiber = evidence ? scaleOrNull(evidence.perServing.fiber_g, multiplier) : null;
  const consumedAddedSugar = evidence
    ? scaleOrNull(evidence.perServing.added_sugar_g, multiplier)
    : null;

  if (consumedAddedSugar === null) {
    issues.push(
      issue(
        'added_sugar_unknown',
        row.id,
        'no added-sugar evidence for this entry; total sugar is not a substitute and a zero must not be assumed',
      ),
    );
  }

  // One component representing the food itself. Its calories use the logged
  // consumed figure so quality subscores share the Log's quantity
  // interpretation; the catalog figure is compared, not substituted.
  const components: NormalizedConsumedComponent[] = [];
  if (evidence || consumedCalories !== null || nonEmptyString(payload.name)) {
    const catalogCalories = evidence
      ? scaleOrNull(evidence.perServing.calories, multiplier)
      : null;

    if (
      catalogCalories !== null &&
      consumedCalories !== null &&
      !caloriesAgree(catalogCalories, consumedCalories)
    ) {
      issues.push(
        issue(
          'parent_component_calorie_mismatch',
          row.id,
          `logged consumed energy is ${consumedCalories} kcal but the food reference implies ${catalogCalories} kcal at the same quantity; the logged figure is used for intake and the difference is reported`,
        ),
      );
    }

    components.push({
      componentId: `entry:${row.id}`,
      name: evidence?.canonicalName ?? nonEmptyString(payload.name) ?? 'Unknown',
      componentKind: foodObjectId ? 'food_concept' : 'user_entered',
      foodObjectId,
      declaredNutritionBasis: 'per_serving',
      appliedMultiplier: multiplier,
      calories: consumedCalories ?? catalogCalories,
      protein_g: consumedProtein,
      fiber_g: consumedFiber,
      added_sugar_g: consumedAddedSugar,
      omega3_g: evidence ? scaleOrNull(evidence.perServing.omega3_g, multiplier) : null,
      omega6_g: evidence ? scaleOrNull(evidence.perServing.omega6_g, multiplier) : null,
      micronutrients: evidence
        ? scaleMicronutrients(
            { ...emptyMicronutrients(), ...evidence.perServing.micronutrients },
            multiplier,
          )
        : emptyMicronutrients(),
      processingClass: evidence?.processingClass ?? null,
      processingClassOverride: evidence?.processingClassOverride ?? null,
      category: evidence?.category ?? null,
      tags: evidence?.tags ?? [],
      brandName: evidence?.brandName ?? null,
      provenance: evidence?.provenance ?? 'unresolved',
      evidenceToken: evidence?.evidenceToken ?? null,
    });
  }

  return {
    entryId: row.id,
    personId: row.person_id,
    occurredAtUtc: row.occurred_at,
    entryType: row.entry_type,
    displayName: nonEmptyString(payload.name) ?? evidence?.canonicalName ?? 'Unknown',
    shape,
    dayAttribution: attributeConsumedDay({ occurred_at: row.occurred_at, payload }),
    quantityBasis: basis,
    calories:
      consumedCalories !== null
        ? { value: consumedCalories, availability: 'known', knownContributorCount: 1, unknownContributorCount: 0 }
        : unknownNutrient(1),
    protein_g:
      consumedProtein !== null
        ? { value: consumedProtein, availability: 'known', knownContributorCount: 1, unknownContributorCount: 0 }
        : unknownNutrient(1),
    fiber_g:
      consumedFiber !== null
        ? { value: consumedFiber, availability: 'known', knownContributorCount: 1, unknownContributorCount: 0 }
        : unknownNutrient(1),
    added_sugar_g:
      consumedAddedSugar !== null
        ? { value: consumedAddedSugar, availability: 'known', knownContributorCount: 1, unknownContributorCount: 0 }
        : unknownNutrient(1),
    components,
    componentsAreSubsetOfParentTotals: true,
    parentComponentConsistency: 'not_comparable',
    issues: issues.filter((i) => i.entryId === row.id),
    normalizerVersion: NDS_NORMALIZER_VERSION,
  };
}

// ============================================================================
// Entry point
// ============================================================================

/**
 * Normalize one journal row into canonical consumed inputs.
 *
 * Returns null for non-intake rows: Plans, water, mood and the other entry
 * types are not consumption and must not reach the actual-NDS calculator.
 */
export function normalizeConsumedEntry(
  row: ConsumedEntryRow,
  options: NormalizeConsumedEntryOptions = {},
): NormalizedConsumedEntry | null {
  if (row.entry_type !== 'intake') return null;

  const issues: NormalizationIssue[] = [];
  const payload = isPlainObject(row.payload) ? row.payload : {};
  const rawGroup = payload.meal_group;

  if (rawGroup === undefined || rawGroup === null) {
    return normalizeFlatEntry(row, payload, 'flat_food', options, issues);
  }

  if (!isPlainObject(rawGroup) || !Array.isArray(rawGroup.components)) {
    // A broken group must not silently become a valid flat food: doing so would
    // reinterpret already-consumed totals as per-serving values.
    issues.push(
      issue(
        'malformed_meal_group',
        row.id,
        'payload.meal_group is present but is not a usable group (missing components array); the entry is marked malformed instead of being read as a flat food',
      ),
    );
    const normalized = normalizeFlatEntry(row, payload, 'malformed_group', options, issues);
    return {
      ...normalized,
      // Already-consumed totals must still be counted once.
      quantityBasis: { ...normalized.quantityBasis, kind: 'already_consumed_total', appliedMultiplier: 1 },
      calories: finiteOrNull(payload.calories) !== null
        ? {
            value: finiteOrNull(payload.calories) as number,
            availability: 'known',
            knownContributorCount: 1,
            unknownContributorCount: 0,
          }
        : unknownNutrient(1),
      protein_g: journalMacro(payload, 'protein') !== null
        ? {
            value: journalMacro(payload, 'protein') as number,
            availability: 'known',
            knownContributorCount: 1,
            unknownContributorCount: 0,
          }
        : unknownNutrient(1),
      components: [],
      issues: issues.filter((i) => i.entryId === row.id),
    };
  }

  return normalizeGroupedEntry(row, payload, rawGroup, options, issues);
}

/** Sum one micronutrient across an entry's components. */
export function entryMicronutrient(
  entry: NormalizedConsumedEntry,
  key: keyof NormalizedMicronutrients,
): number | null {
  return sumMicronutrient(entry.components, key);
}

/**
 * Normalize every row that belongs to one consumed day.
 *
 * Membership uses the shared day-identity helper, so Log selection, NDS inputs,
 * revision invalidation, and queue requests all agree. Rows the scan window
 * caught but that belong to an adjacent day are dropped here, not scored.
 */
export function normalizeConsumedDay(
  personId: string,
  dateLocal: string,
  rows: readonly ConsumedEntryRow[],
  options: NormalizeConsumedEntryOptions = {},
): NormalizedConsumedDay {
  const entries: NormalizedConsumedEntry[] = [];

  for (const row of rows) {
    const normalized = normalizeConsumedEntry(row, options);
    if (!normalized) continue;
    if (normalized.dayAttribution.dateLocal !== dateLocal) continue;
    entries.push(normalized);
  }

  return {
    personId,
    dateLocal,
    entries,
    issues: entries.flatMap((entry) => entry.issues),
    normalizerVersion: NDS_NORMALIZER_VERSION,
  };
}
