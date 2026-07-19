/**
 * Packet 59 — read-only planning/grocery support snapshot.
 *
 * This service intentionally reads authoritative table-backed state directly.
 * It does not call compatibility store list helpers because those helpers may
 * backfill legacy metadata into tables. Snapshot generation must be SELECT-only.
 */

import { buildGroceryItemReadModel } from '@/lib/plans/groceryReadModel';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  GroceryItem,
  GroceryItemReadModel,
  PantryOnHandItem,
  ReusablePlanInstantiationProvenance,
} from '@/lib/plans';

type StorageSource = 'table_direct' | 'legacy_metadata' | 'unknown';

interface StorageTrackedRow {
  storage_source?: string | null;
}

interface PersonRow {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface ReusableDayTemplateRow extends StorageTrackedRow {
  id: string;
  person_id: string;
  name: string;
  source_plan_id: string;
  source_plan_day_id: string;
  source_date_local: string;
  slots_json: unknown;
  unassigned_meals_json: unknown;
  storage_source: string | null;
  legacy_metadata_backfilled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ReusableWeekPatternRow extends StorageTrackedRow {
  id: string;
  person_id: string;
  name: string;
  source_plan_id: string;
  source_date_start: string | null;
  source_date_end: string | null;
  days_json: unknown;
  storage_source: string | null;
  legacy_metadata_backfilled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface GroceryIngredientResolutionRow extends StorageTrackedRow {
  id: string;
  person_id: string;
  key: string;
  raw_name: string;
  unit: string | null;
  food_object_id: string;
  canonical_name: string;
  storage_source: string | null;
  legacy_metadata_backfilled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PantryOnHandItemRow extends StorageTrackedRow {
  id: string;
  person_id: string;
  key: string;
  food_object_id: string;
  name: string;
  quantity: number | string | null;
  unit: string | null;
  storage_source: string | null;
  legacy_metadata_backfilled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FoodObjectSummary {
  id: string;
  canonical_name: string | null;
  brand_name: string | null;
}

interface PlanRow {
  id: string;
  person_id: string;
  title: string | null;
  plan_shape: string;
  source: string;
  status: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

interface PlannedMealRow {
  id: string;
  plan_id: string;
  plan_day_id: string;
  plan_slot_id: string | null;
  person_id: string;
  name: string | null;
  meal_type: string;
  source_template_id: string | null;
  source_imported_meal_id: string | null;
  reusable_provenance: ReusablePlanInstantiationProvenance | null;
  execution_state: 'pending' | 'eaten' | 'skipped' | null;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

interface GroceryListRow {
  id: string;
  plan_id: string | null;
  person_id: string;
  title: string | null;
  date_range_start: string | null;
  date_range_end: string | null;
  mode: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface GroceryItemRow {
  id: string;
  grocery_list_id: string;
  person_id: string;
  name: string;
  quantity: number | string | null;
  unit: string | null;
  aisle_category: string | null;
  food_object_id: string | null;
  source_planned_meal_ids: string[] | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface StorageSummaryBucket {
  total: number;
  table_direct: number;
  legacy_metadata: number;
  unknown: number;
}

export interface PlanningGrocerySupportSnapshot {
  person: {
    id: string;
    auth_user_id: string | null;
    email: string | null;
    name: string | null;
    status: string | null;
  };
  storage_summary: {
    reusable_day_templates: StorageSummaryBucket;
    reusable_week_patterns: StorageSummaryBucket;
    pantry_on_hand_items: StorageSummaryBucket;
    grocery_ingredient_resolutions: StorageSummaryBucket;
  };
  reusable_planning: {
    day_templates: Array<{
      id: string;
      name: string;
      source_plan_id: string;
      source_plan_day_id: string;
      source_date_local: string;
      slots_count: number;
      meals_count: number;
      unassigned_meals_count: number;
      storage_source: StorageSource;
      legacy_metadata_backfilled_at: string | null;
      created_at: string;
      updated_at: string;
    }>;
    week_patterns: Array<{
      id: string;
      name: string;
      source_plan_id: string;
      source_date_start: string | null;
      source_date_end: string | null;
      days_count: number;
      slots_count: number;
      meals_count: number;
      storage_source: StorageSource;
      legacy_metadata_backfilled_at: string | null;
      created_at: string;
      updated_at: string;
    }>;
  };
  grocery_state: {
    pantry_on_hand_items: Array<{
      id: string;
      key: string;
      food_object_id: string;
      food: FoodObjectSummary | null;
      name: string;
      quantity: number | null;
      unit: string | null;
      storage_source: StorageSource;
      legacy_metadata_backfilled_at: string | null;
      created_at: string;
      updated_at: string;
    }>;
    ingredient_resolutions: Array<{
      id: string;
      key: string;
      raw_name: string;
      unit: string | null;
      food_object_id: string;
      food: FoodObjectSummary | null;
      canonical_name: string;
      storage_source: StorageSource;
      legacy_metadata_backfilled_at: string | null;
      created_at: string;
      updated_at: string;
    }>;
  };
  active_planning: {
    plans: Array<{
      id: string;
      title: string | null;
      plan_shape: string;
      source: string;
      status: string;
      start_date: string;
      end_date: string | null;
      created_at: string;
      updated_at: string;
    }>;
    recent_planned_meals: Array<{
      id: string;
      plan_id: string;
      plan_day_id: string;
      plan_slot_id: string | null;
      name: string | null;
      meal_type: string;
      execution_state: 'pending' | 'eaten' | 'skipped';
      active_grocery_demand: boolean;
      journal_entry_id: string | null;
      source_imported_meal_id: string | null;
      source_template_id: string | null;
      reusable_provenance: ReusablePlanInstantiationProvenance | null;
      created_at: string;
      updated_at: string;
    }>;
  };
  grocery_lists: Array<{
    id: string;
    plan_id: string | null;
    title: string | null;
    date_range_start: string | null;
    date_range_end: string | null;
    mode: string;
    status: string;
    created_at: string;
    updated_at: string;
    items_count: number;
    unresolved_items_count: number;
    items: Array<{
      id: string;
      name: string;
      status: string;
      grounded: boolean;
      food_object_id: string | null;
      source_planned_meal_ids: string[];
      required: GroceryItemReadModel['required'];
      on_hand: GroceryItemReadModel['onHand'];
      still_to_buy: GroceryItemReadModel['stillToBuy'];
      buy_suggestion: string | null;
      review_notes: string[];
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>;
  }>;
  warnings: string[];
}

function normalizeStorageSource(value: string | null | undefined): StorageSource {
  if (value === 'table_direct' || value === 'legacy_metadata') return value;
  return 'unknown';
}

function emptyStorageBucket(): StorageSummaryBucket {
  return {
    total: 0,
    table_direct: 0,
    legacy_metadata: 0,
    unknown: 0,
  };
}

function storageBucket(rows: StorageTrackedRow[]): StorageSummaryBucket {
  const bucket = emptyStorageBucket();
  bucket.total = rows.length;
  for (const row of rows) {
    bucket[normalizeStorageSource(row.storage_source)] += 1;
  }
  return bucket;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => {
        return !!entry && typeof entry === 'object' && !Array.isArray(entry);
      })
    : [];
}

function templateSlotMealCount(slotsJson: unknown): number {
  return arrayOfRecords(slotsJson).reduce((sum, slot) => {
    return sum + (Array.isArray(slot.meals) ? slot.meals.length : 0);
  }, 0);
}

function templateSlotCount(slotsJson: unknown): number {
  return arrayOfRecords(slotsJson).length;
}

function weekPatternCounts(daysJson: unknown): {
  days_count: number;
  slots_count: number;
  meals_count: number;
} {
  const days = arrayOfRecords(daysJson);
  let slotsCount = 0;
  let mealsCount = 0;

  for (const day of days) {
    const slots = arrayOfRecords(day.slots);
    slotsCount += slots.length;
    for (const slot of slots) {
      mealsCount += Array.isArray(slot.meals) ? slot.meals.length : 0;
    }
    mealsCount += Array.isArray(day.unassigned_meals) ? day.unassigned_meals.length : 0;
  }

  return {
    days_count: days.length,
    slots_count: slotsCount,
    meals_count: mealsCount,
  };
}

function normalizeNumber(value: number | string | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function rowToPantryItem(row: PantryOnHandItemRow): PantryOnHandItem {
  return {
    key: row.key,
    food_object_id: row.food_object_id,
    name: row.name,
    quantity: normalizeNumber(row.quantity),
    unit: row.unit,
    updated_at: row.updated_at,
  };
}

function rowToGroceryItem(row: GroceryItemRow): GroceryItem {
  return {
    id: row.id,
    grocery_list_id: row.grocery_list_id,
    person_id: row.person_id,
    name: row.name,
    quantity: normalizeNumber(row.quantity),
    unit: row.unit,
    aisle_category: row.aisle_category,
    food_object_id: row.food_object_id,
    source_planned_meal_ids: row.source_planned_meal_ids ?? [],
    status: row.status as GroceryItem['status'],
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function personName(person: PersonRow): string | null {
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

async function selectRequired<T>(label: string, query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await query;
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load ${label}: ${message}`);
  }
  return data as T;
}

async function loadPerson(personId: string): Promise<PersonRow | null> {
  const { data, error } = await supabaseAdmin
    .from('people')
    .select('id, auth_user_id, email, first_name, last_name, status, created_at, updated_at')
    .eq('id', personId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load person: ${error.message}`);
  return data as PersonRow | null;
}

async function loadFoodSummaries(foodObjectIds: string[]): Promise<Map<string, FoodObjectSummary>> {
  const ids = Array.from(new Set(foodObjectIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const rows = await selectRequired<FoodObjectSummary[]>(
    'food object summaries',
    supabaseAdmin
      .from('food_objects')
      .select('id, canonical_name, brand_name')
      .in('id', ids),
  );

  return new Map((rows ?? []).map((row) => [row.id, row]));
}

function pushStorageWarnings(
  warnings: string[],
  label: string,
  bucket: StorageSummaryBucket,
): void {
  if (bucket.legacy_metadata > 0) {
    warnings.push(`${label} include ${bucket.legacy_metadata} row(s) backfilled from legacy metadata.`);
  }
  if (bucket.unknown > 0) {
    warnings.push(`${label} include ${bucket.unknown} row(s) with unknown storage_source.`);
  }
}

export async function getPlanningGrocerySupportSnapshot(
  personId: string,
): Promise<PlanningGrocerySupportSnapshot> {
  const person = await loadPerson(personId);
  if (!person) throw new Error('Person not found.');

  const [
    dayTemplateRows,
    weekPatternRows,
    pantryRows,
    resolutionRows,
    planRows,
    mealRows,
    groceryListRows,
  ] = await Promise.all([
    selectRequired<ReusableDayTemplateRow[]>(
      'reusable day templates',
      supabaseAdmin
        .from('reusable_plan_day_templates')
        .select('id, person_id, name, source_plan_id, source_plan_day_id, source_date_local, slots_json, unassigned_meals_json, storage_source, legacy_metadata_backfilled_at, created_at, updated_at')
        .eq('person_id', personId)
        .order('updated_at', { ascending: false }),
    ),
    selectRequired<ReusableWeekPatternRow[]>(
      'reusable week patterns',
      supabaseAdmin
        .from('reusable_plan_week_patterns')
        .select('id, person_id, name, source_plan_id, source_date_start, source_date_end, days_json, storage_source, legacy_metadata_backfilled_at, created_at, updated_at')
        .eq('person_id', personId)
        .order('updated_at', { ascending: false }),
    ),
    selectRequired<PantryOnHandItemRow[]>(
      'pantry on-hand items',
      supabaseAdmin
        .from('pantry_on_hand_items')
        .select('id, person_id, key, food_object_id, name, quantity, unit, storage_source, legacy_metadata_backfilled_at, created_at, updated_at')
        .eq('person_id', personId)
        .order('updated_at', { ascending: false }),
    ),
    selectRequired<GroceryIngredientResolutionRow[]>(
      'grocery ingredient resolutions',
      supabaseAdmin
        .from('grocery_ingredient_resolutions')
        .select('id, person_id, key, raw_name, unit, food_object_id, canonical_name, storage_source, legacy_metadata_backfilled_at, created_at, updated_at')
        .eq('person_id', personId)
        .order('updated_at', { ascending: false }),
    ),
    selectRequired<PlanRow[]>(
      'plans',
      supabaseAdmin
        .from('plans')
        .select('id, person_id, title, plan_shape, source, status, start_date, end_date, created_at, updated_at')
        .eq('person_id', personId)
        .order('start_date', { ascending: false })
        .limit(20),
    ),
    selectRequired<PlannedMealRow[]>(
      'recent planned meals',
      supabaseAdmin
        .from('planned_meals')
        .select('id, plan_id, plan_day_id, plan_slot_id, person_id, name, meal_type, source_template_id, source_imported_meal_id, reusable_provenance, execution_state, journal_entry_id, created_at, updated_at')
        .eq('person_id', personId)
        .order('created_at', { ascending: false })
        .limit(50),
    ),
    selectRequired<GroceryListRow[]>(
      'grocery lists',
      supabaseAdmin
        .from('generated_grocery_lists')
        .select('id, plan_id, person_id, title, date_range_start, date_range_end, mode, status, created_at, updated_at')
        .eq('person_id', personId)
        .order('created_at', { ascending: false })
        .limit(10),
    ),
  ]);

  const groceryListIds = groceryListRows.map((list) => list.id);
  const groceryItemRows =
    groceryListIds.length === 0
      ? []
      : await selectRequired<GroceryItemRow[]>(
          'grocery items',
          supabaseAdmin
            .from('grocery_items')
            .select('id, grocery_list_id, person_id, name, quantity, unit, aisle_category, food_object_id, source_planned_meal_ids, status, notes, created_at, updated_at')
            .eq('person_id', personId)
            .in('grocery_list_id', groceryListIds)
            .order('created_at', { ascending: false }),
        );

  const foodObjectById = await loadFoodSummaries([
    ...pantryRows.map((row) => row.food_object_id),
    ...resolutionRows.map((row) => row.food_object_id),
  ]);

  const pantryItems = pantryRows.map(rowToPantryItem);
  const groceryItemsByList = new Map<string, GroceryItemRow[]>();
  for (const row of groceryItemRows) {
    const current = groceryItemsByList.get(row.grocery_list_id) ?? [];
    current.push(row);
    groceryItemsByList.set(row.grocery_list_id, current);
  }

  const storageSummary = {
    reusable_day_templates: storageBucket(dayTemplateRows),
    reusable_week_patterns: storageBucket(weekPatternRows),
    pantry_on_hand_items: storageBucket(pantryRows),
    grocery_ingredient_resolutions: storageBucket(resolutionRows),
  };

  const warnings: string[] = [];
  pushStorageWarnings(warnings, 'Reusable day templates', storageSummary.reusable_day_templates);
  pushStorageWarnings(warnings, 'Reusable week patterns', storageSummary.reusable_week_patterns);
  pushStorageWarnings(warnings, 'Pantry on-hand items', storageSummary.pantry_on_hand_items);
  pushStorageWarnings(
    warnings,
    'Grocery ingredient resolutions',
    storageSummary.grocery_ingredient_resolutions,
  );

  for (const row of pantryRows) {
    if (!row.unit) {
      warnings.push(`Pantry row ${row.key} has no unit; deduction may require review.`);
    }
  }
  const unresolvedCount = groceryItemRows.filter((row) => !row.food_object_id).length;
  if (unresolvedCount > 0) {
    warnings.push(
      `${unresolvedCount} grocery row(s) are unresolved and intentionally excluded from pantry deduction.`,
    );
  }

  return {
    person: {
      id: person.id,
      auth_user_id: person.auth_user_id,
      email: person.email,
      name: personName(person),
      status: person.status,
    },
    storage_summary: storageSummary,
    reusable_planning: {
      day_templates: dayTemplateRows.map((row) => ({
        id: row.id,
        name: row.name,
        source_plan_id: row.source_plan_id,
        source_plan_day_id: row.source_plan_day_id,
        source_date_local: row.source_date_local,
        slots_count: templateSlotCount(row.slots_json),
        meals_count:
          templateSlotMealCount(row.slots_json) +
          (Array.isArray(row.unassigned_meals_json) ? row.unassigned_meals_json.length : 0),
        unassigned_meals_count: Array.isArray(row.unassigned_meals_json)
          ? row.unassigned_meals_json.length
          : 0,
        storage_source: normalizeStorageSource(row.storage_source),
        legacy_metadata_backfilled_at: row.legacy_metadata_backfilled_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      week_patterns: weekPatternRows.map((row) => {
        const counts = weekPatternCounts(row.days_json);
        return {
          id: row.id,
          name: row.name,
          source_plan_id: row.source_plan_id,
          source_date_start: row.source_date_start,
          source_date_end: row.source_date_end,
          ...counts,
          storage_source: normalizeStorageSource(row.storage_source),
          legacy_metadata_backfilled_at: row.legacy_metadata_backfilled_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }),
    },
    grocery_state: {
      pantry_on_hand_items: pantryRows.map((row) => ({
        id: row.id,
        key: row.key,
        food_object_id: row.food_object_id,
        food: foodObjectById.get(row.food_object_id) ?? null,
        name: row.name,
        quantity: normalizeNumber(row.quantity),
        unit: row.unit,
        storage_source: normalizeStorageSource(row.storage_source),
        legacy_metadata_backfilled_at: row.legacy_metadata_backfilled_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      ingredient_resolutions: resolutionRows.map((row) => ({
        id: row.id,
        key: row.key,
        raw_name: row.raw_name,
        unit: row.unit,
        food_object_id: row.food_object_id,
        food: foodObjectById.get(row.food_object_id) ?? null,
        canonical_name: row.canonical_name,
        storage_source: normalizeStorageSource(row.storage_source),
        legacy_metadata_backfilled_at: row.legacy_metadata_backfilled_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    },
    active_planning: {
      plans: planRows.map((row) => ({
        id: row.id,
        title: row.title,
        plan_shape: row.plan_shape,
        source: row.source,
        status: row.status,
        start_date: row.start_date,
        end_date: row.end_date,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      recent_planned_meals: mealRows.map((row) => {
        const executionState = row.execution_state ?? 'pending';
        return {
          id: row.id,
          plan_id: row.plan_id,
          plan_day_id: row.plan_day_id,
          plan_slot_id: row.plan_slot_id,
          name: row.name,
          meal_type: row.meal_type,
          execution_state: executionState,
          active_grocery_demand: executionState === 'pending',
          journal_entry_id: row.journal_entry_id,
          source_imported_meal_id: row.source_imported_meal_id,
          source_template_id: row.source_template_id,
          reusable_provenance: row.reusable_provenance,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }),
    },
    grocery_lists: groceryListRows.map((list) => {
      const itemRows = groceryItemsByList.get(list.id) ?? [];
      const items = itemRows.map((row) => {
        const item = rowToGroceryItem(row);
        const readModel = buildGroceryItemReadModel(item, pantryItems);
        return {
          id: item.id,
          name: item.name,
          status: item.status,
          grounded: !!item.food_object_id,
          food_object_id: item.food_object_id,
          source_planned_meal_ids: item.source_planned_meal_ids,
          required: readModel.required,
          on_hand: readModel.onHand,
          still_to_buy: readModel.stillToBuy,
          buy_suggestion: readModel.buySuggestion,
          review_notes: readModel.reviewNotes,
          notes: item.notes,
          created_at: item.created_at,
          updated_at: item.updated_at,
        };
      });

      return {
        id: list.id,
        plan_id: list.plan_id,
        title: list.title,
        date_range_start: list.date_range_start,
        date_range_end: list.date_range_end,
        mode: list.mode,
        status: list.status,
        created_at: list.created_at,
        updated_at: list.updated_at,
        items_count: items.length,
        unresolved_items_count: items.filter((item) => !item.grounded).length,
        items,
      };
    }),
    warnings,
  };
}
