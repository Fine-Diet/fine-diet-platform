/**
 * Food Search Reliability v1.
 *
 * Outcome checks for canonical placement, typo fallback, and missing-food
 * demand. Scores are not locked.
 */

import fs from 'fs';
import path from 'path';
import { evaluateMissingFoodDemand } from '../missingFoodDemandEligibility';
import {
  acceptFuzzyCandidate,
  damerauLevenshteinSimilarity,
  diceCoefficient,
  shouldRunFuzzyFallback,
} from '../fuzzyFoodSearch';
import {
  FOOD_SEARCH_EVENT_INSERT_COLUMNS,
  buildFoodSearchEventRow,
} from '../foodSearchEventSchema';
import { normalizeSearchQuery } from '../searchNormalization';

type FoodRow = Record<string, unknown>;

let foodRows: FoodRow[] = [];
let offRows: FoodRow[] = [];
let rpcCalls = 0;

const TYPO_HITS: Record<string, { id: string; similarity: number }> = {
  chaqita: { id: 'brand-chiquita', similarity: 0.55 },
  drumbstick: { id: 'food-drumstick', similarity: 0.72 },
  ezekial: { id: 'brand-ezekiel', similarity: 0.61 },
  amyul: { id: 'brand-amylu', similarity: 0.5 },
  bannana: { id: 'staple-banana', similarity: 0.8 },
  brocolli: { id: 'staple-broccoli', similarity: 0.74 },
};

jest.mock('@/lib/supabaseServerClient', () => {
  const buildQueryBuilder = (table: string) => {
    const filters: Array<[string, ...unknown[]]> = [];
    const inFilters: Array<[string, unknown[]]> = [];
    const builder: Record<string, unknown> = {};
    const ret = () => builder;
    builder.select = jest.fn(ret);
    builder.eq = jest.fn(ret);
    builder.not = jest.fn(ret);
    builder.is = jest.fn(ret);
    builder.or = jest.fn(ret);
    builder.order = jest.fn(ret);
    builder.limit = jest.fn(ret);
    builder.in = jest.fn((col: string, vals: unknown[]) => {
      inFilters.push([col, vals]);
      filters.push(['in', col, vals]);
      return builder;
    });
    builder.insert = jest.fn(() => ({
      then: (resolve: (value: { data: null; error: null }) => void) =>
        resolve({ data: null, error: null }),
    }));
    builder.single = jest.fn(() => ({
      then: (resolve: (value: { data: null; error: null }) => void) =>
        resolve({ data: null, error: null }),
    }));
    builder.then = (
      resolve: (value: { data: unknown[] | null; error: null }) => void,
    ) => {
      if (table === 'off_products_mirror') {
        resolve({ data: offRows, error: null });
        return;
      }
      if (table !== 'food_objects') {
        resolve({ data: [], error: null });
        return;
      }
      const idFilter = inFilters.find(([col]) => col === 'id');
      if (idFilter) {
        const ids = new Set(idFilter[1] as string[]);
        resolve({ data: foodRows.filter((row) => ids.has(String(row.id))), error: null });
        return;
      }
      resolve({ data: foodRows, error: null });
    };
    return builder;
  };

  return {
    supabaseAdmin: {
      from: jest.fn((table: string) => buildQueryBuilder(table)),
      rpc: jest.fn(async (_fn: string, args: { p_query?: string }) => {
        rpcCalls += 1;
        const hit = TYPO_HITS[String(args?.p_query ?? '')];
        return { data: hit ? [hit] : [], error: null };
      }),
    },
  };
});

jest.mock('@/lib/missingItems/missingItemRequestServerService', () => ({
  recordMissingItemRequest: jest.fn().mockResolvedValue({ id: 'req-1' }),
}));

import { searchFoods } from '../foodServerService';
import { recordMissingItemRequest } from '@/lib/missingItems/missingItemRequestServerService';
import { __resetBrandEvidenceCacheForTests } from '../brandEvidenceCache';

const recordDemand = recordMissingItemRequest as jest.Mock;

function food(overrides: FoodRow): FoodRow {
  return {
    id: 'food',
    canonical_name: 'Food',
    brand_name: null,
    aliases: [],
    source_type: 'common',
    source_provider: 'usda',
    source_id: null,
    source_dataset: 'foundation',
    upc: null,
    serving_size_g: 100,
    serving_unit: 'g',
    serving_description: '100g',
    household_serving_text: null,
    measures: null,
    calories: 100,
    protein_g: 5,
    carbs_g: 10,
    fat_g: 2,
    fiber_g: 1,
    sugar_g: 2,
    sodium_mg: 10,
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
    nutrient_provenance: 'usda',
    nutrient_confidence: 'medium',
    person_id: null,
    is_verified: false,
    image_url: null,
    category: null,
    tags: [],
    is_deleted: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const STAPLES = [
  'Banana',
  'Apple',
  'Broccoli',
  'Chicken Breast',
  'Brown Rice',
  'Avocado',
  'Salmon',
  'Greek Yogurt',
  'Oatmeal',
  'Egg',
  'Whole Milk',
] as const;

function stapleId(name: string): string {
  return `staple-${name.toLowerCase().replace(/\s+/g, '-')}`;
}

function buildCatalog(): FoodRow[] {
  const staples = STAPLES.flatMap((name) => [
    food({
      id: stapleId(name),
      canonical_name: name,
      source_type: 'common',
      source_provider: null,
      source_dataset: null,
      is_verified: true,
      nutrient_provenance: 'internal',
    }),
    food({
      id: `usda-${stapleId(name)}`,
      canonical_name: `${name}, cooked`,
      source_type: 'common',
      source_provider: 'usda',
      source_dataset: 'foundation',
      is_verified: false,
    }),
  ]);

  return [
    ...staples,
    food({
      id: 'noise-banana-chips',
      canonical_name: 'Banana Chips',
      source_type: 'common',
      source_provider: null,
      source_dataset: null,
      is_verified: false,
    }),
    food({
      id: 'usda-banana-overripe',
      canonical_name: 'Bananas, Overripe',
      source_provider: 'usda',
      source_type: 'common',
      source_dataset: 'survey',
    }),
    food({
      id: 'usda-banana-slight',
      canonical_name: 'Bananas, Slightly Ripe',
      source_provider: 'usda',
      source_type: 'common',
      source_dataset: 'sr_legacy',
    }),
    food({
      id: 'brand-chiquita',
      canonical_name: 'Chiquita Banana',
      brand_name: 'Chiquita',
      source_type: 'branded',
      source_provider: 'usda',
      source_dataset: 'branded',
    }),
    food({
      id: 'brand-chobani',
      canonical_name: 'Chobani Greek Yogurt',
      brand_name: 'Chobani',
      source_type: 'branded',
      source_provider: 'usda',
      source_dataset: 'branded',
    }),
    food({
      id: 'brand-amylu',
      canonical_name: 'Breakfast Time Chicken Mini Links',
      brand_name: 'Amylu',
      source_type: 'branded',
      source_provider: 'usda',
      source_dataset: 'branded',
      upc: '092227741095',
    }),
    food({
      id: 'brand-cheerios',
      canonical_name: 'Cheerios Whole Grain Oats',
      brand_name: 'Cheerios',
      source_type: 'branded',
      source_provider: 'usda',
      source_dataset: 'branded',
    }),
    food({
      id: 'food-drumstick',
      canonical_name: 'Chicken Drumstick',
      source_type: 'common',
      source_provider: 'usda',
      source_dataset: 'foundation',
    }),
    food({
      id: 'brand-ezekiel',
      canonical_name: 'Ezekiel 4:9 Bread',
      brand_name: 'Food for Life',
      source_type: 'branded',
      source_provider: 'usda',
      source_dataset: 'branded',
    }),
  ];
}

function names(response: Awaited<ReturnType<typeof searchFoods>>): string[] {
  return response.results.map((result) => result.food.canonicalName);
}

beforeEach(() => {
  foodRows = buildCatalog();
  offRows = [];
  rpcCalls = 0;
  recordDemand.mockClear();
  recordDemand.mockResolvedValue({ id: 'req-1' });
  __resetBrandEvidenceCacheForTests();
});

describe('missing-food demand eligibility', () => {
  it.each(['br', 'bre', 'mcd', 'bur', 'chaqi', 'chaqit'])(
    'rejects partial typing %s',
    (query) => {
      expect(evaluateMissingFoodDemand(query)).toEqual({
        eligible: false,
        reason: 'partial_typing',
      });
    },
  );

  it('accepts a completed phrase, a long single token, and a barcode', () => {
    expect(evaluateMissingFoodDemand('xylocarp pudding').reason).toBe('completed_phrase');
    expect(evaluateMissingFoodDemand('1 cup chopped kale').reason).toBe('completed_phrase');
    expect(evaluateMissingFoodDemand('xylocarpz').reason).toBe('completed_single_token');
    expect(evaluateMissingFoodDemand('092227741095').reason).toBe('barcode');
    expect(evaluateMissingFoodDemand('0092227741095').reason).toBe('barcode');
    expect(evaluateMissingFoodDemand('greek yo').reason).toBe('partial_typing');
  });
});

describe('searchFoods missing-food queue', () => {
  it('does not queue partial typing', async () => {
    for (const query of ['br', 'bre', 'mcd', 'bur', 'chaqi', 'chaqit']) {
      await searchFoods(query, null, { debug: true });
    }
    expect(recordDemand).not.toHaveBeenCalled();
  });

  it('queues a completed unknown phrase and a barcode miss', async () => {
    foodRows = [];
    await searchFoods('xylocarp pudding', null);
    await searchFoods('092227741095', null);
    expect(recordDemand).toHaveBeenCalledTimes(2);
    expect(recordDemand.mock.calls[0][0].rawInput).toBe('xylocarp pudding');
    expect(recordDemand.mock.calls[0][0].context).toBe('journal_search');
    expect(recordDemand.mock.calls[1][0].rawInput).toBe('092227741095');
    expect(recordDemand.mock.calls[1][0].fallbackMetadata.demand_eligibility).toBe('barcode');
  });

  it('does not queue a barcode that resolved', async () => {
    foodRows = [];
    offRows = [{
      off_product_id: '0092227741095',
      product_name: 'Breakfast Time Chicken Mini Links',
      generic_name: null,
      brands: 'Amylu',
      barcode: '0092227741095',
      serving_size: '100g',
      quantity: null,
      energy_kcal_100g: 230,
      protein_g_100g: 14,
      carbs_g_100g: 2,
      fat_g_100g: 18,
      fiber_g_100g: 0,
      sugars_g_100g: 1,
      sodium_mg_100g: 400,
      image_front_url: null,
      image_url: null,
    }];
    const response = await searchFoods('092227741095', null, { debug: true });
    expect(response.results.map((result) => result.food.upc)).toContain('0092227741095');
    expect(recordDemand).not.toHaveBeenCalled();
    expect(response.debug?.fuzzyFallback?.fired).toBe(false);
    expect(response.debug?.fuzzyFallback?.reason).toBe('barcode_query');
  });

  it('keeps a demand-write failure from failing the search', async () => {
    foodRows = [];
    recordDemand.mockRejectedValueOnce(new Error('demand insert failed'));
    await expect(searchFoods('xylocarp pudding', null)).resolves.toMatchObject({
      totalReturned: 0,
    });
  });
});

describe('canonical common placement', () => {
  it.each(STAPLES)('places verified %s in Common Foods ahead of the USDA variant', async (name) => {
    const response = await searchFoods(name, null, { debug: true });
    const common = response.sections.find((section) => section.key === 'common');
    expect(common?.items[0]?.food.id).toBe(stapleId(name));
    expect(common?.items[0]?.food.canonicalName).toBe(name);
    const flat = names(response);
    expect(flat.indexOf(name)).toBeGreaterThanOrEqual(0);
    expect(flat.indexOf(name)).toBeLessThan(flat.indexOf(`${name}, cooked`));
    expect(response.debug?.fuzzyFallback?.fired).toBe(false);
  });

  it('ranks exact Banana ahead of overripe and slightly ripe USDA bananas', async () => {
    const response = await searchFoods('banana', null);
    const common = response.sections.find((section) => section.key === 'common');
    const commonNames = common?.items.map((item) => item.food.canonicalName) ?? [];
    expect(commonNames[0]).toBe('Banana');
    expect(commonNames.indexOf('Banana')).toBeLessThan(commonNames.indexOf('Bananas, Overripe'));
    expect(commonNames.indexOf('Banana')).toBeLessThan(commonNames.indexOf('Bananas, Slightly Ripe'));
    expect(commonNames).not.toContain('Banana Chips');
    const other = response.sections.find((section) => section.key === 'other');
    expect(other?.items.map((item) => item.food.canonicalName) ?? []).toContain('Banana Chips');
  });
});

describe('branded reachability', () => {
  it('reaches Chiquita, Chobani, Amylu, and Cheerios without fuzzy fallback', async () => {
    const chiquita = await searchFoods('Chiquita banana', null, { debug: true });
    expect(names(chiquita)[0]).toBe('Chiquita Banana');
    expect(chiquita.debug?.fuzzyFallback?.fired).toBe(false);

    const chobani = await searchFoods('Chobani greek yogurt', null, { debug: true });
    expect(names(chobani)).toContain('Chobani Greek Yogurt');
    expect(names(chobani).indexOf('Chobani Greek Yogurt')).toBeLessThan(3);
    expect(chobani.debug?.fuzzyFallback?.fired).toBe(false);

    const amylu = await searchFoods('Amylu', null, { debug: true });
    expect(names(amylu)).toContain('Breakfast Time Chicken Mini Links');
    expect(amylu.debug?.fuzzyFallback?.fired).toBe(false);

    const cheerios = await searchFoods('Cheerios', null, { debug: true });
    expect(names(cheerios)[0]).toBe('Cheerios Whole Grain Oats');
    expect(cheerios.debug?.fuzzyFallback?.fired).toBe(false);
  });
});

describe('typo fallback', () => {
  it.each([
    ['chaqita', 'Chiquita Banana'],
    ['drumbstick', 'Chicken Drumstick'],
    ['ezekial', 'Ezekiel 4:9 Bread'],
    ['amyul', 'Breakfast Time Chicken Mini Links'],
    ['bannana', 'Banana'],
    ['brocolli', 'Broccoli'],
  ])('%s reaches %s and records that fuzzy fallback fired', async (query, expected) => {
    const before = rpcCalls;
    const response = await searchFoods(query, null, { debug: true });
    expect(response.debug?.fuzzyFallback?.fired).toBe(true);
    expect(response.debug?.fuzzyFallback?.acceptedCount).toBeGreaterThan(0);
    expect(rpcCalls).toBeGreaterThan(before);
    expect(names(response)[0]).toBe(expected);
    const noise = names(response).slice(1);
    expect(noise).not.toContain('Chicken Breast');
    if (expected !== 'Banana') expect(noise).not.toContain('Apple');
  });

  it('does not expand a short ambiguous prefix into Chiquita', async () => {
    const response = await searchFoods('chaqi', null, { debug: true });
    expect(names(response)).not.toContain('Chiquita Banana');
    expect(recordDemand).not.toHaveBeenCalled();
  });

  it('does not let a fuzzy banana outrank a Chobani query', async () => {
    const response = await searchFoods('chobani bannana', null, { debug: true });
    const flat = names(response);
    expect(flat).toContain('Chobani Greek Yogurt');
    if (flat.includes('Banana')) {
      expect(flat.indexOf('Chobani Greek Yogurt')).toBeLessThan(flat.indexOf('Banana'));
    }
  });

  it('keeps an exact banana ahead of any fuzzy row', () => {
    const normalized = normalizeSearchQuery('banana');
    const decision = shouldRunFuzzyFallback({
      normalized: normalized.normalized,
      tokens: normalized.tokens,
      tokenGroups: normalized.tokenGroups,
      rows: [{ canonical_name: 'Banana', brand_name: null }],
    });
    expect(decision).toEqual({ run: false, reason: 'strong_normal_match' });
  });
});

describe('ingredient-like phrase', () => {
  it('still surfaces broccoli for a quantity phrase', async () => {
    const response = await searchFoods('1 cup chopped broccoli', null);
    expect(names(response).slice(0, 3)).toContain('Broccoli');
  });
});

describe('fuzzy acceptance', () => {
  it('accepts the proven typos and rejects a shorter prefix', () => {
    expect(diceCoefficient('chaqita', 'Chiquita')).toBeGreaterThanOrEqual(0.42);
    expect(damerauLevenshteinSimilarity('amyul', 'Amylu')).toBeGreaterThanOrEqual(0.8);
    expect(diceCoefficient('bannana', 'banana')).toBeGreaterThanOrEqual(0.42);
    expect(diceCoefficient('brocolli', 'broccoli')).toBeGreaterThanOrEqual(0.42);
    expect(diceCoefficient('chaqi', 'Chiquita')).toBeLessThan(0.42);

    const groups = normalizeSearchQuery('chaqita').tokenGroups;
    expect(acceptFuzzyCandidate({
      query: 'chaqita',
      tokens: ['chaqita'],
      tokenGroups: groups,
      canonicalName: 'Chiquita Banana',
      brandName: 'Chiquita',
      rpcSimilarity: 0.4,
    })).toBe(true);
    expect(acceptFuzzyCandidate({
      query: 'chobani bannana',
      tokens: ['chobani', 'bannana'],
      tokenGroups: normalizeSearchQuery('chobani bannana').tokenGroups,
      canonicalName: 'Banana',
      brandName: null,
      rpcSimilarity: 0.5,
    })).toBe(false);
  });
});

type SearchEventCell = boolean | null;

interface AppliedSearchEventMigration {
  tableExists: boolean;
  columns: Set<string>;
  rows: Array<Record<string, SearchEventCell>>;
  steps: string[];
}

/**
 * Applies the idempotent events script to an in-memory catalog.
 * CREATE TABLE and ADD COLUMN honor IF NOT EXISTS. Each DO block's
 * EXISTS / NOT EXISTS checks are evaluated against the columns present
 * at that point, then its RENAME or backfill runs only when they hold.
 */
function applyFoodSearchEventsMigration(
  sql: string,
  start: {
    tableExists: boolean;
    columns: string[];
    rows: Array<Record<string, SearchEventCell>>;
  },
): AppliedSearchEventMigration {
  const source = sql
    .split('\n')
    .map((line) => {
      const mark = line.indexOf('--');
      return mark === -1 ? line : line.slice(0, mark);
    })
    .join('\n');
  const columns = new Set(start.columns);
  const rows = start.rows.map((row) => ({ ...row }));
  let tableExists = start.tableExists;
  const steps: string[] = [];
  const token =
    /CREATE TABLE IF NOT EXISTS public\.food_search_events \(([\s\S]*?)\);|ADD COLUMN IF NOT EXISTS\s+([a-z_]+)|DO \$\$([\s\S]*?)\$\$;/g;

  let match: RegExpExecArray | null;
  while ((match = token.exec(source)) !== null) {
    if (match[1] != null) {
      steps.push('create');
      if (!tableExists) {
        tableExists = true;
        for (const line of match[1].split('\n')) {
          const column = line.match(/^\s*([a-z_]+)\s+(UUID|TEXT|INTEGER|BOOLEAN|TIMESTAMPTZ)\b/i);
          if (column) columns.add(column[1]);
        }
      }
      continue;
    }

    if (match[2] != null) {
      const name = match[2];
      steps.push(`add:${name}`);
      if (tableExists && !columns.has(name)) {
        columns.add(name);
        for (const row of rows) row[name] = null;
      }
      continue;
    }

    const block = match[3];
    const checks: Array<{ name: string; present: boolean }> = [];
    const checkRe =
      /(NOT\s+EXISTS|EXISTS)\s*\(\s*SELECT\s+1\s+FROM\s+information_schema\.columns[\s\S]*?column_name\s*=\s*'([a-z_]+)'[\s\S]*?\)/gi;
    let check: RegExpExecArray | null;
    while ((check = checkRe.exec(block)) !== null) {
      checks.push({
        name: check[2],
        present: !/^NOT/i.test(check[1]),
      });
    }
    if (checks.length === 0) {
      throw new Error('DO block has no information_schema column check');
    }
    const holds = tableExists && checks.every((item) => columns.has(item.name) === item.present);
    const rename = block.match(/RENAME COLUMN\s+([a-z_]+)\s+TO\s+([a-z_]+)/i);
    const backfill = block.match(
      /SET\s+([a-z_]+)\s*=\s*([a-z_]+)[\s\S]*?WHERE\s+([a-z_]+)\s+IS NULL\s+AND\s+([a-z_]+)\s+IS NOT NULL/i,
    );
    if (rename) steps.push(`rename:${rename[1]}->${rename[2]}`);
    if (backfill) steps.push(`backfill:${backfill[2]}->${backfill[1]}`);
    if (!holds) continue;

    if (rename) {
      const from = rename[1];
      const to = rename[2];
      columns.delete(from);
      columns.add(to);
      for (const row of rows) {
        row[to] = row[from] ?? null;
        delete row[from];
      }
    }

    if (backfill) {
      const dest = backfill[1];
      const sourceColumn = backfill[2];
      const destGuard = backfill[3];
      const sourceGuard = backfill[4];
      if (dest !== destGuard || sourceColumn !== sourceGuard) {
        throw new Error('Backfill SET and WHERE columns disagree');
      }
      for (const row of rows) {
        if (row[dest] == null && row[sourceColumn] != null) {
          row[dest] = row[sourceColumn];
        }
      }
    }
  }

  return { tableExists, columns, rows, steps };
}

const LEGACY_FOOD_SEARCH_EVENT_COLUMNS = [
  'id',
  'event_type',
  'session_id',
  'person_id',
  'query',
  'total_result_count',
  'curated_result_count',
  'off_result_count',
  'selected_food_id',
  'selected_food_source',
  'selected_result_position',
  'page_context',
  'created_at',
  'normalized_query',
  'off_fallback_shown',
  'near_exact_curated_match',
];

describe('food_search_events schema contract', () => {
  const read = (relative: string) =>
    fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

  it('matches the insert written by logSearchEvent', () => {
    const row = buildFoodSearchEventRow({
      eventType: 'search_zero_results',
      query: 'banana',
      offFallbackShown: null,
      nearExactMatchExisted: null,
    });
    expect(Object.keys(row).sort()).toEqual([...FOOD_SEARCH_EVENT_INSERT_COLUMNS].sort());
    expect(row.near_exact_match_existed).toBeNull();
    expect(row.off_fallback_shown).toBeNull();

    const current = read('scripts/sql/foodSearchEventsCurrent.sql');
    for (const column of FOOD_SEARCH_EVENT_INSERT_COLUMNS) {
      expect(current).toContain(column);
    }
    expect(current).toContain('ENABLE ROW LEVEL SECURITY');
    expect(current).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_search_events TO service_role',
    );
    expect(current).toContain('idx_food_search_events_created');
    expect(current).toContain('idx_food_search_events_person');
    expect(current).toContain('idx_food_search_events_type');
    expect(current).toContain('near_exact_curated_match');
    expect(current).toContain('RENAME COLUMN near_exact_curated_match TO near_exact_match_existed');

    const applied = applyFoodSearchEventsMigration(current, {
      tableExists: false,
      columns: [],
      rows: [],
    });
    const renameAt = applied.steps.indexOf(
      'rename:near_exact_curated_match->near_exact_match_existed',
    );
    const addAt = applied.steps.indexOf('add:near_exact_match_existed');
    const backfillAt = applied.steps.indexOf(
      'backfill:near_exact_curated_match->near_exact_match_existed',
    );
    expect(renameAt).toBeGreaterThanOrEqual(0);
    expect(addAt).toBeGreaterThan(renameAt);
    expect(backfillAt).toBeGreaterThan(addAt);

    const alter = read('scripts/sql/alterFoodSearchEventsPhase3.sql');
    expect(alter).toContain('near_exact_match_existed');
    expect(alter).not.toMatch(/ADD COLUMN IF NOT EXISTS near_exact_curated_match/);
    expect(alter).not.toMatch(/BOOLEAN NOT NULL/);
  });

  it('renames a legacy near-exact column before adding the canonical one', () => {
    const current = read('scripts/sql/foodSearchEventsCurrent.sql');
    const applied = applyFoodSearchEventsMigration(current, {
      tableExists: true,
      columns: LEGACY_FOOD_SEARCH_EVENT_COLUMNS,
      rows: [
        { near_exact_curated_match: true },
        { near_exact_curated_match: false },
        { near_exact_curated_match: null },
      ],
    });

    expect(applied.columns.has('near_exact_curated_match')).toBe(false);
    expect(applied.columns.has('near_exact_match_existed')).toBe(true);
    expect(applied.rows.map((row) => row.near_exact_match_existed)).toEqual([
      true,
      false,
      null,
    ]);
    expect(applied.rows.every((row) => !('near_exact_curated_match' in row))).toBe(true);
  });

  it('backfills legacy values when both near-exact columns already exist', () => {
    const current = read('scripts/sql/foodSearchEventsCurrent.sql');
    const applied = applyFoodSearchEventsMigration(current, {
      tableExists: true,
      columns: [...LEGACY_FOOD_SEARCH_EVENT_COLUMNS, 'near_exact_match_existed'],
      rows: [
        { near_exact_curated_match: true, near_exact_match_existed: null },
        { near_exact_curated_match: true, near_exact_match_existed: false },
        { near_exact_curated_match: false, near_exact_match_existed: null },
        { near_exact_curated_match: null, near_exact_match_existed: true },
      ],
    });

    expect(applied.columns.has('near_exact_curated_match')).toBe(true);
    expect(applied.columns.has('near_exact_match_existed')).toBe(true);
    expect(applied.rows).toEqual([
      { near_exact_curated_match: true, near_exact_match_existed: true },
      { near_exact_curated_match: true, near_exact_match_existed: false },
      { near_exact_curated_match: false, near_exact_match_existed: false },
      { near_exact_curated_match: null, near_exact_match_existed: true },
    ]);
  });

  it('prepares a capped service-role trigram RPC with production-shape typo rescue', () => {
    const sql = read('scripts/sql/foodSearchFuzzyFallbackV1.sql');
    const body = sql.slice(sql.indexOf('AS $'), sql.lastIndexOf('$'));
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    expect(sql).toContain('search_food_objects_fuzzy_v1');
    expect(sql).toContain('word_similarity');
    expect(sql).toContain('pg_catalog.similarity');
    expect(sql).toContain('generate_series');
    expect(sql).toContain('transposition_candidates');
    expect(sql).toContain('set_config');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) TO service_role');
    expect(sql).not.toContain('TO anon');
    expect(body).toMatch(/v_query\s+%\s+fo\.canonical_name\b/);
    expect(body).toMatch(/v_query\s+%\s+fo\.brand_name\b/);
    expect(body).toMatch(/v_query\s+<%\s+fo\.canonical_name\b/);
    expect(body).toMatch(/v_query\s+<%\s+fo\.brand_name\b/);
    expect(body).not.toMatch(/[%<]\s+lower\s*\(/);
    expect(body).toContain('fo.brand_name IS NOT NULL');
    expect(body).toContain("DEFAULT 0.20");
  });
});
