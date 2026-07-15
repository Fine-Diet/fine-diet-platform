/**
 * Packet 37 — Grocery/shopping list server-side service.
 *
 * Derives grocery items deterministically from planned meal payloads.
 * No AI required for derivation: items come directly from
 * planned_meal.payload.items[], preserving whatever serving-scaled
 * quantities were written there at attach time (Packet 35).
 *
 * Grouping rules:
 *   - Grounded items (food_object_id set): group by (food_object_id, unit).
 *     Same food identity in the same unit → sum quantities and collect
 *     source_planned_meal_ids. Safe because the canonical identity is
 *     known.
 *   - Unresolved items (food_object_id null): group by exact
 *     (name_normalized, unit). Text-similar ≠ safe canonical merge.
 *     Only exact matches are merged, and merged unresolved rows are
 *     annotated so the UI can surface their approximate nature.
 *   - Quantities that cannot be summed (null on either side) become
 *     null in the merged row rather than a misleading number.
 *
 * Persistence: stores a `generated_grocery_lists` row + `grocery_items`
 * rows so check/off state survives across sessions. Regenerate replaces
 * the list for the same scope cleanly.
 *
 * Server-only — never import from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  GroceryActiveListContext,
  GeneratedGroceryList,
  GroceryItem,
  GroceryItemStatus,
  GroceryShoppingOverrideBundle,
  PantryOnHandItem,
  PlannedMeal,
} from './types';
import {
  listGroceryIngredientResolutions as listStoredGroceryIngredientResolutions,
  listPantryOnHandItems as listStoredPantryOnHandItems,
  normalizePantryOnHandUnit,
  pantryOnHandKey,
  saveGroceryIngredientResolution,
  savePantryOnHandItem,
  type GroceryIngredientResolution,
} from './groceryStateStore';
import { groceryItemMatchKey } from './groceryMatchKeys';
import {
  loadShoppingOverridesForItems,
  reconcileShoppingOverridesAfterRegeneration,
} from './groceryShoppingOverrideService';

// ============================================================================
// Internal derivation types
// ============================================================================

interface RawPayloadItem {
  name?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  food_object_id?: string | null;
}

interface DerivedItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  food_object_id: string | null;
  source_planned_meal_ids: string[];
  notes: string | null;
}

const UNIT_ALIASES: Record<string, string> = {
  cup: 'cup',
  cups: 'cup',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbsp: 'tbsp',
  tbsps: 'tbsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tsp: 'tsp',
  tsps: 'tsp',
  gram: 'g',
  grams: 'g',
  g: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  kg: 'kg',
  ounce: 'oz',
  ounces: 'oz',
  oz: 'oz',
  pound: 'lb',
  pounds: 'lb',
  lb: 'lb',
  lbs: 'lb',
  serving: 'serving',
  servings: 'serving',
  item: 'item',
  items: 'item',
  each: 'item',
  ea: 'item',
};

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

function normalizeUnit(u: string | null | undefined): string {
  const raw = (u ?? '').toLowerCase().trim().replace(/\.$/, '');
  return UNIT_ALIASES[raw] ?? raw;
}

function displayUnit(u: string | null | undefined): string | null {
  const normalized = normalizeUnit(u);
  return normalized || null;
}

function appendNote(current: string | null, note: string): string {
  if (!current) return note;
  if (current.includes(note)) return current;
  return `${current}; ${note}`;
}

function resolutionKey(name: string, unit: string | null): string {
  return `${name.toLowerCase().trim()}::${normalizeUnit(unit)}`;
}

function addQuantities(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.round((a + b) * 1000) / 1000;
}

function parseFractionText(value: string): number | null {
  const v = value.trim();
  if (!v) return null;

  const unicodeOnly = UNICODE_FRACTIONS[v];
  if (unicodeOnly !== undefined) return unicodeOnly;

  const unicodeMixed = /^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/.exec(v);
  if (unicodeMixed) {
    return Number(unicodeMixed[1]) + UNICODE_FRACTIONS[unicodeMixed[2]!]!;
  }

  const mixed = /^(\d+)[\s-]+(\d+)\/(\d+)$/.exec(v);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den > 0) return whole + num / den;
  }

  const fraction = /^(\d+)\/(\d+)$/.exec(v);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (den > 0) return num / den;
  }

  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  return null;
}

function parseQuantity(value: unknown): { quantity: number | null; note: string | null } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { quantity: value, note: null };
  }
  if (typeof value !== 'string') return { quantity: null, note: null };

  let raw = value.trim().toLowerCase();
  if (!raw) return { quantity: null, note: null };

  let note: string | null = null;
  if (/^(about|approx\.?|approximately|around|~)\s*/.test(raw)) {
    raw = raw.replace(/^(about|approx\.?|approximately|around|~)\s*/, '');
    note = 'quantity marked approximate by source';
  }

  // Ranges are intentionally not collapsed to an average.
  if (!/^\d+-\d+\/\d+$/.test(raw) && /\d+\s*(?:-|to|–)\s*\d+/.test(raw)) {
    return { quantity: null, note: 'quantity range needs review' };
  }

  const parsed = parseFractionText(raw);
  return {
    quantity: parsed === null ? null : Math.round(parsed * 1000) / 1000,
    note,
  };
}

function cleanIngredientName(rawName: string): { name: string; note: string | null } {
  let name = rawName.trim();
  let note: string | null = null;
  const original = name;

  name = name
    .replace(/^[\s•*–—-]+/, '')
    .replace(/^\d+[\).:-]\s+/, '')
    .replace(/^\s*(ingredients?|ingredient)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[|]{2,}/g, '|')
    .replace(/([,;:])\1+/g, '$1')
    .replace(/\s+([,;:])/g, '$1')
    .trim();

  // High-confidence retail/parser residue at row ends.
  name = name
    .replace(/\s*\((?:[$€£]\s*)?\d+(?:[.,]\d{2})\)\s*$/i, '')
    .replace(/\s+(?:[-–—]\s*)?(?:[$€£]\s*)?\d+(?:[.,]\d{2})\s*$/i, '')
    .replace(/\s+(?:add to cart|shop now|buy now|sale|save \d+%)\s*$/i, '')
    .trim();

  // Broken trailing parenthetical is parser residue; complete parentheticals
  // often carry useful prep notes and are preserved.
  name = name.replace(/\s*\([^)]*$/, '').trim();
  name = name.replace(/\s*[-–—:,;]\s*$/, '').trim();

  if (name && name !== original.trim()) {
    note = 'cleaned parser residue';
  }

  return { name: name || rawName.trim() || 'Unknown item', note };
}

function splitLeadingQuantityUnit(rawName: string): {
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
} | null {
  const match = /^((?:\d+\s+\d+\/\d+)|(?:\d+-\d+\/\d+)|(?:\d+\/\d+)|(?:\d+(?:\.\d+)?)|(?:\d+\s*)?[¼½¾⅓⅔⅛⅜⅝⅞])\s+([A-Za-z.]+)\s+(.+)$/.exec(rawName.trim());
  if (!match) return null;

  const quantity = parseFractionText(match[1]!);
  const unit = displayUnit(match[2]);
  const name = match[3]!.trim();
  if (quantity === null || !unit || !name) return null;

  return {
    quantity: Math.round(quantity * 1000) / 1000,
    unit,
    name,
    note: 'quantity recovered from ingredient text',
  };
}

async function listGroceryIngredientResolutions(
  personId: string,
): Promise<GroceryIngredientResolution[]> {
  return listStoredGroceryIngredientResolutions(personId);
}

export async function listPantryOnHandItems(personId: string): Promise<PantryOnHandItem[]> {
  return listStoredPantryOnHandItems(personId);
}

/**
 * Deterministically derive a flat list of grocery items from a set of
 * planned meals. All payload.items[] across all meals are collected and
 * grouped by the rules described in the module header.
 */
export function deriveItemsFromMeals(
  meals: PlannedMeal[],
  resolutions: GroceryIngredientResolution[] = [],
): DerivedItem[] {
  const groundedByKey = new Map<string, DerivedItem>();
  const unresolvedByKey = new Map<string, DerivedItem>();
  const resolutionByKey = new Map(resolutions.map((r) => [r.key, r]));

  for (const meal of meals) {
    const p = (meal.payload ?? {}) as Record<string, unknown>;
    const rawItems = (p.items as RawPayloadItem[] | undefined) ?? [];

    for (const it of rawItems) {
      let rawName = ((it.name ?? '') as string).trim() || 'Unknown item';
      const parsedQuantity = parseQuantity(it.quantity);
      let qty = parsedQuantity.quantity;
      let unit = displayUnit(it.unit as string | null | undefined);
      let note = parsedQuantity.note;

      if (qty === null) {
        const recovered = splitLeadingQuantityUnit(rawName);
        if (recovered) {
          rawName = recovered.name;
          if (!unit || unit === recovered.unit) {
            qty = recovered.quantity;
            unit = unit ?? recovered.unit;
            note = appendNote(note, recovered.note ?? 'quantity recovered from ingredient text');
          } else {
            note = appendNote(note, 'quantity/unit conflict needs review');
          }
        }
      }

      const cleaned = cleanIngredientName(rawName);
      let name = cleaned.name;
      note = cleaned.note ? appendNote(note, cleaned.note) : note;
      let foid = (it.food_object_id as string | null | undefined) ?? null;
      const missingQuantityNote =
        qty === null ? 'required amount partially specified by source meal' : null;
      if (missingQuantityNote) note = appendNote(note, missingQuantityNote);

      if (!foid) {
        const resolution = resolutionByKey.get(resolutionKey(name, unit));
        if (resolution) {
          foid = resolution.food_object_id;
          name = resolution.canonical_name;
          note = appendNote(note, 'resolved by user');
        }
      }

      if (foid) {
        const key = `${foid}::${normalizeUnit(unit)}`;
        const ex = groundedByKey.get(key);
        if (ex) {
          const nextQty = addQuantities(ex.quantity, qty);
          if (nextQty === null) {
            ex.notes = appendNote(
              ex.notes,
              'required amount partially specified by source meal',
            );
          }
          if (note) ex.notes = appendNote(ex.notes, note);
          ex.quantity = nextQty;
          if (!ex.source_planned_meal_ids.includes(meal.id)) {
            ex.source_planned_meal_ids.push(meal.id);
          }
        } else {
          groundedByKey.set(key, {
            name,
            quantity: qty,
            unit,
            food_object_id: foid,
            source_planned_meal_ids: [meal.id],
            notes: note,
          });
        }
      } else {
        // Unresolved: group only on exact (name, unit) match.
        const key = `${name.toLowerCase()}::${normalizeUnit(unit)}`;
        const ex = unresolvedByKey.get(key);
        if (ex) {
          const nextQty = addQuantities(ex.quantity, qty);
          if (nextQty === null) {
            ex.notes = appendNote(
              ex.notes,
              'required amount partially specified by source meal',
            );
          }
          if (note) ex.notes = appendNote(ex.notes, note);
          ex.quantity = nextQty;
          const isNewMeal = !ex.source_planned_meal_ids.includes(meal.id);
          if (isNewMeal) {
            ex.source_planned_meal_ids.push(meal.id);
            // Mark as approximate so the UI can be honest about it.
            ex.notes = appendNote(ex.notes, 'approx. grouping — matched by name only');
          }
        } else {
          unresolvedByKey.set(key, {
            name,
            quantity: qty,
            unit,
            food_object_id: null,
            source_planned_meal_ids: [meal.id],
            notes: note,
          });
        }
      }
    }
  }

  // Grounded items first, then unresolved.
  return [
    ...Array.from(groundedByKey.values()),
    ...Array.from(unresolvedByKey.values()),
  ];
}

// ============================================================================
// DB helpers
// ============================================================================

async function fetchMealsForDateRange(
  personId: string,
  planId: string,
  dateStart: string,
  dateEnd: string,
): Promise<PlannedMeal[]> {
  const { data: planDays, error: daysErr } = await supabaseAdmin
    .from('plan_days')
    .select('id')
    .eq('plan_id', planId)
    .eq('person_id', personId)
    .gte('date_local', dateStart)
    .lte('date_local', dateEnd);

  if (daysErr) throw new Error(`Failed to load plan days: ${daysErr.message}`);
  const dayIds = (planDays ?? []).map((d: { id: string }) => d.id);
  if (dayIds.length === 0) return [];

  const { data: meals, error: mealsErr } = await supabaseAdmin
    .from('planned_meals')
    .select('*')
    .eq('person_id', personId)
    .in('plan_day_id', dayIds);

  if (mealsErr) throw new Error(`Failed to load planned meals: ${mealsErr.message}`);
  return (meals ?? []) as unknown as PlannedMeal[];
}

async function fetchPlanDayDatesForRange(
  personId: string,
  planId: string,
  dateStart: string,
  dateEnd: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin
    .from('plan_days')
    .select('id, date_local')
    .eq('plan_id', planId)
    .eq('person_id', personId)
    .gte('date_local', dateStart)
    .lte('date_local', dateEnd);
  if (error) throw new Error(`Failed to load plan day dates: ${error.message}`);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[String(row.id)] = String(row.date_local);
  }
  return map;
}

function statusSnapshotByMatchKey(items: GroceryItem[]): Map<string, GroceryItemStatus> {
  const snapshot = new Map<string, GroceryItemStatus>();
  for (const item of items) {
    snapshot.set(groceryItemMatchKey(item), item.status);
  }
  return snapshot;
}

async function restoreItemStatusesByMatchKey(
  personId: string,
  listId: string,
  items: GroceryItem[],
  snapshot: Map<string, GroceryItemStatus>,
): Promise<GroceryItem[]> {
  if (snapshot.size === 0) return items;
  const restored = [...items];
  for (let i = 0; i < restored.length; i += 1) {
    const item = restored[i]!;
    const priorStatus = snapshot.get(groceryItemMatchKey(item));
    if (!priorStatus || priorStatus === item.status) continue;
    const { data, error } = await supabaseAdmin
      .from('grocery_items')
      .update({ status: priorStatus })
      .eq('id', item.id)
      .eq('person_id', personId)
      .select('*')
      .single();
    if (!error && data) {
      restored[i] = data as unknown as GroceryItem;
    }
  }
  return restored;
}

async function fetchExistingList(
  personId: string,
  planId: string,
  dateStart: string,
  dateEnd: string,
): Promise<{ list: GeneratedGroceryList; items: GroceryItem[] } | null> {
  const { data: existing } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('*')
    .eq('plan_id', planId)
    .eq('person_id', personId)
    .eq('date_range_start', dateStart)
    .eq('date_range_end', dateEnd)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) return null;

  const { data: items } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('grocery_list_id', existing.id)
    .eq('person_id', personId)
    // Grounded items (food_object_id IS NOT NULL) naturally sort first with
    // NULLS LAST on an ascending food_object_id column.
    .order('food_object_id', { ascending: true, nullsFirst: false });

  return {
    list: existing as unknown as GeneratedGroceryList,
    items: (items ?? []) as unknown as GroceryItem[],
  };
}

function daySpan(start: string | null, end: string | null): number {
  if (!start || !end) return Number.MAX_SAFE_INTEGER;
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
}

export function chooseContainingGroceryList(
  candidates: GeneratedGroceryList[],
): GeneratedGroceryList | null {
  const [chosen] = [...candidates].sort((a, b) => {
    const spanDelta = daySpan(a.date_range_start, a.date_range_end) -
      daySpan(b.date_range_start, b.date_range_end);
    if (spanDelta !== 0) return spanDelta;
    return b.created_at.localeCompare(a.created_at);
  });
  return chosen ?? null;
}

function activeListContext(args: {
  requestedStart: string;
  requestedEnd: string;
  list: GeneratedGroceryList;
  generated?: boolean;
}): GroceryActiveListContext {
  const exact = args.list.date_range_start === args.requestedStart &&
    args.list.date_range_end === args.requestedEnd;
  const isSingleDay = args.requestedStart === args.requestedEnd;
  const selection_kind: GroceryActiveListContext['selection_kind'] = args.generated
    ? isSingleDay ? 'generated_exact_day' : 'generated_exact_range'
    : exact
      ? isSingleDay ? 'exact_day' : 'exact_range'
      : 'containing_range';
  const activeStart = args.list.date_range_start ?? args.requestedStart;
  const activeEnd = args.list.date_range_end ?? args.requestedEnd;
  const isFallback = selection_kind === 'containing_range';
  return {
    selection_kind,
    requested_date_start: args.requestedStart,
    requested_date_end: args.requestedEnd,
    active_date_start: activeStart,
    active_date_end: activeEnd,
    is_fallback: isFallback,
    explanation: isFallback
      ? `Using existing grocery list for ${activeStart} to ${activeEnd} because no exact list exists for ${args.requestedStart} to ${args.requestedEnd}.`
      : selection_kind === 'exact_day'
        ? `Using exact-day grocery list for ${args.requestedStart}.`
        : selection_kind === 'exact_range'
          ? `Using exact grocery list for ${args.requestedStart} to ${args.requestedEnd}.`
          : selection_kind === 'generated_exact_day'
            ? `Generated exact-day grocery list for ${args.requestedStart}.`
            : `Generated exact grocery list for ${args.requestedStart} to ${args.requestedEnd}.`,
  };
}

async function fetchItemsForList(
  personId: string,
  listId: string,
): Promise<GroceryItem[]> {
  const { data: items } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('grocery_list_id', listId)
    .eq('person_id', personId)
    .order('food_object_id', { ascending: true, nullsFirst: false });
  return (items ?? []) as unknown as GroceryItem[];
}

/**
 * Packet 54 — one active-list selection rule for grocery/readiness consumers.
 *
 * Exact requested scope wins. If no exact list exists, choose the narrowest
 * existing list that contains the requested scope; ties use newest created_at.
 */
export async function selectActiveGroceryList(options: {
  personId: string;
  planId: string;
  dateStart: string;
  dateEnd: string;
}): Promise<{
  list: GeneratedGroceryList;
  items: GroceryItem[];
  context: GroceryActiveListContext;
} | null> {
  const { personId, planId, dateStart, dateEnd } = options;
  const exact = await fetchExistingList(personId, planId, dateStart, dateEnd);
  if (exact) {
    return {
      ...exact,
      context: activeListContext({
        requestedStart: dateStart,
        requestedEnd: dateEnd,
        list: exact.list,
      }),
    };
  }

  const { data: candidates, error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('*')
    .eq('plan_id', planId)
    .eq('person_id', personId)
    .lte('date_range_start', dateStart)
    .gte('date_range_end', dateEnd);
  if (error) throw new Error(`Failed to select active grocery list: ${error.message}`);
  if (!candidates || candidates.length === 0) return null;

  const chosen = chooseContainingGroceryList(candidates as unknown as GeneratedGroceryList[]);
  if (!chosen) return null;

  return {
    list: chosen,
    items: await fetchItemsForList(personId, chosen.id),
    context: activeListContext({
      requestedStart: dateStart,
      requestedEnd: dateEnd,
      list: chosen,
    }),
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate (or return an existing) grocery list for a plan + date range.
 *
 * When `forceRegenerate` is false and a list already exists for the same
 * scope, the stored list is returned as-is (preserving check/off state).
 * When `forceRegenerate` is true the old list is replaced with a fresh
 * derivation from current planned meals — so removing a meal and calling
 * with forceRegenerate makes that meal's contributions disappear. Handled
 * meals (eaten/skipped) are also excluded from fresh derivation so shopping
 * demand reflects pending plan work only.
 */
export async function generateGroceryList(options: {
  personId: string;
  planId: string;
  dateStart: string;
  dateEnd: string;
  forceRegenerate?: boolean;
}): Promise<{
  list: GeneratedGroceryList;
  items: GroceryItem[];
  pantry_items: PantryOnHandItem[];
  source_meals: PlannedMeal[];
  list_context: GroceryActiveListContext;
  shopping_overrides: GroceryShoppingOverrideBundle;
  plan_day_dates: Record<string, string>;
}> {
  const { personId, planId, dateStart, dateEnd, forceRegenerate = false } = options;

  const planDayDates = await fetchPlanDayDatesForRange(personId, planId, dateStart, dateEnd);

  // Always load current meals (needed for regenerate and also returned to
  // the caller for provenance resolution).
  const sourceMeals = await fetchMealsForDateRange(personId, planId, dateStart, dateEnd);
  const pantryItems = await listPantryOnHandItems(personId);
  const listScope = { planId, dateStart, dateEnd };

  if (!forceRegenerate) {
    const existing = await selectActiveGroceryList({ personId, planId, dateStart, dateEnd });
    if (existing) {
      const activeStart = existing.list.date_range_start ?? dateStart;
      const activeEnd = existing.list.date_range_end ?? dateEnd;
      const activeSourceMeals =
        activeStart === dateStart && activeEnd === dateEnd
          ? sourceMeals
          : await fetchMealsForDateRange(personId, planId, activeStart, activeEnd);
      const activeScope = {
        planId,
        dateStart: activeStart,
        dateEnd: activeEnd,
      };
      const shoppingOverrides = await loadShoppingOverridesForItems(
        personId,
        activeScope,
        existing.items,
      );
      return {
        list: existing.list,
        items: existing.items,
        pantry_items: pantryItems,
        source_meals: activeSourceMeals,
        list_context: existing.context,
        shopping_overrides: shoppingOverrides,
        plan_day_dates: activeStart === dateStart && activeEnd === dateEnd
          ? planDayDates
          : await fetchPlanDayDatesForRange(personId, planId, activeStart, activeEnd),
      };
    }
  }

  const priorExisting = await fetchExistingList(personId, planId, dateStart, dateEnd);
  const statusSnapshot = priorExisting
    ? statusSnapshotByMatchKey(priorExisting.items)
    : new Map<string, GroceryItemStatus>();

  // Delete stale list(s) for this scope before replacing.
  await supabaseAdmin
    .from('generated_grocery_lists')
    .delete()
    .eq('plan_id', planId)
    .eq('person_id', personId)
    .eq('date_range_start', dateStart)
    .eq('date_range_end', dateEnd);

  const title =
    dateStart === dateEnd
      ? `Shopping list · ${dateStart}`
      : `Shopping list · ${dateStart} to ${dateEnd}`;

  const { data: newList, error: listErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .insert({
      plan_id: planId,
      person_id: personId,
      title,
      date_range_start: dateStart,
      date_range_end: dateEnd,
      mode: 'manual',
      status: 'draft',
    })
    .select('*')
    .single();

  if (listErr || !newList) {
    throw new Error(`Failed to create grocery list: ${listErr?.message ?? 'no data'}`);
  }

  const resolutions = await listGroceryIngredientResolutions(personId);
  const pendingMeals = sourceMeals.filter(
    (meal) => (meal.execution_state ?? 'pending') === 'pending',
  );
  const derived = deriveItemsFromMeals(pendingMeals, resolutions);

  if (derived.length > 0) {
    const { error: itemsErr } = await supabaseAdmin
      .from('grocery_items')
      .insert(
        derived.map((it) => ({
          grocery_list_id: newList.id,
          person_id: personId,
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          food_object_id: it.food_object_id,
          source_planned_meal_ids: it.source_planned_meal_ids,
          notes: it.notes,
          status: 'pending',
        })),
      );
    if (itemsErr) throw new Error(`Failed to insert grocery items: ${itemsErr.message}`);
  }

  const { data: newItems } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('grocery_list_id', newList.id)
    .eq('person_id', personId)
    .order('food_object_id', { ascending: true, nullsFirst: false });

  let items = (newItems ?? []) as unknown as GroceryItem[];
  items = await restoreItemStatusesByMatchKey(personId, newList.id, items, statusSnapshot);

  const shoppingOverrides = await reconcileShoppingOverridesAfterRegeneration(
    personId,
    listScope,
    items,
  );

  return {
    list: newList as unknown as GeneratedGroceryList,
    items,
    pantry_items: pantryItems,
    source_meals: sourceMeals,
    list_context: activeListContext({
      requestedStart: dateStart,
      requestedEnd: dateEnd,
      list: newList as unknown as GeneratedGroceryList,
      generated: true,
    }),
    shopping_overrides: shoppingOverrides,
    plan_day_dates: planDayDates,
  };
}

/**
 * Packet 38 — Read-only fetch of the most recent grocery list + items for
 * a single date (date_range_start = date_range_end = date). Used by the
 * readiness endpoint which must NOT generate a new list.
 *
 * Returns null when no list exists for the given scope.
 */
export async function getGroceryItemsForDate(
  personId: string,
  planId: string,
  date: string,
): Promise<{ list: GeneratedGroceryList; items: GroceryItem[] } | null> {
  return fetchExistingList(personId, planId, date, date);
}

/**
 * Packet 41 reconciliation — readiness can use a range list when no exact
 * single-day grocery list exists. Exact day lists remain preferred.
 */
export async function getGroceryItemsCoveringDate(
  personId: string,
  planId: string,
  date: string,
): Promise<{
  list: GeneratedGroceryList;
  items: GroceryItem[];
  context: GroceryActiveListContext;
} | null> {
  return selectActiveGroceryList({ personId, planId, dateStart: date, dateEnd: date });
}

/**
 * Update the status of a single grocery item (check off, mark as have, etc.).
 */
export async function updateGroceryItemStatus(
  personId: string,
  itemId: string,
  status: GroceryItemStatus,
): Promise<GroceryItem> {
  const { data, error } = await supabaseAdmin
    .from('grocery_items')
    .update({ status })
    .eq('id', itemId)
    .eq('person_id', personId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update grocery item: ${error?.message ?? 'not found'}`);
  }
  return data as unknown as GroceryItem;
}

/**
 * Packet 46 — Persist a user-approved canonical mapping for one unresolved
 * grocery row. The mapping is keyed by cleaned row name + unit, so future
 * derivation can ground the same safe unresolved source without mutating
 * historical planned meal payloads.
 */
export async function resolveGroceryItemIngredient(options: {
  personId: string;
  itemId: string;
  foodObjectId: string;
}): Promise<GroceryItem> {
  const { personId, itemId, foodObjectId } = options;

  const { data: item, error: itemErr } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('id', itemId)
    .eq('person_id', personId)
    .single();
  if (itemErr || !item) {
    throw new Error(`Failed to load grocery item: ${itemErr?.message ?? 'not found'}`);
  }
  if (item.food_object_id) {
    throw new Error('Grocery item is already grounded.');
  }

  const { data: food, error: foodErr } = await supabaseAdmin
    .from('food_objects')
    .select('id, canonical_name')
    .eq('id', foodObjectId)
    .single();
  if (foodErr || !food) {
    throw new Error(`Failed to load canonical food: ${foodErr?.message ?? 'not found'}`);
  }

  const cleaned = cleanIngredientName(String(item.name ?? ''));
  const cleanedName = cleaned.name;
  if (!cleanedName) throw new Error('Grocery item does not have a resolvable name.');

  const now = new Date().toISOString();
  const unit = displayUnit(item.unit);
  const key = resolutionKey(cleanedName, unit);
  const existing = await listGroceryIngredientResolutions(personId);
  const nextResolution: GroceryIngredientResolution = {
    key,
    raw_name: cleanedName,
    unit,
    food_object_id: food.id,
    canonical_name: food.canonical_name,
    created_at: existing.find((r) => r.key === key)?.created_at ?? now,
    updated_at: now,
  };
  await saveGroceryIngredientResolution(personId, nextResolution);

  const nextNotes = appendNote((item.notes as string | null) ?? null, 'resolved by user');
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('grocery_items')
    .update({
      food_object_id: food.id,
      name: food.canonical_name,
      notes: nextNotes,
    })
    .eq('id', itemId)
    .eq('person_id', personId)
    .select('*')
    .single();

  if (updateErr || !updated) {
    throw new Error(`Failed to update resolved grocery item: ${updateErr?.message ?? 'not found'}`);
  }

  return updated as unknown as GroceryItem;
}

/**
 * Packet 47 — Persist explicit user-entered on-hand pantry quantity for a
 * grounded grocery row. The record lives at the person boundary and is keyed
 * by canonical food identity + normalized unit so deduction never crosses
 * ambiguous units or unresolved rows.
 */
export async function setGroceryItemOnHand(options: {
  personId: string;
  itemId: string;
  quantity: number;
  unit?: string | null;
}): Promise<PantryOnHandItem> {
  const { personId, itemId, quantity } = options;
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('On-hand quantity must be a non-negative number.');
  }

  const { data: item, error: itemErr } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('id', itemId)
    .eq('person_id', personId)
    .single();
  if (itemErr || !item) {
    throw new Error(`Failed to load grocery item: ${itemErr?.message ?? 'not found'}`);
  }
  if (!item.food_object_id) {
    throw new Error('Resolve this grocery row before recording a deductible on-hand amount.');
  }

  const unit = normalizePantryOnHandUnit(options.unit ?? item.unit);
  const key = pantryOnHandKey(item.food_object_id, unit);
  const pantryItem: PantryOnHandItem = {
    key,
    food_object_id: item.food_object_id,
    name: String(item.name ?? 'Pantry item'),
    quantity: Math.round(quantity * 1000) / 1000,
    unit,
    updated_at: new Date().toISOString(),
  };

  await savePantryOnHandItem(personId, pantryItem);

  return pantryItem;
}

/**
 * Packet B — Direct add a deductible pantry row from /app/pantry without a
 * grocery list row.
 *
 * Mirrors setGroceryItemOnHand's identity contract: the row is keyed by
 * canonical food identity + normalized unit so deduction never crosses
 * ambiguous units or free-text entries. A canonical food_object_id is
 * required — free-text pantry entries can never deduct from grocery demand.
 *
 * The row lives at the authenticated person boundary. When a same-person row
 * already exists for the same food_object_id + normalized unit, the upsert
 * intentionally updates it in place rather than creating a duplicate.
 */
export async function createPantryOnHandItem(options: {
  personId: string;
  foodObjectId: string;
  quantity: number;
  unit?: string | null;
}): Promise<PantryOnHandItem> {
  const { personId, foodObjectId, quantity } = options;
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('On-hand quantity must be a non-negative number.');
  }
  if (typeof foodObjectId !== 'string' || !foodObjectId) {
    throw new Error('A canonical food selection is required for a deductible pantry item.');
  }

  const { data: food, error: foodErr } = await supabaseAdmin
    .from('food_objects')
    .select('id, canonical_name')
    .eq('id', foodObjectId)
    .single();
  if (foodErr || !food) {
    throw new Error(`Failed to load canonical food: ${foodErr?.message ?? 'not found'}`);
  }

  const unit = normalizePantryOnHandUnit(options.unit ?? null);
  const key = pantryOnHandKey(food.id, unit);
  const pantryItem: PantryOnHandItem = {
    key,
    food_object_id: food.id,
    name: String(food.canonical_name ?? 'Pantry item'),
    quantity: Math.round(quantity * 1000) / 1000,
    unit,
    updated_at: new Date().toISOString(),
  };

  await savePantryOnHandItem(personId, pantryItem);

  return pantryItem;
}
