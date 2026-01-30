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
 */

import { supabaseAdmin } from '../supabaseServerClient';
import type { TimeBlock } from './types';
import { deriveBlock, toDateKey } from './types';

// ============================================================================
// Types
// ============================================================================

export interface JournalEntryPayload {
  name?: string;
  quantity?: number;
  unit?: string;
  macros?: { protein?: number; carbs?: number; fat?: number };
}

export interface JournalEntryRow {
  id: string;
  person_id: string;
  entry_type: string;
  occurred_at: string; // ISO timestamp
  payload: JournalEntryPayload;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  type: string;
  timestamp: Date;
  block: TimeBlock;
  payload: JournalEntryPayload;
  created_at: Date;
  updated_at: Date;
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
 * Returns UTC boundaries for simplicity in Phase 2
 */
function getDayBoundaries(dateKey: string): { start: string; end: string } {
  // dateKey is YYYY-MM-DD
  const start = `${dateKey}T00:00:00.000Z`;
  const end = `${dateKey}T23:59:59.999Z`;
  return { start, end };
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

  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .insert({
      person_id: personId,
      entry_type: entryType,
      occurred_at: occurredAt.toISOString(),
      payload,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create journal entry: ${error.message}`);
  }

  return rowToEntry(data as JournalEntryRow);
}

export interface UpdateEntryArgs {
  personId: string;
  entryId: string;
  occurredAt?: Date;
  payload?: Partial<JournalEntryPayload>;
}

export async function updateEntry(args: UpdateEntryArgs): Promise<JournalEntry | null> {
  const { personId, entryId, occurredAt, payload } = args;

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

  if (payload !== undefined) {
    // Merge payload
    updates.payload = { ...existing.payload, ...payload };
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
    .order('occurred_at', { ascending: true });

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
    unit: e.payload.unit,
  }));

  return createMealTemplate({
    personId,
    name,
    items,
  });
}
