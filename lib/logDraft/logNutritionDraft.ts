import {
  formatFoodName,
  type FoodObject,
  type FoodSearchResult,
  type OffServingNormalization,
} from '@/lib/food/types';
import { resolveDefaultIntakeProfile } from '@/lib/food/defaultIntake';
import type { JournalEntryPayload, MealScheduleContext } from '@/lib/journal/types';
import type { LogSearchResult, RecentLoggedItem } from '@/lib/logSearch/types';
import { buildGroupedMealIntakePayload } from '@/lib/meals/groupedMealPayload';
import { scaleTopLevelMealNutrition } from '@/lib/meals/recompute';
import {
  MEAL_SCHEMA_VERSION,
  type CanonicalMacros,
  type MealComponent,
  type MealDocument,
  type MealNutrition,
} from '@/lib/meals/types';
import { computeQuantities } from '@/lib/units/convert';

export const LOG_NUTRITION_DRAFT_VERSION = 1 as const;
export const LOG_NUTRITION_DRAFT_STORAGE_PREFIX = 'fine-diet:log-nutrition-draft:v1';

export interface LogNutritionDraftContextV1 {
  personId: string;
  date: string;
  time: string;
  occasionKey: string;
  mealSlot: string | null;
  plannedMealId: string | null;
  redirect: string | null;
}

interface LogNutritionDraftEntryBaseV1 {
  id: string;
  sourceKey: string;
  title: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface LogNutritionSingleItemDraftEntryV1
  extends LogNutritionDraftEntryBaseV1 {
  kind: 'single_item';
  unit: string;
  calories: number | null;
  macros: {
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  };
  foodObjectId: string | null;
  servingSizeG: number | null;
  measures: Array<{ unit: string; grams: number; label?: string }> | null;
}

export interface LogNutritionMealDraftEntryV1
  extends LogNutritionDraftEntryBaseV1 {
  kind: 'meal';
  unit: 'serving';
  mealDocument: MealDocument;
  plannedMealId: string | null;
  plannedMode: 'exact' | 'adjusted' | null;
}

export type LogNutritionDraftEntryV1 =
  | LogNutritionSingleItemDraftEntryV1
  | LogNutritionMealDraftEntryV1;

export interface LogNutritionDraftV1 {
  version: typeof LOG_NUTRITION_DRAFT_VERSION;
  sessionId: string;
  context: LogNutritionDraftContextV1;
  entries: LogNutritionDraftEntryV1[];
  createdAt: string;
  updatedAt: string;
}

export interface AddDraftEntryResult {
  draft: LogNutritionDraftV1;
  entryId: string;
  duplicate: boolean;
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

export function createLogDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12)}`;
}

export function createLogNutritionDraft(
  context: LogNutritionDraftContextV1,
  options?: { sessionId?: string; now?: Date },
): LogNutritionDraftV1 {
  const timestamp = nowIso(options?.now);
  return {
    version: LOG_NUTRITION_DRAFT_VERSION,
    sessionId: options?.sessionId ?? createLogDraftId(),
    context: { ...context },
    entries: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function getLogNutritionDraftStorageKey(
  context: LogNutritionDraftContextV1,
): string {
  const identity = [
    context.personId,
    context.date,
    context.time,
    context.occasionKey,
    context.mealSlot ?? 'none',
    context.plannedMealId ?? 'ordinary',
  ].map(encodeURIComponent);
  return `${LOG_NUTRITION_DRAFT_STORAGE_PREFIX}:${identity.join(':')}`;
}

export function isSameLogDraftContext(
  left: LogNutritionDraftContextV1,
  right: LogNutritionDraftContextV1,
): boolean {
  return getLogNutritionDraftStorageKey(left) === getLogNutritionDraftStorageKey(right);
}

function touchDraft(
  draft: LogNutritionDraftV1,
  entries: LogNutritionDraftEntryV1[],
  now?: Date,
): LogNutritionDraftV1 {
  return { ...draft, entries, updatedAt: nowIso(now) };
}

export function addLogNutritionDraftEntry(
  draft: LogNutritionDraftV1,
  entry: LogNutritionDraftEntryV1,
  now?: Date,
): AddDraftEntryResult {
  const existing = draft.entries.find((candidate) => candidate.sourceKey === entry.sourceKey);
  if (existing) {
    return { draft, entryId: existing.id, duplicate: true };
  }
  return {
    draft: touchDraft(draft, [...draft.entries, entry], now),
    entryId: entry.id,
    duplicate: false,
  };
}

export function updateLogNutritionDraftEntry(
  draft: LogNutritionDraftV1,
  entryId: string,
  patch: { quantity?: number; unit?: string },
  now?: Date,
): LogNutritionDraftV1 {
  let changed = false;
  const entries = draft.entries.map((entry) => {
    if (entry.id !== entryId) return entry;
    const quantity =
      typeof patch.quantity === 'number' && Number.isFinite(patch.quantity)
        ? patch.quantity
        : entry.quantity;
    if (entry.kind === 'meal') {
      changed = quantity !== entry.quantity;
      return {
        ...entry,
        quantity,
        plannedMode: entry.plannedMealId && changed ? 'adjusted' : entry.plannedMode,
        updatedAt: nowIso(now),
      };
    }
    const unit = typeof patch.unit === 'string' && patch.unit.trim() ? patch.unit : entry.unit;
    changed = quantity !== entry.quantity || unit !== entry.unit;
    return { ...entry, quantity, unit, updatedAt: nowIso(now) };
  });
  return changed ? touchDraft(draft, entries, now) : draft;
}

export function removeLogNutritionDraftEntry(
  draft: LogNutritionDraftV1,
  entryId: string,
  now?: Date,
): LogNutritionDraftV1 {
  const entries = draft.entries.filter((entry) => entry.id !== entryId);
  return entries.length === draft.entries.length ? draft : touchDraft(draft, entries, now);
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function singleItemDraftEntryFromFoodResult(
  result: FoodSearchResult,
  options?: { id?: string; now?: Date },
): LogNutritionSingleItemDraftEntryV1 {
  return singleItemDraftEntryFromFood(result.food, {
    ...options,
    offNormalization: result.offNormalization,
  });
}

export function singleItemDraftEntryFromFood(
  food: FoodObject,
  options?: {
    id?: string;
    now?: Date;
    offNormalization?: OffServingNormalization | null;
  },
): LogNutritionSingleItemDraftEntryV1 {
  const profile = resolveDefaultIntakeProfile(food, {
    offNormalization: options?.offNormalization,
  });
  const timestamp = nowIso(options?.now);
  const isOff = food.sourceProvider === 'off';
  const stableFoodId = isOff ? food.sourceId ?? food.id : food.id;
  return {
    id: options?.id ?? createLogDraftId(),
    sourceKey: `food:${stableFoodId}`,
    kind: 'single_item',
    title: formatFoodName(food),
    quantity: profile.defaultQuantity,
    unit: profile.defaultUnit,
    calories: nullableNumber(food.calories),
    macros: {
      protein: nullableNumber(food.proteinG),
      carbs: nullableNumber(food.carbsG),
      fat: nullableNumber(food.fatG),
    },
    foodObjectId: isOff ? null : food.id,
    servingSizeG: nullableNumber(food.servingSizeG),
    measures: food.measures?.map((measure) => ({ ...measure })) ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function singleItemDraftEntryFromRecent(
  item: RecentLoggedItem,
  options?: { id?: string; now?: Date },
): LogNutritionSingleItemDraftEntryV1 {
  const timestamp = nowIso(options?.now);
  return {
    id: options?.id ?? createLogDraftId(),
    sourceKey: `food:${item.foodObjectId}`,
    kind: 'single_item',
    title: item.name,
    quantity: 1,
    unit: item.servingUnit ?? 'serving',
    calories: nullableNumber(item.calories),
    macros: {
      protein: nullableNumber(item.proteinG),
      carbs: nullableNumber(item.carbsG),
      fat: nullableNumber(item.fatG),
    },
    foodObjectId: item.foodObjectId,
    servingSizeG: nullableNumber(item.servingSizeG),
    measures: item.measures?.map((measure) => ({ ...measure })) ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function mealDraftEntryFromSearchResult(
  result: LogSearchResult,
  options?: { id?: string; now?: Date },
): LogNutritionMealDraftEntryV1 | null {
  const document =
    result.kind === 'meal' ? result.meal : result.kind === 'recipe' ? result.recipe : null;
  if (!document) return null;
  return mealDraftEntryFromDocument(document, {
    id: options?.id,
    now: options?.now,
    sourceKey: `${result.kind}:${result.id}`,
  });
}

export function mealDraftEntryFromDocument(
  document: MealDocument,
  options?: {
    id?: string;
    now?: Date;
    sourceKey?: string;
    plannedMealId?: string | null;
    plannedMode?: 'exact' | 'adjusted' | null;
  },
): LogNutritionMealDraftEntryV1 {
  const timestamp = nowIso(options?.now);
  return {
    id: options?.id ?? createLogDraftId(),
    sourceKey:
      options?.sourceKey ??
      `meal:${document.id ?? `${document.title}:${document.updated_at ?? 'draft'}`}`,
    kind: 'meal',
    title: document.title,
    quantity: 1,
    unit: 'serving',
    mealDocument: JSON.parse(JSON.stringify(document)) as MealDocument,
    plannedMealId: options?.plannedMealId ?? null,
    plannedMode: options?.plannedMode ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function isCommitReadyLogDraftEntry(entry: LogNutritionDraftEntryV1): boolean {
  if (!entry.title.trim() || !Number.isFinite(entry.quantity) || entry.quantity <= 0) {
    return false;
  }
  if (entry.kind === 'single_item') return Boolean(entry.unit.trim());
  return (
    entry.mealDocument.review_state === 'confirmed' &&
    entry.mealDocument.components.length > 0 &&
    !entry.mealDocument.components.some((component) => component.needs_review) &&
    scaleTopLevelMealNutrition(entry.mealDocument, entry.quantity) != null
  );
}

export function isCommitReadyLogNutritionDraft(draft: LogNutritionDraftV1): boolean {
  return draft.entries.length > 0 && draft.entries.every(isCommitReadyLogDraftEntry);
}

export function getSingleItemServingQuantity(
  entry: LogNutritionSingleItemDraftEntryV1,
): number {
  return computeQuantities(
    entry.unit,
    entry.quantity,
    entry.servingSizeG,
    entry.measures,
  ).servingQty;
}

export function getDraftEntryNutrition(entry: LogNutritionDraftEntryV1): MealNutrition | null {
  if (entry.kind === 'meal') {
    return scaleTopLevelMealNutrition(entry.mealDocument, entry.quantity);
  }
  const multiplier = getSingleItemServingQuantity(entry);
  const scale = (value: number | null) => (value == null ? null : value * multiplier);
  return {
    calories: scale(entry.calories),
    macros: {
      protein_g: scale(entry.macros.protein),
      carbs_g: scale(entry.macros.carbs),
      fat_g: scale(entry.macros.fat),
    },
  };
}

export function buildJournalPayloadForDraftEntry(
  entry: LogNutritionDraftEntryV1,
  mealScheduleContext?: MealScheduleContext,
): JournalEntryPayload {
  if (entry.kind === 'meal') {
    const payload = buildGroupedMealIntakePayload(entry.mealDocument, {
      consumed_servings: entry.quantity,
    });
    return mealScheduleContext
      ? { ...payload, meal_schedule_context: mealScheduleContext }
      : payload;
  }
  return {
    name: entry.title,
    quantity: entry.quantity,
    unit: entry.unit,
    ...(entry.calories != null ? { calories: entry.calories } : {}),
    ...(entry.macros.protein != null ||
    entry.macros.carbs != null ||
    entry.macros.fat != null
      ? {
          macros: {
            ...(entry.macros.protein != null ? { protein: entry.macros.protein } : {}),
            ...(entry.macros.carbs != null ? { carbs: entry.macros.carbs } : {}),
            ...(entry.macros.fat != null ? { fat: entry.macros.fat } : {}),
          },
        }
      : {}),
    ...(entry.foodObjectId ? { foodObjectId: entry.foodObjectId } : {}),
    ...(entry.servingSizeG != null ? { servingSizeG: entry.servingSizeG } : {}),
    ...(entry.measures ? { measures: entry.measures.map((measure) => ({ ...measure })) } : {}),
    ...(mealScheduleContext ? { meal_schedule_context: mealScheduleContext } : {}),
  };
}

export function serializeLogNutritionDraft(draft: LogNutritionDraftV1): string {
  return JSON.stringify(draft);
}

export function parseLogNutritionDraft(
  raw: string | null,
  expectedContext: LogNutritionDraftContextV1,
): LogNutritionDraftV1 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LogNutritionDraftV1>;
    if (
      parsed.version !== LOG_NUTRITION_DRAFT_VERSION ||
      typeof parsed.sessionId !== 'string' ||
      !parsed.context ||
      !Array.isArray(parsed.entries) ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.updatedAt !== 'string' ||
      !isSameLogDraftContext(parsed.context, expectedContext)
    ) {
      return null;
    }
    if (
      parsed.entries.some(
        (entry) =>
          !entry ||
          (entry.kind !== 'single_item' && entry.kind !== 'meal') ||
          typeof entry.id !== 'string' ||
          typeof entry.sourceKey !== 'string' ||
          typeof entry.title !== 'string' ||
          typeof entry.quantity !== 'number',
      )
    ) {
      return null;
    }
    return parsed as LogNutritionDraftV1;
  } catch {
    return null;
  }
}

function addNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function scaleCanonicalMacros(macros: CanonicalMacros, factor: number): CanonicalMacros {
  const scale = (value: number | null | undefined) =>
    value == null ? null : value * factor;
  return {
    protein_g: scale(macros.protein_g),
    carbs_g: scale(macros.carbs_g),
    fat_g: scale(macros.fat_g),
    ...(macros.fiber_g !== undefined ? { fiber_g: scale(macros.fiber_g) } : {}),
    ...(macros.added_sugar_g !== undefined
      ? { added_sugar_g: scale(macros.added_sugar_g) }
      : {}),
  };
}

function componentFromSingleItem(
  entry: LogNutritionSingleItemDraftEntryV1,
  index: number,
): MealComponent {
  return {
    component_id: `log-${index + 1}-${entry.id}`,
    component_kind: entry.foodObjectId ? 'food_concept' : 'user_entered',
    name: entry.title,
    raw_text: null,
    preparation_note: null,
    quantity: entry.quantity,
    unit: entry.unit,
    food_object_id: entry.foodObjectId,
    serving_size_g: entry.servingSizeG,
    ...(entry.measures ? { measures: entry.measures.map((measure) => ({ ...measure })) } : {}),
    calories: entry.calories,
    macros: {
      protein_g: entry.macros.protein,
      carbs_g: entry.macros.carbs,
      fat_g: entry.macros.fat,
    },
    nutrition_basis: 'per_serving',
    match_status: entry.foodObjectId ? 'matched' : 'none',
    source_kind: entry.foodObjectId ? 'food_object' : 'user_entered',
    needs_review: !entry.foodObjectId,
  };
}

function componentsFromMealEntry(
  entry: LogNutritionMealDraftEntryV1,
  entryIndex: number,
): MealComponent[] {
  return entry.mealDocument.components.map((component, componentIndex) => {
    const factor = entry.quantity;
    const scalesAbsoluteNutrition = component.nutrition_basis === 'per_component';
    return {
      ...component,
      component_id: `log-${entryIndex + 1}-${componentIndex + 1}-${component.component_id}`,
      quantity:
        component.quantity == null ? null : component.quantity * factor,
      calories:
        scalesAbsoluteNutrition && component.calories != null
          ? component.calories * factor
          : component.calories,
      macros: scalesAbsoluteNutrition
        ? scaleCanonicalMacros(component.macros, factor)
        : { ...component.macros },
      ...(component.measures
        ? { measures: component.measures.map((measure) => ({ ...measure })) }
        : {}),
    };
  });
}

export function buildMealDocumentFromLogDraft(
  draft: LogNutritionDraftV1,
  title: string,
): MealDocument {
  const components = draft.entries.flatMap((entry, index) =>
    entry.kind === 'single_item'
      ? [componentFromSingleItem(entry, index)]
      : componentsFromMealEntry(entry, index),
  );
  const totals = draft.entries.reduce<MealNutrition>(
    (sum, entry) => {
      const nutrition = getDraftEntryNutrition(entry);
      if (!nutrition) return sum;
      return {
        calories: addNullable(sum.calories, nutrition.calories),
        macros: {
          protein_g: addNullable(sum.macros.protein_g, nutrition.macros.protein_g),
          carbs_g: addNullable(sum.macros.carbs_g, nutrition.macros.carbs_g),
          fat_g: addNullable(sum.macros.fat_g, nutrition.macros.fat_g),
        },
      };
    },
    {
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
    },
  );
  const needsReview = components.some((component) => component.needs_review);
  return {
    schema_version: MEAL_SCHEMA_VERSION,
    document_version: 1,
    id: null,
    person_id: draft.context.personId,
    kind: 'meal',
    review_state: needsReview ? 'needs_review' : 'confirmed',
    lifecycle_state: 'active',
    archived_at: null,
    title: title.trim(),
    description: null,
    intents: [],
    meal_type_hint: null,
    components,
    yield: { servings: 1, yield_label: 'serving', confirmed: true },
    recipe_yield_servings: 1,
    serving_label: 'serving',
    prep_notes: null,
    per_serving: totals,
    totals,
    source: { source_type: 'manual' },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: null,
    updated_at: null,
  };
}
