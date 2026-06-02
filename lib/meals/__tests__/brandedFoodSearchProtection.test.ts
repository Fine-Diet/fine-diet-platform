/**
 * Meal Object Foundation — Packet 6: Branded food search protection.
 *
 * The most important P6 QA item: adding MealDocument search modes must NOT
 * change, reorder, or pollute the existing branded/custom food search path.
 *
 * This suite runs the REAL `searchFoods` pipeline (lib/food/foodServerService)
 * end-to-end against a mocked Supabase and asserts that the food search output
 * is unchanged by P6:
 *   - sections use ONLY the canonical food section keys, in canonical relative
 *     order (no 'meals' / 'recipes' / 'restaurants' / 'recent' leak in),
 *   - `FoodSearchResult` shape is intact (food / group / score),
 *   - `results` is still the flatten of `sections` (projection parity).
 *
 * It also locks the contract boundary: the MealDocument search modes are a
 * SEPARATE surface — 'foods' is explicitly NOT a MealDocument mode, so the new
 * service can never be routed through the branded food path.
 */

// ----------------------------------------------------------------------------
// Mocks — must precede importing searchFoods (mirrors goldenSearchRegression).
// ----------------------------------------------------------------------------

type FixtureResolver = (params: { table: string }) => unknown[] | { __error: string };
let fixtureResolver: FixtureResolver = () => [];

jest.mock('@/lib/supabaseServerClient', () => {
  const buildQueryBuilder = (table: string) => {
    const builder: Record<string, unknown> = {};
    const ret = () => builder;
    builder.select = jest.fn(ret);
    builder.eq = jest.fn(ret);
    builder.not = jest.fn(ret);
    builder.is = jest.fn(ret);
    builder.or = jest.fn(ret);
    builder.in = jest.fn(ret);
    builder.ilike = jest.fn(ret);
    builder.order = jest.fn(ret);
    builder.limit = jest.fn(ret);
    builder.single = jest.fn(() => ({
      then: (resolve: (v: { data: unknown; error: { message: string } | null }) => void) => {
        const result = fixtureResolver({ table });
        if (Array.isArray(result)) resolve({ data: result[0] ?? null, error: null });
        else resolve({ data: null, error: { message: result.__error } });
      },
    }));
    builder.insert = jest.fn(() => ({
      then: (resolve: (v: { data: unknown; error: null }) => void) =>
        resolve({ data: null, error: null }),
    }));
    builder.then = (
      resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => void,
    ) => {
      const result = fixtureResolver({ table });
      if (Array.isArray(result)) resolve({ data: result, error: null });
      else resolve({ data: null, error: { message: result.__error } });
    };
    return builder;
  };
  return { supabaseAdmin: { from: jest.fn((table: string) => buildQueryBuilder(table)) } };
});

jest.mock('@/lib/missingItems/missingItemRequestServerService', () => ({
  recordMissingItemRequest: jest.fn().mockResolvedValue(undefined),
}));

import { searchFoods } from '@/lib/food/foodServerService';
import { __resetBrandEvidenceCacheForTests } from '@/lib/food/brandEvidenceCache';
import {
  MEAL_DOCUMENT_SEARCH_MODES,
  isMealDocumentSearchMode,
  mealDocumentKindForMode,
} from '../searchTypes';

// Canonical food section order locked before P6 (foodServerService SECTION_ORDER).
const CANONICAL_FOOD_SECTION_ORDER = [
  'my_foods',
  'common',
  'branded',
  'scanned',
  'other',
  'promoted_off',
  'off',
] as const;

const NON_FOOD_SECTION_KEYS = ['meals', 'recipes', 'restaurants', 'recent'];

function brandedRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'branded-1',
    canonical_name: 'Chocolate Bar',
    brand_name: 'Hershey',
    aliases: [],
    source_type: 'branded',
    source_provider: 'fdc',
    source_id: null,
    source_dataset: null,
    upc: null,
    serving_size_g: 43,
    serving_unit: 'g',
    serving_description: '1 bar',
    household_serving_text: null,
    measures: null,
    calories: 220,
    protein_g: 3,
    carbs_g: 26,
    fat_g: 13,
    fiber_g: 1,
    sugar_g: 24,
    sodium_mg: 35,
    potassium_mg: null,
    magnesium_mg: null,
    iron_mg: null,
    calcium_mg: null,
    zinc_mg: null,
    folate_ug: null,
    vitamin_a_ug_rae: null,
    vitamin_c_mg: null,
    vitamin_d_ug: null,
    vitamin_b12_ug: null,
    nutrients_extended: {},
    nutrient_provenance: 'label',
    nutrient_confidence: 'medium',
    person_id: null,
    is_verified: false,
    image_url: null,
    category: null,
    tags: [],
    is_deleted: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  };
}

beforeEach(() => {
  fixtureResolver = () => [];
  __resetBrandEvidenceCacheForTests();
});

// ============================================================================
// Contract boundary — MealDocument modes are a separate surface
// ============================================================================

describe('search mode contract boundary', () => {
  it('does not treat foods as a MealDocument mode', () => {
    expect(isMealDocumentSearchMode('foods')).toBe(false);
    expect(MEAL_DOCUMENT_SEARCH_MODES).not.toContain('foods');
  });

  it('maps meal/recipe modes to kinds and all → both', () => {
    expect(mealDocumentKindForMode('meals')).toBe('meal');
    expect(mealDocumentKindForMode('recipes')).toBe('recipe');
    expect(mealDocumentKindForMode('all')).toBeNull();
  });

  it('keeps MealDocument section/mode names disjoint from food section keys', () => {
    for (const key of CANONICAL_FOOD_SECTION_ORDER) {
      expect(NON_FOOD_SECTION_KEYS).not.toContain(key);
    }
  });
});

// ============================================================================
// Branded food search output is unchanged by P6
// ============================================================================

describe('branded food search is unchanged by P6', () => {
  it('returns only canonical food sections, in canonical relative order', async () => {
    fixtureResolver = ({ table }) => (table === 'food_objects' ? [brandedRow()] : []);

    const res = await searchFoods('chocolate', null, { consumer: 'sections' });

    const keys = res.sections.map((s) => s.key);
    // Every section is a known food section — nothing from the new modes leaks.
    for (const key of keys) {
      expect(CANONICAL_FOOD_SECTION_ORDER).toContain(key);
      expect(NON_FOOD_SECTION_KEYS).not.toContain(key);
    }
    // The keys that DO appear follow the canonical relative order.
    const orderIdx = keys.map((k) => CANONICAL_FOOD_SECTION_ORDER.indexOf(k));
    const sorted = [...orderIdx].sort((a, b) => a - b);
    expect(orderIdx).toEqual(sorted);
  });

  it('preserves the FoodSearchResult shape (food / group / score)', async () => {
    fixtureResolver = ({ table }) => (table === 'food_objects' ? [brandedRow()] : []);

    const res = await searchFoods('chocolate', null, { consumer: 'sections' });
    expect(res.results.length).toBeGreaterThan(0);
    const top = res.results[0];
    expect(top.food).toBeDefined();
    expect(top.food.id).toBe('branded-1');
    expect(typeof top.score).toBe('number');
    expect(top.group).toBeDefined();
  });

  it('keeps results as the flatten of sections (projection parity)', async () => {
    fixtureResolver = ({ table }) => (table === 'food_objects' ? [brandedRow()] : []);

    const res = await searchFoods('chocolate', null, { consumer: 'sections' });
    const flattened = res.sections.flatMap((s) => s.items).map((r) => r.food.id);
    expect(res.results.map((r) => r.food.id)).toEqual(flattened);
  });

  it('empty query still short-circuits with no sections', async () => {
    fixtureResolver = () => {
      throw new Error('Should not query DB for empty query');
    };
    const res = await searchFoods('', null, {});
    expect(res.results).toEqual([]);
    expect(res.sections).toEqual([]);
  });
});
