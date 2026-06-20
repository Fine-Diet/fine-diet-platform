/**
 * Log Builder Search — Read-only server service
 *
 * Provides the Search/Library data layer for the future Log Builder
 * (`/app/log/new`). This is ADDITIVE: it composes existing, proven read paths
 * into the unified `LogSearchResult` banks and never rewrites them.
 *
 *   - Foods   → wraps `searchFoods` (lib/food/foodServerService) verbatim. The
 *               existing `/api/foods/search` endpoint is untouched; food source
 *               sections (Branded / Common / Scanned / Open Food Facts …) are
 *               preserved exactly as that service returns them.
 *   - Meals   → saved meal templates via `mealTemplateToMealDocument`, plus
 *               imported docs that resolve to kind='meal'. Adapted through the
 *               canonical lib/meals adapters — no new meal shape.
 *   - Recipes → imported docs that resolve to kind='recipe' via
 *               `importedMealToMealDocumentDraft` (MealDocument kind='recipe').
 *   - Recent  → recently-logged foods (same read model as /api/journal/history).
 *
 * SAFETY: read-only. No writes, no schema changes, no destructive operations.
 * Server-only — never import from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { searchFoods } from '@/lib/food/foodServerService';
import { listMealTemplates } from '@/lib/journal/journalServerService';
import { listImportedMeals } from '@/lib/plans/importsServerService';
import {
  mealTemplateToMealDocument,
  importedMealToMealDocumentDraft,
} from '@/lib/meals/adapters';
import type { MealDocument } from '@/lib/meals/types';
import {
  foodResultToLogSearchResult,
  mealDocumentToMealResult,
  mealDocumentToRecipeResult,
  recentItemToLogSearchResult,
} from './adapters';
import type {
  LogCaptureAction,
  LogSearchBadge,
  LogSearchBankKey,
  LogSearchResponse,
  LogSearchResult,
  LogSearchSection,
  RecentLoggedItem,
} from './types';

// ============================================================================
// Options & defaults
// ============================================================================

const DEFAULT_TOTAL_LIMIT = 50;
const DEFAULT_SECTION_LIMIT = 12;

/** Order offsets so the parallel banks always sort after food sections. */
const MEALS_SECTION_ORDER = 1000;
const RECIPES_SECTION_ORDER = 1010;
const RECENT_SECTION_ORDER = 1020;

export interface LogSearchOptions {
  /** Overall max results across all banks (default 50). */
  limit?: number;
  /** Max results per section/bank (default 12). */
  sectionLimit?: number;
  /** Which banks to include. Defaults to all four (Search mode). */
  banks?: LogSearchBankKey[];
  /** Pass-through to the food search debug payload. */
  debug?: boolean;
  /** Forwarded to searchFoods for event logging/diagnostics. */
  sessionId?: string | null;
  pageContext?: string | null;
}

const ALL_BANKS: LogSearchBankKey[] = ['foods', 'meals', 'recipes', 'recent'];

// ============================================================================
// Capture mode placeholders (future hooks — not implemented in this packet)
// ============================================================================

/**
 * Capture-mode actions the Log Builder will eventually expose. `import_recipe`
 * is wired to the existing import endpoint; the scan/barcode tools are future
 * hooks and reported as `available: false`. This packet does not implement any
 * Capture write/processing paths.
 */
function captureActions(): LogCaptureAction[] {
  return [
    { id: 'scan_label', label: 'Scan Nutrition Label', available: false, endpoint: null },
    { id: 'scan_meal', label: 'Scan Meal', available: false, endpoint: null },
    { id: 'barcode', label: 'Scan Barcode', available: false, endpoint: null },
    {
      id: 'import_recipe',
      label: 'Import Recipe',
      available: true,
      endpoint: '/api/journal/plans/ai/import-recipe',
    },
  ];
}

// ============================================================================
// Query helpers (pure)
// ============================================================================

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Adapt a list of source rows into MealDocuments, skipping (rather than
 * throwing on) any single row that fails to adapt. A malformed legacy template
 * or imported meal therefore degrades to "missing from the bank" instead of
 * blanking the entire Library/Search response. Failures are logged for triage.
 */
function adaptDocsSafely<T>(rows: T[], adapt: (row: T) => MealDocument, label: string): MealDocument[] {
  const docs: MealDocument[] = [];
  for (const row of rows) {
    try {
      docs.push(adapt(row));
    } catch (err) {
      console.error(`[logSearch] skipped a ${label} that failed to adapt:`, err);
    }
  }
  return docs;
}

/** A meal/recipe matches when the normalized query is empty (Library browse) or
 *  appears in the title or any component name. */
function docMatchesQuery(doc: MealDocument, q: string): boolean {
  if (!q) return true;
  if (normalize(doc.title).includes(q)) return true;
  return doc.components.some((c) => normalize(c.name).includes(q));
}

/** Collect grounded food_object_ids referenced by a set of meal documents. */
function collectFoodObjectIds(docs: MealDocument[]): Set<string> {
  const ids = new Set<string>();
  for (const doc of docs) {
    for (const c of doc.components) {
      if (c.food_object_id) ids.add(c.food_object_id);
    }
  }
  return ids;
}

// ============================================================================
// Recent-logged read model (mirrors /api/journal/history)
// ============================================================================

/**
 * Read-only: recently-logged foods, deduped by food object (most recent first).
 * Mirrors `/api/journal/history` rather than introducing a new read path.
 */
export async function listRecentLoggedFoods(
  personId: string,
  limit = DEFAULT_SECTION_LIMIT,
): Promise<RecentLoggedItem[]> {
  const { data: entries, error } = await supabaseAdmin
    .from('journal_entries')
    .select('payload, occurred_at')
    .eq('person_id', personId)
    .eq('entry_type', 'intake')
    .not('payload->foodObjectId', 'is', null)
    .order('occurred_at', { ascending: false })
    .limit(limit * 3);

  if (error) throw new Error(`Failed to list recent logged foods: ${error.message}`);
  if (!entries || entries.length === 0) return [];

  const seen = new Set<string>();
  const deduped: Array<{
    foodObjectId: string;
    name: string;
    calories: number | null;
    macros?: { protein?: number; carbs?: number; fat?: number };
    servingSizeG: number | null;
    occurredAt: string;
  }> = [];

  for (const entry of entries) {
    const payload = entry.payload as Record<string, any>;
    const foodObjectId = payload?.foodObjectId as string | undefined;
    if (!foodObjectId || seen.has(foodObjectId)) continue;
    seen.add(foodObjectId);
    deduped.push({
      foodObjectId,
      name: payload?.name || 'Unknown',
      calories: typeof payload?.calories === 'number' ? payload.calories : null,
      macros: payload?.macros,
      servingSizeG: typeof payload?.servingSizeG === 'number' ? payload.servingSizeG : null,
      occurredAt: entry.occurred_at,
    });
    if (deduped.length >= limit) break;
  }

  const foodIds = deduped.map((e) => e.foodObjectId);
  const foodInfo = new Map<
    string,
    { servingUnit: string | null; servingSizeG: number | null; measures: RecentLoggedItem['measures'] }
  >();

  if (foodIds.length > 0) {
    const { data: foods } = await supabaseAdmin
      .from('food_objects')
      .select('id, serving_unit, serving_size_g, measures')
      .in('id', foodIds)
      .eq('is_deleted', false);
    if (foods) {
      for (const f of foods) {
        foodInfo.set(f.id, {
          servingUnit: f.serving_unit,
          servingSizeG: f.serving_size_g,
          measures: f.measures ?? null,
        });
      }
    }
  }

  return deduped.map((e) => {
    const info = foodInfo.get(e.foodObjectId);
    return {
      foodObjectId: e.foodObjectId,
      name: e.name,
      calories: e.calories,
      proteinG: e.macros?.protein ?? null,
      carbsG: e.macros?.carbs ?? null,
      fatG: e.macros?.fat ?? null,
      servingSizeG: e.servingSizeG ?? info?.servingSizeG ?? null,
      servingUnit: info?.servingUnit ?? null,
      measures: info?.measures ?? null,
      lastOccurredAt: e.occurredAt,
    };
  });
}

// ============================================================================
// Main entry — logSearch
// ============================================================================

/**
 * Unified read-only Log Builder search. Composes the four banks and returns a
 * banked + flattened result set. When `query` is empty/short the food bank is
 * empty (food search requires ≥2 chars) but the Meals/Recipes/Recent banks
 * still list (Library browse). Pass `banks` to scope which banks are returned.
 */
export async function logSearch(
  query: string,
  personId: string | null,
  options: LogSearchOptions = {},
): Promise<LogSearchResponse> {
  const {
    limit = DEFAULT_TOTAL_LIMIT,
    sectionLimit = DEFAULT_SECTION_LIMIT,
    banks = ALL_BANKS,
    debug = false,
    sessionId = null,
    pageContext = null,
  } = options;

  const q = normalize(query);
  const wantFoods = banks.includes('foods');
  const wantMeals = banks.includes('meals');
  const wantRecipes = banks.includes('recipes');
  const wantRecent = banks.includes('recent');

  const sections: LogSearchSection[] = [];

  // --- Library docs (fetched once; reused for banks + relationship badges) ---
  // Meals bank = saved templates (kind='meal') + imported docs that resolve to
  // kind='meal'. Recipes bank = imported docs that resolve to kind='recipe'.
  let allMealDocs: MealDocument[] = [];
  let allRecipeDocs: MealDocument[] = [];

  const needsLibrary = personId && (wantMeals || wantRecipes || wantFoods);
  if (needsLibrary && personId) {
    const [templates, imported] = await Promise.all([
      wantMeals ? listMealTemplates(personId) : Promise.resolve([]),
      wantMeals || wantRecipes ? listImportedMeals(personId) : Promise.resolve([]),
    ]);

    const templateDocs = adaptDocsSafely(templates, mealTemplateToMealDocument, 'saved meal template');
    const importedDocs = adaptDocsSafely(imported, importedMealToMealDocumentDraft, 'imported meal');

    allMealDocs = [...templateDocs, ...importedDocs.filter((d) => d.kind === 'meal')];
    allRecipeDocs = importedDocs.filter((d) => d.kind === 'recipe');
  }

  // Relationship sets computed from the FULL library (unfiltered) so a food row
  // truthfully shows "Used in Meals" / "In Recipes" regardless of the query.
  const mealFoodIds = collectFoodObjectIds(allMealDocs);
  const recipeFoodIds = collectFoodObjectIds(allRecipeDocs);

  // --- Foods bank ---
  let foodSectionCount = 0;
  let foodTotal = 0;
  let foodDebug: unknown;
  if (wantFoods) {
    const foodResponse = await searchFoods(query, personId, {
      limit,
      sectionLimit,
      debug,
      sessionId,
      pageContext,
      consumer: 'sections',
    });
    foodDebug = foodResponse.debug;

    for (const section of foodResponse.sections) {
      const items: LogSearchResult[] = section.items.map((food) => {
        const relBadges: LogSearchBadge[] = [];
        if (mealFoodIds.has(food.food.id)) {
          relBadges.push({ kind: 'used_in_meals', label: 'Used in Meals' });
        }
        if (recipeFoodIds.has(food.food.id)) {
          relBadges.push({ kind: 'in_recipes', label: 'In Recipes' });
        }
        return foodResultToLogSearchResult(food, section.key, relBadges);
      });

      foodTotal += section.total;
      sections.push({
        key: section.key,
        label: section.label,
        order: section.order,
        kind: 'food',
        total: section.total,
        shown: items.length,
        hasMore: section.hasMore,
        items,
      });
    }
    foodSectionCount = foodResponse.sections.length;
  }

  // --- Meals bank ---
  let mealsTotal = 0;
  if (wantMeals) {
    const matched = allMealDocs.filter((d) => docMatchesQuery(d, q));
    mealsTotal = matched.length;
    const items = matched.slice(0, sectionLimit).map(mealDocumentToMealResult);
    sections.push({
      key: 'meals',
      label: 'Meals',
      order: MEALS_SECTION_ORDER,
      kind: 'meal',
      total: mealsTotal,
      shown: items.length,
      hasMore: mealsTotal > items.length,
      items,
    });
  }

  // --- Recipes bank ---
  let recipesTotal = 0;
  if (wantRecipes) {
    const matched = allRecipeDocs.filter((d) => docMatchesQuery(d, q));
    recipesTotal = matched.length;
    const items = matched.slice(0, sectionLimit).map(mealDocumentToRecipeResult);
    sections.push({
      key: 'recipes',
      label: 'Recipes',
      order: RECIPES_SECTION_ORDER,
      kind: 'recipe',
      total: recipesTotal,
      shown: items.length,
      hasMore: recipesTotal > items.length,
      items,
    });
  }

  // --- Recent bank ---
  let recentTotal = 0;
  if (wantRecent && personId) {
    const recent = await listRecentLoggedFoods(personId, sectionLimit);
    const matched = q ? recent.filter((r) => normalize(r.name).includes(q)) : recent;
    recentTotal = matched.length;
    const items = matched.map(recentItemToLogSearchResult);
    sections.push({
      key: 'recent',
      label: 'Recently Logged',
      order: RECENT_SECTION_ORDER,
      kind: 'recent_entry',
      total: recentTotal,
      shown: items.length,
      hasMore: false,
      items,
    });
  }

  // Deterministic order: ascending `order` (food sections first, then banks).
  sections.sort((a, b) => a.order - b.order);

  const results: LogSearchResult[] = [];
  for (const section of sections) {
    for (const item of section.items) results.push(item);
  }

  const response: LogSearchResponse = {
    query,
    sections,
    results,
    banks: {
      foods: { sectionCount: foodSectionCount, total: foodTotal },
      meals: { total: mealsTotal },
      recipes: { total: recipesTotal },
      recent: { total: recentTotal },
    },
    captureActions: captureActions(),
  };

  if (debug) {
    response.debug = {
      query,
      normalizedQuery: q,
      includedBanks: banks,
      foodDebug,
    };
  }

  return response;
}
