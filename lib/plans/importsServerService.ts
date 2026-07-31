/**
 * Plans — Imports Server Service (Phase 4)
 *
 * Supabase persistence for imported_meals draft records and the
 * promote-to-template path. Server-only; never import from client.
 *
 * The canonical attachable shape continues to live in the existing
 * `imported_meals.payload` + meal-level NDS columns (unchanged since
 * Phase 1). Phase 4 layers in the *draft* fields: parse_status,
 * raw_input_text, parsed_payload_json, nutrition_estimate_json,
 * ingredient_match_json, import_type, source_platform.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import { normalizeSourceUrl, sourceUrlsMatch } from '@/lib/meals/provenance';
import type {
  ImportedMeal,
  ImportedMealDraftPayload,
  ImportedMealImportType,
  ImportedMealParseStatus,
  ImportedMealSourceType,
  IngredientMatchEntry,
  NutritionEstimate,
  PlannedMealPayload,
  NDSConfidence,
} from './types';
import type { MealDerivedData } from '@/lib/nds/types';

// ============================================================================
// Row shape
// ============================================================================

interface ImportedMealRow {
  id: string;
  person_id: string;
  title: string;
  source_type: ImportedMealSourceType;
  source_url: string | null;
  payload: PlannedMealPayload;
  protein_score_10: number | null;
  is_main_meal: boolean;
  psq_multiplier: number | null;
  meal_derived_data: MealDerivedData;
  nds_confidence: NDSConfidence;
  import_type: ImportedMealImportType | null;
  source_platform: string | null;
  raw_input_text: string | null;
  parse_status: ImportedMealParseStatus;
  parsed_payload_json: ImportedMealDraftPayload | null;
  nutrition_estimate_json: NutritionEstimate | null;
  ingredient_match_json: IngredientMatchEntry[] | null;
  nds_version: string;
  classifier_version: string;
  created_at: string;
  updated_at: string;
}

function rowToImportedMeal(row: ImportedMealRow): ImportedMeal {
  return {
    id: row.id,
    person_id: row.person_id,
    title: row.title,
    source_type: row.source_type,
    source_url: row.source_url,
    payload: row.payload,
    protein_score_10: row.protein_score_10,
    is_main_meal: row.is_main_meal,
    psq_multiplier: row.psq_multiplier ?? 1,
    meal_derived_data: row.meal_derived_data,
    nds_confidence: row.nds_confidence,
    import_type: row.import_type,
    source_platform: row.source_platform,
    raw_input_text: row.raw_input_text,
    parse_status: row.parse_status ?? 'pending',
    parsed_payload_json: row.parsed_payload_json,
    nutrition_estimate_json: row.nutrition_estimate_json,
    ingredient_match_json: row.ingredient_match_json,
    nds_version: row.nds_version,
    classifier_version: row.classifier_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ============================================================================
// Create
// ============================================================================

export interface CreateImportedMealArgs {
  personId: string;
  title: string;
  source_type: ImportedMealSourceType;
  source_url: string | null;
  import_type: ImportedMealImportType;
  source_platform: string | null;
  raw_input_text: string | null;
  parse_status: ImportedMealParseStatus;
  parsed_payload_json: ImportedMealDraftPayload | null;
  nutrition_estimate_json: NutritionEstimate | null;
  ingredient_match_json: IngredientMatchEntry[] | null;
  payload: PlannedMealPayload;
  protein_score_10: number | null;
  is_main_meal: boolean;
  psq_multiplier: number;
  meal_derived_data: MealDerivedData;
  nds_confidence: NDSConfidence;
}

/**
 * Package 3 — person-scoped lookup by normalized source URL for deterministic
 * re-import handling. Compares normalized forms in memory (no DDL for a
 * normalized_source_url column). Returns the most recently updated match.
 */
export async function findImportedMealByNormalizedSourceUrl(
  personId: string,
  sourceUrl: string,
): Promise<ImportedMeal | null> {
  const target = normalizeSourceUrl(sourceUrl);
  if (!target) return null;

  const { data, error } = await supabaseAdmin
    .from('imported_meals')
    .select('*')
    .eq('person_id', personId)
    .not('source_url', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`Failed to find imported_meal by source_url: ${error.message}`);
  }

  for (const row of (data as ImportedMealRow[]) ?? []) {
    if (sourceUrlsMatch(row.source_url, target)) {
      return rowToImportedMeal(row);
    }
  }
  return null;
}

export async function createImportedMeal(
  args: CreateImportedMealArgs,
): Promise<ImportedMeal> {
  // Persist the normalized URL when parseable so later lookups are stable.
  const durableUrl = normalizeSourceUrl(args.source_url) ?? args.source_url;

  const { data, error } = await supabaseAdmin
    .from('imported_meals')
    .insert({
      person_id: args.personId,
      title: args.title,
      source_type: args.source_type,
      source_url: durableUrl,
      import_type: args.import_type,
      source_platform: args.source_platform,
      raw_input_text: args.raw_input_text,
      parse_status: args.parse_status,
      parsed_payload_json: args.parsed_payload_json,
      nutrition_estimate_json: args.nutrition_estimate_json,
      ingredient_match_json: args.ingredient_match_json,
      payload: args.payload,
      protein_score_10: args.protein_score_10,
      is_main_meal: args.is_main_meal,
      psq_multiplier: args.psq_multiplier,
      meal_derived_data: args.meal_derived_data,
      nds_confidence: args.nds_confidence,
      nds_version: NDS_VERSION,
      classifier_version: CLASSIFIER_VERSION,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to insert imported_meal: ${error.message}`);
  return rowToImportedMeal(data as ImportedMealRow);
}

// ============================================================================
// Read
// ============================================================================

export async function listImportedMeals(personId: string): Promise<ImportedMeal[]> {
  const { data, error } = await supabaseAdmin
    .from('imported_meals')
    .select('*')
    .eq('person_id', personId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to list imported_meals: ${error.message}`);
  return (data as ImportedMealRow[]).map(rowToImportedMeal);
}

export async function getImportedMeal(
  personId: string,
  id: string,
): Promise<ImportedMeal | null> {
  const { data, error } = await supabaseAdmin
    .from('imported_meals')
    .select('*')
    .eq('id', id)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load imported_meal: ${error.message}`);
  return data ? rowToImportedMeal(data as ImportedMealRow) : null;
}

// ============================================================================
// Update
// ============================================================================

export interface UpdateImportedMealArgs {
  title?: string;
  source_url?: string | null;
  raw_input_text?: string | null;
  payload?: PlannedMealPayload;
  parsed_payload_json?: ImportedMealDraftPayload | null;
  nutrition_estimate_json?: NutritionEstimate | null;
  ingredient_match_json?: IngredientMatchEntry[] | null;
  parse_status?: ImportedMealParseStatus;
  protein_score_10?: number | null;
  is_main_meal?: boolean;
  psq_multiplier?: number;
  meal_derived_data?: MealDerivedData;
  nds_confidence?: NDSConfidence;
}

export async function updateImportedMeal(
  personId: string,
  id: string,
  patch: UpdateImportedMealArgs,
): Promise<ImportedMeal | null> {
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.source_url !== undefined) updates.source_url = patch.source_url;
  if (patch.raw_input_text !== undefined) updates.raw_input_text = patch.raw_input_text;
  if (patch.payload !== undefined) updates.payload = patch.payload;
  if (patch.parsed_payload_json !== undefined)
    updates.parsed_payload_json = patch.parsed_payload_json;
  if (patch.nutrition_estimate_json !== undefined)
    updates.nutrition_estimate_json = patch.nutrition_estimate_json;
  if (patch.ingredient_match_json !== undefined)
    updates.ingredient_match_json = patch.ingredient_match_json;
  if (patch.parse_status !== undefined) updates.parse_status = patch.parse_status;
  if (patch.protein_score_10 !== undefined)
    updates.protein_score_10 = patch.protein_score_10;
  if (patch.is_main_meal !== undefined) updates.is_main_meal = patch.is_main_meal;
  if (patch.psq_multiplier !== undefined) updates.psq_multiplier = patch.psq_multiplier;
  if (patch.meal_derived_data !== undefined)
    updates.meal_derived_data = patch.meal_derived_data;
  if (patch.nds_confidence !== undefined) updates.nds_confidence = patch.nds_confidence;

  if (Object.keys(updates).length === 0) return getImportedMeal(personId, id);
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('imported_meals')
    .update(updates)
    .eq('id', id)
    .eq('person_id', personId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update imported_meal: ${error.message}`);
  return data ? rowToImportedMeal(data as ImportedMealRow) : null;
}

// ============================================================================
// Promote: imported_meal -> journal_meal_templates
// ============================================================================

/**
 * Maps the imported_meal's attachable payload items into the shape
 * expected by `journal_meal_templates.items`. We carry food_object_id
 * and macros/calories where present, and preserve provenance via a
 * `source_imported_meal_id` field so the template can always be
 * traced back to the draft it came from.
 */
export interface PromoteImportedMealArgs {
  personId: string;
  importedMealId: string;
  name?: string;
}

export interface MealTemplateItemShape {
  id: string;
  name?: string;
  quantity?: number;
  unit?: string;
  calories?: number;
  macros?: { protein?: number; carbs?: number; fat?: number };
  foodObjectId?: string;
}

interface AttachablePayloadForPromote {
  items?: Array<{
    name?: string | null;
    quantity?: number | null;
    unit?: string | null;
    calories?: number | null;
    food_object_id?: string | null;
    macros?: {
      protein_g?: number | null;
      carbs_g?: number | null;
      fat_g?: number | null;
    } | null;
  }>;
  totals?: {
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
  };
}

export interface PromoteImportedMealResult {
  template_id: string;
  imported_meal_id: string;
}

/**
 * Promote an imported_meals draft into a reusable
 * `journal_meal_templates` row.
 *
 * INSTRUCTION-SEPARATION CONTRACT (Packet 4 QA verified):
 *   - This function reads `imported.payload` (attachable shape), which
 *     is built exclusively from the parsed `ingredients` list by
 *     `recipeImporter.buildAttachablePayload`. It does NOT read
 *     `imported.parsed_payload_json.steps`.
 *   - The created template's `items` array therefore contains only
 *     ingredient entries (plus a single non-calorie `provenance` row).
 *   - Downstream readers (SlotEditor template picker, journal log
 *     `handleApplySavedMeal`) iterate `template.items` only, so steps
 *     cannot flow into planned_meals, journal entries, NDS scoring, or
 *     any nutrition derivation.
 * Do not change this function to consume `steps` without auditing
 * every `template.items` consumer.
 */
export async function promoteImportedMealToTemplate(
  args: PromoteImportedMealArgs,
): Promise<PromoteImportedMealResult> {
  const imported = await getImportedMeal(args.personId, args.importedMealId);
  if (!imported) {
    throw new Error('Imported meal not found.');
  }

  const attachable = imported.payload as unknown as AttachablePayloadForPromote;
  const rawItems: MealTemplateItemShape[] = (attachable.items ?? []).map((it, i) => {
    const item: MealTemplateItemShape = {
      id: `imp-${args.importedMealId}-${i}`,
    };
    if (it.name != null) item.name = it.name;
    if (typeof it.quantity === 'number') item.quantity = it.quantity;
    if (it.unit != null) item.unit = it.unit;
    if (typeof it.calories === 'number') item.calories = it.calories;
    if (it.macros) {
      item.macros = {};
      if (typeof it.macros.protein_g === 'number') item.macros.protein = it.macros.protein_g;
      if (typeof it.macros.carbs_g === 'number') item.macros.carbs = it.macros.carbs_g;
      if (typeof it.macros.fat_g === 'number') item.macros.fat = it.macros.fat_g;
    }
    if (it.food_object_id) item.foodObjectId = it.food_object_id;
    return item;
  });

  // Nutrition density summary: stored as an integer 0-100 for compatibility
  // with the existing meal-templates API. We derive a placeholder value
  // from the meal-level projected score when available so the picker
  // can order templates sensibly. This does NOT write to NDS tables —
  // the fixed model remains untouched.
  const nutrition_density =
    typeof imported.protein_score_10 === 'number'
      ? Math.max(0, Math.min(100, Math.round(imported.protein_score_10 * 10)))
      : null;

  // Provenance row — carries source marker only. Per-item rows now
  // carry their own calories/macros (buildAttachablePayload stamps
  // them), so SlotEditor's `totalsFromTemplateItems(...)` reconstitutes
  // the meal totals correctly without a double-counting summary.
  //
  // Backfill guarantee: if the imported_meal was persisted BEFORE the
  // per-item-calories fix and the per-item rows carry no calories, we
  // fall back to stamping the meal totals onto the provenance row so
  // older drafts don't promote to 0-cal templates.
  const totals = attachable.totals ?? {};
  const perItemHasCalories = rawItems.some(
    (it) => typeof it.calories === 'number' && it.calories > 0,
  );
  const provenance: MealTemplateItemShape = {
    id: `provenance-${args.importedMealId}`,
    name: `Imported from ${imported.source_platform ?? imported.source_type}`,
  };
  if (!perItemHasCalories) {
    if (typeof totals.calories === 'number') provenance.calories = totals.calories;
    if (
      typeof totals.protein_g === 'number' ||
      typeof totals.carbs_g === 'number' ||
      typeof totals.fat_g === 'number'
    ) {
      provenance.macros = {};
      if (typeof totals.protein_g === 'number')
        provenance.macros.protein = totals.protein_g;
      if (typeof totals.carbs_g === 'number')
        provenance.macros.carbs = totals.carbs_g;
      if (typeof totals.fat_g === 'number') provenance.macros.fat = totals.fat_g;
    }
  }

  const items: MealTemplateItemShape[] = [provenance, ...rawItems];

  const templateName =
    (args.name ?? '').trim().length > 0 ? (args.name as string).trim() : imported.title;

  const { data, error } = await supabaseAdmin
    .from('journal_meal_templates')
    .insert({
      person_id: args.personId,
      name: templateName,
      items,
      nutrition_density,
    })
    .select('id')
    .single();
  if (error) {
    throw new Error(`Failed to promote imported_meal to template: ${error.message}`);
  }

  return {
    template_id: (data as { id: string }).id,
    imported_meal_id: args.importedMealId,
  };
}
