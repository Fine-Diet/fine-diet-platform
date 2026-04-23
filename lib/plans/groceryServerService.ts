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
import type { GeneratedGroceryList, GroceryItem, GroceryItemStatus, PlannedMeal } from './types';

// ============================================================================
// Internal derivation types
// ============================================================================

interface RawPayloadItem {
  name?: string | null;
  quantity?: number | null;
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

function normalizeUnit(u: string | null | undefined): string {
  return (u ?? '').toLowerCase().trim();
}

function addQuantities(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.round((a + b) * 1000) / 1000;
}

/**
 * Deterministically derive a flat list of grocery items from a set of
 * planned meals. All payload.items[] across all meals are collected and
 * grouped by the rules described in the module header.
 */
export function deriveItemsFromMeals(meals: PlannedMeal[]): DerivedItem[] {
  const groundedByKey = new Map<string, DerivedItem>();
  const unresolvedByKey = new Map<string, DerivedItem>();

  for (const meal of meals) {
    const p = (meal.payload ?? {}) as Record<string, unknown>;
    const rawItems = (p.items as RawPayloadItem[] | undefined) ?? [];

    for (const it of rawItems) {
      const name = ((it.name ?? '') as string).trim() || 'Unknown item';
      const qty = typeof it.quantity === 'number' ? it.quantity : null;
      const unit = (it.unit as string | null | undefined) ?? null;
      const foid = (it.food_object_id as string | null | undefined) ?? null;

      if (foid) {
        const key = `${foid}::${normalizeUnit(unit)}`;
        const ex = groundedByKey.get(key);
        if (ex) {
          ex.quantity = addQuantities(ex.quantity, qty);
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
            notes: null,
          });
        }
      } else {
        // Unresolved: group only on exact (name, unit) match.
        const key = `${name.toLowerCase()}::${normalizeUnit(unit)}`;
        const ex = unresolvedByKey.get(key);
        if (ex) {
          ex.quantity = addQuantities(ex.quantity, qty);
          const isNewMeal = !ex.source_planned_meal_ids.includes(meal.id);
          if (isNewMeal) {
            ex.source_planned_meal_ids.push(meal.id);
            // Mark as approximate so the UI can be honest about it.
            ex.notes = 'approx. grouping — matched by name only';
          }
        } else {
          unresolvedByKey.set(key, {
            name,
            quantity: qty,
            unit,
            food_object_id: null,
            source_planned_meal_ids: [meal.id],
            notes: null,
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
 * with forceRegenerate makes that meal's contributions disappear.
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
  source_meals: PlannedMeal[];
}> {
  const { personId, planId, dateStart, dateEnd, forceRegenerate = false } = options;

  // Always load current meals (needed for regenerate and also returned to
  // the caller for provenance resolution).
  const sourceMeals = await fetchMealsForDateRange(personId, planId, dateStart, dateEnd);

  if (!forceRegenerate) {
    const existing = await fetchExistingList(personId, planId, dateStart, dateEnd);
    if (existing) {
      return { ...existing, source_meals: sourceMeals };
    }
  }

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

  const derived = deriveItemsFromMeals(sourceMeals);

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

  return {
    list: newList as unknown as GeneratedGroceryList,
    items: (newItems ?? []) as unknown as GroceryItem[],
    source_meals: sourceMeals,
  };
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
