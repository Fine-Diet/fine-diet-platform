/**
 * Journal V1 Server-Side Data Service
 * 
 * Supabase persistence for journal entries and meal templates.
 * This module must only be imported in server contexts (API routes).
 * 
 * Timezone/Day Boundary Approach:
 * - `occurred_at` is stored as timestamptz in Supabase
 * - Client sends date as YYYY-MM-DD (local date) for day-scoped queries
 * - We query using >= startOfDay and < nextDay in the user's implied timezone
 * - For simplicity in Phase 2, we treat dates as UTC days (00:00 to 23:59 UTC)
 * - Future: could accept timezone param for true local-day queries
 * 
 * NDS Integration:
 * - On create/update/delete, meal derived data (protein_score_10, is_main_meal) is computed
 * - Database trigger on journal_entries auto-enqueues NDS recompute
 * - Derived data stored in journal_entries columns for display
 */

import { supabaseAdmin } from '../supabaseServerClient';
import type { TimeBlock } from './types';
import { deriveBlock, toDateKey } from './types';
import { validatePayload } from './payloadValidators';
import { computeMealDerivedFromPayload } from '../nds/mealDerived';
import { computeQuantities, type Measure } from '../units/convert';

// ============================================================================
// Types
// ============================================================================

export interface JournalEntryPayload {
  name?: string;
  quantity?: number;
  unit?: string;
  /** Calories for this entry (for NDS calculation) */
  calories?: number;
  macros?: { protein?: number; carbs?: number; fat?: number };
  /** Linked food object ID (for NDS PSQ calculation) */
  food_object_id?: string;
  /** Serving size in grams */
  servingSizeG?: number;
  /** USDA household portion measures (copied from food object at log time) */
  measures?: Array<{ unit: string; grams: number; label?: string }>;
}

export interface JournalEntryRow {
  id: string;
  person_id: string;
  entry_type: string;
  occurred_at: string; // ISO timestamp
  payload: JournalEntryPayload;
  created_at: string;
  updated_at: string;
  // Canonical grams (computed on create/update from payload.quantity + servingSizeG)
  quantity_g?: number | null;
  // NDS derived fields (computed on mutation)
  protein_score_10?: number | null;
  is_main_meal?: boolean | null;
  meal_derived_data?: Record<string, unknown> | null;
}

export interface JournalEntry {
  id: string;
  type: string;
  timestamp: Date;
  block: TimeBlock;
  payload: JournalEntryPayload;
  created_at: Date;
  updated_at: Date;
  /** Canonical grams for this entry (null when conversion unavailable) */
  quantityG?: number | null;
  // NDS derived fields (computed on mutation)
  proteinScore10?: number | null;
  isMainMeal?: boolean | null;
}

export interface MealTemplateRow {
  id: string;
  person_id: string;
  name: string;
  items: MealTemplateItem[];
  nutrition_density: number | null;
  created_at: string;
  updated_at: string;
}

export interface MealTemplateItem {
  id: string;
  name?: string;
  quantity?: number;
  unit?: string;
}

export interface MealTemplate {
  id: string;
  name: string;
  items: MealTemplateItem[];
  nutritionDensity?: number;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// Helpers
// ============================================================================

function rowToEntry(row: JournalEntryRow): JournalEntry {
  const timestamp = new Date(row.occurred_at);
  return {
    id: row.id,
    type: row.entry_type,
    timestamp,
    block: deriveBlock(timestamp),
    payload: row.payload || {},
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    quantityG: row.quantity_g ?? null,
    // NDS derived fields
    proteinScore10: row.protein_score_10 ?? null,
    isMainMeal: row.is_main_meal ?? null,
  };
}

function rowToTemplate(row: MealTemplateRow): MealTemplate {
  return {
    id: row.id,
    name: row.name,
    items: row.items || [],
    nutritionDensity: row.nutrition_density ?? undefined,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

/**
 * Get start and end of day for a given date string (YYYY-MM-DD)
 * 
 * Since entries are stored in UTC but users expect to see them by their local date,
 * we widen the query window to cover all possible timezones (UTC-12 to UTC+14).
 * The client then filters by local date/block.
 * 
 * For a given date D, we query from D-1 at 10:00Z to D+1 at 14:00Z.
 * This covers: UTC+14 (D starts at D-1T10:00Z) to UTC-12 (D ends at D+1T12:00Z).
 */
function getDayBoundaries(dateKey: string): { start: string; end: string } {
  // dateKey is YYYY-MM-DD
  const [y, m, d] = dateKey.split('-').map(Number);
  
  // Start: previous day at 10:00 UTC (covers UTC+14 where local midnight = UTC-14h)
  const startDate = new Date(Date.UTC(y, m - 1, d - 1, 10, 0, 0, 0));
  
  // End: next day at 14:00 UTC (covers UTC-12 where local midnight = UTC+12h)
  const endDate = new Date(Date.UTC(y, m - 1, d + 1, 14, 0, 0, 0));
  
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

// ============================================================================
// Quantity-grams resolution
// ============================================================================

/** Resolved serving info from payload + linked food object. */
interface ResolvedServingInfo {
  servingSizeG: number | null;
  measures: Measure[] | null;
}

/**
 * Resolve servingSizeG and measures from the payload or the linked food object.
 */
async function resolveServingInfo(payload: JournalEntryPayload): Promise<ResolvedServingInfo> {
  let servingSizeG: number | null = null;
  let measures: Measure[] | null = null;

  // 1. Prefer values already in the payload (copied at log time)
  if (typeof payload.servingSizeG === 'number' && payload.servingSizeG > 0) {
    servingSizeG = payload.servingSizeG;
  }
  if (Array.isArray(payload.measures) && payload.measures.length > 0) {
    measures = payload.measures as Measure[];
  }

  // 2. Fall back to the linked food object for missing values
  if (servingSizeG === null || measures === null) {
    const foodObjectId = (payload as Record<string, unknown>).foodObjectId as string | undefined;
    if (foodObjectId) {
      const { data } = await supabaseAdmin
        .from('food_objects')
        .select('serving_size_g, measures')
        .eq('id', foodObjectId)
        .maybeSingle();
      if (data) {
        if (servingSizeG === null && data.serving_size_g && data.serving_size_g > 0) {
          servingSizeG = data.serving_size_g;
        }
        if (measures === null && Array.isArray(data.measures) && data.measures.length > 0) {
          measures = data.measures as Measure[];
        }
      }
    }
  }

  return { servingSizeG, measures };
}

/**
 * Compute quantity_g and adjust the serving multiplier in the payload.
 * Returns the final payload and the quantity_g value.
 *
 * Supports serving, gram, and USDA measure unit modes.
 */
async function computeEntryQuantityG(
  payload: JournalEntryPayload,
  /** If client explicitly sent quantity_g (gram-mode input) */
  clientQuantityG?: number,
): Promise<{ payload: JournalEntryPayload; quantityG: number | null }> {
  const { servingSizeG, measures } = await resolveServingInfo(payload);

  // If client sent an explicit gram value (unit='g' mode), use it
  if (typeof clientQuantityG === 'number' && clientQuantityG > 0) {
    const conv = computeQuantities('g', clientQuantityG, servingSizeG, measures);
    return {
      payload: {
        ...payload,
        quantity: conv.servingQty,
        unit: 'g',
      },
      quantityG: conv.quantityG,
    };
  }

  // Normal path: compute from payload.quantity + unit (may be serving, g, or measure unit)
  const conv = computeQuantities(payload.unit, payload.quantity, servingSizeG, measures);
  return {
    payload: {
      ...payload,
      quantity: conv.servingQty,
      unit: conv.unit,
    },
    quantityG: conv.quantityG,
  };
}

// ============================================================================
// Person Resolution
// ============================================================================

/**
 * Get person_id from auth_user_id
 */
export async function getPersonIdFromAuthUserId(authUserId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('people')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    console.error('[JournalService] Error fetching person:', error);
    return null;
  }

  return data?.id ?? null;
}

// ============================================================================
// Journal Entries CRUD
// ============================================================================

export interface CreateEntryArgs {
  personId: string;
  entryType?: string;
  occurredAt: Date;
  payload?: JournalEntryPayload;
}

export async function createEntry(args: CreateEntryArgs): Promise<JournalEntry> {
  const { personId, entryType = 'intake', occurredAt, payload = {} } = args;

  // Validate payload per entry type
  const validation = validatePayload(entryType as import('./types').JournalEntryType, payload);
  if (!validation.success) {
    throw new Error(validation.error);
  }
  const validatedPayload = validation.data;

  let finalPayload: Record<string, unknown>;
  let quantityG: number | null = null;

  if (entryType === 'intake') {
    // Compute canonical quantity_g and normalise payload.quantity/unit for intake only
    const result = await computeEntryQuantityG(validatedPayload as JournalEntryPayload);
    finalPayload = result.payload as Record<string, unknown>;
    quantityG = result.quantityG;
  } else {
    finalPayload = validatedPayload;
  }

  // Compute NDS derived data ONLY for intake entries
  let proteinScore10: number | null = null;
  let isMainMeal: boolean | null = null;
  let mealDerivedData: Record<string, unknown> | null = null;

  if (entryType === 'intake' && (finalPayload.calories || (finalPayload.macros as Record<string, unknown>)?.protein)) {
    const derived = computeMealDerivedFromPayload(finalPayload as JournalEntryPayload);
    proteinScore10 = derived.protein_score_10;
    isMainMeal = derived.is_main_meal;
    mealDerivedData = derived as unknown as Record<string, unknown>;
  }

  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .insert({
      person_id: personId,
      entry_type: entryType,
      occurred_at: occurredAt.toISOString(),
      payload: finalPayload,
      quantity_g: quantityG,
      // NDS derived fields
      protein_score_10: proteinScore10,
      is_main_meal: isMainMeal,
      meal_derived_data: mealDerivedData,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create journal entry: ${error.message}`);
  }

  // Note: Database trigger (enqueue_nds_recompute) automatically enqueues
  // the NDS recompute for (person_id, date_local)

  return rowToEntry(data as JournalEntryRow);
}

export interface UpdateEntryArgs {
  personId: string;
  entryId: string;
  occurredAt?: Date;
  payload?: Partial<JournalEntryPayload>;
  /** Client-supplied gram value when unit='g'. Server uses this to recompute payload.quantity. */
  quantityG?: number;
}

export async function updateEntry(args: UpdateEntryArgs): Promise<JournalEntry | null> {
  const { personId, entryId, occurredAt, payload, quantityG: clientQuantityG } = args;

  // First fetch the existing entry to merge payload
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('journal_entries')
    .select('*')
    .eq('id', entryId)
    .eq('person_id', personId)
    .single();

  if (fetchError || !existing) {
    return null;
  }

  const updates: Record<string, any> = {};

  if (occurredAt !== undefined) {
    updates.occurred_at = occurredAt.toISOString();
  }

  let mergedPayload = existing.payload as Record<string, unknown>;
  if (payload !== undefined) {
    mergedPayload = { ...existing.payload, ...payload } as Record<string, unknown>;
    // Validate merged payload per entry type
    const validation = validatePayload(existing.entry_type as import('./types').JournalEntryType, mergedPayload);
    if (!validation.success) {
      throw new Error(validation.error);
    }
    mergedPayload = validation.data;
  }

  // Recompute quantity_g ONLY for intake entries
  if (existing.entry_type === 'intake' && (payload !== undefined || clientQuantityG !== undefined)) {
    const { payload: finalPayload, quantityG } = await computeEntryQuantityG(
      mergedPayload as JournalEntryPayload,
      clientQuantityG,
    );
    mergedPayload = finalPayload as Record<string, unknown>;
    updates.payload = mergedPayload;
    updates.quantity_g = quantityG;
  } else if (payload !== undefined) {
    updates.payload = mergedPayload;
  }

  // Recompute NDS derived data ONLY if payload changed and this is an intake entry
  if (existing.entry_type === 'intake' && updates.payload) {
    const derived = computeMealDerivedFromPayload(mergedPayload);
    updates.protein_score_10 = derived.protein_score_10;
    updates.is_main_meal = derived.is_main_meal;
    updates.meal_derived_data = derived as unknown as Record<string, unknown>;
  }

  if (Object.keys(updates).length === 0) {
    return rowToEntry(existing as JournalEntryRow);
  }

  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .update(updates)
    .eq('id', entryId)
    .eq('person_id', personId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update journal entry: ${error.message}`);
  }

  // Note: Database trigger (enqueue_nds_recompute) automatically enqueues
  // the NDS recompute for (person_id, date_local)

  return rowToEntry(data as JournalEntryRow);
}

export async function deleteEntry(personId: string, entryId: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from('journal_entries')
    .delete()
    .eq('id', entryId)
    .eq('person_id', personId);

  if (error) {
    throw new Error(`Failed to delete journal entry: ${error.message}`);
  }

  return true;
}

export async function getEntry(personId: string, entryId: string): Promise<JournalEntry | null> {
  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .select('*')
    .eq('id', entryId)
    .eq('person_id', personId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to get journal entry: ${error.message}`);
  }

  return rowToEntry(data as JournalEntryRow);
}

/**
 * List entries for a specific day
 * @param personId - The person's ID
 * @param dateKey - Date in YYYY-MM-DD format
 */
export async function listEntriesByDay(personId: string, dateKey: string): Promise<JournalEntry[]> {
  const { start, end } = getDayBoundaries(dateKey);

  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .select('*')
    .eq('person_id', personId)
    .gte('occurred_at', start)
    .lte('occurred_at', end)
    .order('occurred_at', { ascending: true })
    .order('id', { ascending: true }); // Secondary sort for deterministic ordering

  if (error) {
    throw new Error(`Failed to list journal entries: ${error.message}`);
  }

  return (data as JournalEntryRow[]).map(rowToEntry);
}

/**
 * List entries for a specific day and block
 */
export async function listEntriesByDayAndBlock(
  personId: string,
  dateKey: string,
  block: TimeBlock
): Promise<JournalEntry[]> {
  const entries = await listEntriesByDay(personId, dateKey);
  return entries.filter((e) => e.block === block);
}

// ============================================================================
// Meal Templates CRUD
// ============================================================================

export interface CreateMealTemplateArgs {
  personId: string;
  name: string;
  items: MealTemplateItem[];
  nutritionDensity?: number;
}

export async function createMealTemplate(args: CreateMealTemplateArgs): Promise<MealTemplate> {
  const { personId, name, items, nutritionDensity } = args;

  const { data, error } = await supabaseAdmin
    .from('journal_meal_templates')
    .insert({
      person_id: personId,
      name,
      items,
      nutrition_density: nutritionDensity ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create meal template: ${error.message}`);
  }

  return rowToTemplate(data as MealTemplateRow);
}

export async function listMealTemplates(personId: string): Promise<MealTemplate[]> {
  const { data, error } = await supabaseAdmin
    .from('journal_meal_templates')
    .select('*')
    .eq('person_id', personId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list meal templates: ${error.message}`);
  }

  return (data as MealTemplateRow[]).map(rowToTemplate);
}

export async function getMealTemplate(personId: string, templateId: string): Promise<MealTemplate | null> {
  const { data, error } = await supabaseAdmin
    .from('journal_meal_templates')
    .select('*')
    .eq('id', templateId)
    .eq('person_id', personId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to get meal template: ${error.message}`);
  }

  return rowToTemplate(data as MealTemplateRow);
}

export async function deleteMealTemplate(personId: string, templateId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('journal_meal_templates')
    .delete()
    .eq('id', templateId)
    .eq('person_id', personId);

  if (error) {
    throw new Error(`Failed to delete meal template: ${error.message}`);
  }

  return true;
}

export interface UpdateMealTemplateArgs {
  personId: string;
  templateId: string;
  name?: string;
  items?: MealTemplateItem[];
  nutritionDensity?: number | null;
}

export async function updateMealTemplate(args: UpdateMealTemplateArgs): Promise<MealTemplate | null> {
  const { personId, templateId, name, items, nutritionDensity } = args;

  // Verify ownership first
  const existing = await getMealTemplate(personId, templateId);
  if (!existing) {
    return null;
  }

  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (items !== undefined) updates.items = items;
  if (nutritionDensity !== undefined) updates.nutrition_density = nutritionDensity;

  if (Object.keys(updates).length === 0) {
    return existing;
  }

  const { data, error } = await supabaseAdmin
    .from('journal_meal_templates')
    .update(updates)
    .eq('id', templateId)
    .eq('person_id', personId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update meal template: ${error.message}`);
  }

  return rowToTemplate(data as MealTemplateRow);
}

/**
 * Create a meal template from existing journal entries
 */
export async function createMealTemplateFromEntries(
  personId: string,
  name: string,
  entries: JournalEntry[]
): Promise<MealTemplate> {
  const items: MealTemplateItem[] = entries.map((e, i) => ({
    id: `item-${e.id}-${i}`,
    name: e.payload.name,
    quantity: e.payload.quantity,
    unit: e.payload.unit || 'serving',
  }));

  return createMealTemplate({
    personId,
    name,
    items,
  });
}

// ============================================================================
// User Goals (from people.metadata)
// ============================================================================

export interface MacroGoals {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface UserGoals {
  dailyCalorieGoal: number;
  macroGoals: MacroGoals;
  /** True if using defaults (user hasn't set custom goals) */
  isDefault: boolean;
}

// Default goals for V1
const DEFAULT_GOALS: UserGoals = {
  dailyCalorieGoal: 2500,
  macroGoals: {
    protein_g: 150,
    carbs_g: 250,
    fat_g: 80,
  },
  isDefault: true,
};

/**
 * Get user's daily goals from people.metadata
 * Falls back to sensible defaults if not set.
 * 
 * Metadata structure expected:
 * {
 *   dailyCalorieGoal?: number,
 *   macroGoals?: { protein_g?: number, carbs_g?: number, fat_g?: number }
 * }
 */
export async function getUserGoals(personId: string): Promise<UserGoals> {
  const { data, error } = await supabaseAdmin
    .from('people')
    .select('metadata')
    .eq('id', personId)
    .single();

  if (error || !data) {
    console.warn('[getUserGoals] Could not fetch person metadata, using defaults');
    return DEFAULT_GOALS;
  }

  const metadata = (data.metadata || {}) as Record<string, any>;

  // Check if user has set custom goals
  const hasCustomGoals = metadata.dailyCalorieGoal !== undefined || metadata.macroGoals !== undefined;

  return {
    dailyCalorieGoal: metadata.dailyCalorieGoal ?? DEFAULT_GOALS.dailyCalorieGoal,
    macroGoals: {
      protein_g: metadata.macroGoals?.protein_g ?? DEFAULT_GOALS.macroGoals.protein_g,
      carbs_g: metadata.macroGoals?.carbs_g ?? DEFAULT_GOALS.macroGoals.carbs_g,
      fat_g: metadata.macroGoals?.fat_g ?? DEFAULT_GOALS.macroGoals.fat_g,
    },
    isDefault: !hasCustomGoals,
  };
}

/**
 * Update user's daily goals in people.metadata
 */
export async function updateUserGoals(
  personId: string,
  goals: Partial<Pick<UserGoals, 'dailyCalorieGoal' | 'macroGoals'>>
): Promise<UserGoals> {
  // Fetch current metadata to merge
  const { data: current } = await supabaseAdmin
    .from('people')
    .select('metadata')
    .eq('id', personId)
    .single();

  const currentMetadata = (current?.metadata || {}) as Record<string, any>;

  // Merge new goals into metadata
  const updatedMetadata = {
    ...currentMetadata,
    ...(goals.dailyCalorieGoal !== undefined && { dailyCalorieGoal: goals.dailyCalorieGoal }),
    ...(goals.macroGoals !== undefined && {
      macroGoals: {
        ...currentMetadata.macroGoals,
        ...goals.macroGoals,
      },
    }),
  };

  const { error } = await supabaseAdmin
    .from('people')
    .update({ metadata: updatedMetadata })
    .eq('id', personId);

  if (error) {
    throw new Error(`Failed to update user goals: ${error.message}`);
  }

  return getUserGoals(personId);
}
