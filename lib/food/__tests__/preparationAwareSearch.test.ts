/**
 * Preparation-aware search against a competing catalog.
 *
 * The fixture applies the same ILIKE filters searchFoods sends, and the
 * fuzzy RPC returns neighboring rows rather than only the desired food.
 */

import { applyPreparationSelection } from '@/lib/logDraft/logNutritionDraft';

type FoodRow = Record<string, unknown> & {
  id: string;
  canonical_name: string;
  brand_name: string | null;
  aliases: string[];
};

interface RpcHit {
  id: string;
  similarity: number;
}

let foodRows: FoodRow[] = [];
let failFoodObjects = false;
let failFoodObjectCall: number | null = null;
let failRpc = false;
let failHydrate = false;
let foodObjectCalls = 0;
let rpcCalls: Array<{ fn: string; query: string }> = [];
const rpcByQuery = new Map<string, RpcHit[]>();

function splitTop(input: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of input) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === separator && depth === 0) {
      if (current) parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

function conditionMatches(row: FoodRow, condition: string): boolean {
  const neq = condition.match(/^([a-z_]+)\.neq\.(.+)$/);
  if (neq) return String(row[neq[1]] ?? '') !== neq[2];
  const isNull = condition.match(/^([a-z_]+)\.is\.null$/);
  if (isNull) return row[isNull[1]] == null;
  const eq = condition.match(/^([a-z_]+)\.eq\.(.+)$/);
  if (eq) return String(row[eq[1]] ?? '') === eq[2];
  const like = condition.match(/^(canonical_name|brand_name)\.ilike\.(.+)$/);
  if (like) {
    const field = like[1] === 'canonical_name' ? row.canonical_name : row.brand_name ?? '';
    const pattern = like[2].toLowerCase();
    const text = String(field).toLowerCase();
    if (pattern.startsWith('%') && pattern.endsWith('%')) {
      return text.includes(pattern.slice(1, -1));
    }
    if (pattern.endsWith('%')) return text.startsWith(pattern.slice(0, -1));
    return text === pattern;
  }
  const alias = condition.match(/^aliases\.cs\.\{([^}]*)\}$/);
  if (alias) {
    return row.aliases.some((item) => item.toLowerCase() === alias[1].toLowerCase());
  }
  return false;
}

function matchesFilter(row: FoodRow, filter: string): boolean {
  if (filter.startsWith('and(') && filter.endsWith(')')) {
    return splitTop(filter.slice(4, -1), ',').every((group) => {
      const body = group.startsWith('or(') && group.endsWith(')') ? group.slice(3, -1) : group;
      return splitTop(body, ',').some((condition) => conditionMatches(row, condition));
    });
  }
  return splitTop(filter, ',').some((condition) => conditionMatches(row, condition));
}

jest.mock('@/lib/supabaseServerClient', () => {
  const buildQueryBuilder = (table: string) => {
    const orFilters: string[] = [];
    const inFilters: Array<[string, unknown[]]> = [];
    const eqs: Array<[string, unknown]> = [];
    let rowLimit: number | null = null;
    const builder: Record<string, unknown> = {};
    const ret = () => builder;
    builder.select = jest.fn(ret);
    builder.eq = jest.fn((col: string, val: unknown) => {
      eqs.push([col, val]);
      return builder;
    });
    builder.not = jest.fn((col: string, op: string, val: unknown) => {
      if (op === 'eq') eqs.push([`${col}__neq`, val]);
      return builder;
    });
    builder.is = jest.fn((col: string, val: unknown) => {
      eqs.push([col, val]);
      return builder;
    });
    builder.order = jest.fn(ret);
    builder.limit = jest.fn((count: number) => {
      rowLimit = count;
      return builder;
    });
    builder.or = jest.fn((expr: string) => {
      orFilters.push(expr);
      return builder;
    });
    builder.in = jest.fn((col: string, vals: unknown[]) => {
      inFilters.push([col, vals]);
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
      resolve: (value: { data: unknown[] | null; error: { message: string } | null }) => void,
    ) => {
      if (table === 'food_objects') foodObjectCalls += 1;
      if (table === 'food_objects' && failFoodObjects) {
        resolve({ data: null, error: { message: 'simulated timeout' } });
        return;
      }
      if (table === 'food_objects' && failFoodObjectCall === foodObjectCalls) {
        resolve({ data: null, error: { message: 'simulated phase timeout' } });
        return;
      }
      if (table === 'food_objects' && failHydrate && inFilters.some(([col]) => col === 'id')) {
        resolve({ data: null, error: { message: 'simulated hydrate timeout' } });
        return;
      }
      if (table !== 'food_objects') {
        resolve({ data: [], error: null });
        return;
      }
      const idFilter = inFilters.find(([col]) => col === 'id');
      let rows = foodRows.slice();
      for (const [col, val] of eqs) {
        if (col.endsWith('__neq')) {
          const field = col.replace(/__neq$/, '');
          rows = rows.filter((row) => row[field] !== val);
        } else if (val === null) {
          rows = rows.filter((row) => row[col] == null);
        } else {
          rows = rows.filter((row) => row[col] === val);
        }
      }
      if (idFilter) {
        const ids = new Set(idFilter[1] as string[]);
        rows = rows.filter((row) => ids.has(row.id));
      }
      if (orFilters.length > 0) {
        rows = rows.filter((row) => orFilters.every((filter) => matchesFilter(row, filter)));
      }
      if (rowLimit != null) rows = rows.slice(0, rowLimit);
      resolve({ data: rows, error: null });
    };
    return builder;
  };

  return {
    supabaseAdmin: {
      from: jest.fn((table: string) => buildQueryBuilder(table)),
      rpc: jest.fn(async (fn: string, args: { p_query?: string }) => {
        const query = String(args?.p_query ?? '');
        rpcCalls.push({ fn, query });
        if (failRpc) return { data: null, error: { message: 'simulated rpc timeout' } };
        return { data: rpcByQuery.get(query) ?? [], error: null };
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

function food(overrides: Partial<FoodRow> & { id: string; canonical_name: string }): FoodRow {
  return {
    brand_name: null,
    aliases: [],
    source_type: 'common',
    source_provider: 'usda',
    source_id: overrides.id,
    source_dataset: 'foundation',
    upc: null,
    serving_size_g: 91,
    serving_unit: 'g',
    serving_description: '91g',
    household_serving_text: null,
    measures: null,
    calories: 31,
    protein_g: 2.5,
    carbs_g: 6,
    fat_g: 0.3,
    fiber_g: 2.4,
    sugar_g: 1.4,
    sodium_mg: 30,
    nutrients_extended: {},
    nutrient_provenance: 'usda',
    nutrient_confidence: 'high',
    person_id: null,
    is_verified: true,
    image_url: null,
    category: null,
    tags: [],
    is_deleted: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function catalog(): FoodRow[] {
  const broccoliForms = [
    ['broccoli-steamed', 'Broccoli, steamed', 39],
    ['broccoli-raw', 'Broccoli, raw', 31],
    ['broccoli-boiled', 'Broccoli, boiled', 35],
    ['broccoli-roasted', 'Broccoli, roasted', 47],
    ['broccoli-plain', 'Broccoli', 34],
    ['broccoli-cooked', 'Broccoli, cooked', 35],
    ['broccoli-fried', 'Broccoli, fried', 80],
    ['broccoli-oil', 'Broccoli, roasted, with olive oil', 62],
  ] as const;
  return [
    ...broccoliForms.map(([id, name, calories]) =>
      food({ id, canonical_name: name, calories, measures: [{ unit: 'cup', grams: 156 }] }),
    ),
    food({
      id: 'broccoli-no-cup',
      canonical_name: 'Broccoli, steamed, no household measure',
      calories: 39,
      measures: null,
    }),
    food({
      id: 'brand-florets',
      canonical_name: 'Steamed Broccoli Florets',
      brand_name: 'Green Giant',
      source_type: 'branded',
      source_dataset: 'branded',
      calories: 25,
    }),
    food({
      id: 'user-steamed',
      canonical_name: 'My steamed broccoli',
      source_type: 'user',
      source_provider: null,
      source_dataset: null,
      person_id: 'person-a',
      calories: 40,
    }),
    food({
      id: 'other-user',
      canonical_name: 'Someone else steamed broccoli',
      source_type: 'user',
      source_provider: null,
      source_dataset: null,
      person_id: 'person-b',
      calories: 41,
    }),
    ...['Roasted Chicken', 'Roasted Potatoes', 'Roasted Cauliflower', 'Steamed Carrots', 'Steamed Spinach'].map(
      (name, index) => food({
        id: `other-${index}`,
        canonical_name: name,
        calories: 180 + index,
        source_dataset: 'foundation',
      }),
    ),
    food({
      id: 'fried-rice',
      canonical_name: 'Chicken Fried Rice',
      calories: 220,
      source_dataset: 'survey',
    }),
    food({
      id: 'chicken-fried',
      canonical_name: 'Chicken, fried',
      calories: 260,
    }),
    food({ id: 'raw-sugar', canonical_name: 'Raw Sugar', calories: 385 }),
    food({ id: 'peanut-butter', canonical_name: 'Peanut Butter', calories: 588, brand_name: 'Smucker\'s' }),
    food({
      id: 'chiquita',
      canonical_name: 'Chiquita Banana',
      brand_name: 'Chiquita',
      source_type: 'branded',
      source_dataset: 'branded',
      calories: 105,
      upc: '0092227741095',
    }),
    ...Array.from({ length: 14 }, (_, index) => food({
      id: `broccoli-filler-${index}`,
      canonical_name: `Broccoli, raw, lot ${index}`,
      calories: 30,
    })),
  ];
}

function statuses(response: Awaited<ReturnType<typeof searchFoods>>) {
  return response.results.map((result) => ({
    id: result.food.id,
    name: result.food.canonicalName,
    calories: result.food.calories,
    status: result.preparationMatch?.status ?? null,
    note: result.preparationMatch?.note ?? null,
  }));
}

beforeEach(() => {
  foodRows = catalog();
  failFoodObjects = false;
  failFoodObjectCall = null;
  failRpc = false;
  failHydrate = false;
  foodObjectCalls = 0;
  rpcCalls = [];
  rpcByQuery.clear();
  rpcByQuery.set('roasted brocoli', [
    { id: 'other-0', similarity: 0.55 },
    { id: 'other-1', similarity: 0.51 },
    { id: 'other-2', similarity: 0.49 },
  ]);
  rpcByQuery.set('brocoli', [
    { id: 'broccoli-raw', similarity: 0.74 },
    { id: 'broccoli-steamed', similarity: 0.7 },
    { id: 'broccoli-boiled', similarity: 0.66 },
    { id: 'broccoli-roasted', similarity: 0.64 },
    { id: 'other-0', similarity: 0.9 },
  ]);
  recordDemand.mockClear();
  __resetBrandEvidenceCacheForTests();
});

describe('preparation-aware search pipeline', () => {
  it('orders steamed broccoli the same from either word order and keeps the exact record visible', async () => {
    const samples: number[] = [];
    let first: Awaited<ReturnType<typeof searchFoods>> | null = null;
    let second: Awaited<ReturnType<typeof searchFoods>> | null = null;
    for (const query of ['broccoli steamed', 'steamed broccoli', 'broccoli steamed']) {
      const started = Date.now();
      const response = await searchFoods(query, null, { debug: true, consumer: 'sections' });
      samples.push(Date.now() - started);
      if (!first) first = response;
      else if (!second) second = response;
    }
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const commonA = first!.sections.find((section) => section.key === 'common');
    const commonB = second!.sections.find((section) => section.key === 'common');
    expect(commonA?.items[0]?.food.id).toBe('broccoli-steamed');
    expect(commonB?.items[0]?.food.id).toBe('broccoli-steamed');
    expect(commonA?.items[0]?.preparationMatch?.status).toBe('exact_preparation');
    expect(commonA?.items.map((item) => item.food.id)).not.toContain('other-3');
    expect(commonA?.items[0]?.food.canonicalName).toBe('Broccoli, steamed');
    expect(commonA?.items[0]?.food.calories).toBe(39);
    expect(first!.debug?.preparation?.recoveryCalls).toBe(0);
    expect(samples.every((sample) => sample >= 0)).toBe(true);
    expect(first!.debug?.retrieval?.some((call) => call.error)).toBe(false);
  });

  it('recovers brocoli, retains roasted, and rejects preparation-only neighbors', async () => {
    const beforeIds = ['other-0', 'other-1', 'other-2'];
    const response = await searchFoods('roasted brocoli', null, { debug: true });
    const rows = statuses(response);
    expect(rows.map((row) => row.id)).toContain('broccoli-roasted');
    expect(rows.find((row) => row.id === 'broccoli-roasted')?.status).toBe('exact_preparation');
    expect(rows.find((row) => row.id === 'broccoli-steamed')?.status).not.toBe('exact_preparation');
    expect(rows.find((row) => row.id === 'broccoli-boiled')?.status).not.toBe('exact_preparation');
    expect(rows.map((row) => row.id)).not.toEqual(expect.arrayContaining(beforeIds));
    expect(response.debug?.preparation?.identityTokens).toEqual(['brocoli']);
    expect(response.debug?.preparation?.requestedPreparation).toEqual(['roasted']);
    expect(response.debug?.preparation?.recoveryCalls).toBeLessThanOrEqual(1);
    expect(response.debug?.fallbackGate?.reason).toBe('no_fallback');
    expect(rpcCalls.map((call) => call.query)).toContain('brocoli');
    expect(rpcCalls.filter((call) => call.query === 'brocoli')).toHaveLength(1);
    expect(response.debug?.retrieval?.filter((call) => call.table === 'food_objects').length).toBeLessThanOrEqual(4);
  });

  it('labels a missing exact method as approximate without changing the record', async () => {
    foodRows = foodRows.filter((row) => row.id !== 'broccoli-steamed' && row.id !== 'brand-florets' && row.id !== 'user-steamed' && row.id !== 'other-user' && row.id !== 'broccoli-no-cup');
    const response = await searchFoods('steamed broccoli', null, { debug: true });
    const cooked = response.results.find((result) => result.food.id === 'broccoli-cooked');
    expect(cooked?.preparationMatch?.status).toBe('approximate_preparation');
    expect(cooked?.preparationMatch?.note).toBe(
      'Requested: steamed. Listed as: cooked, preparation unspecified.',
    );
    expect(cooked?.food.canonicalName).toBe('Broccoli, cooked');
    expect(cooked?.food.calories).toBe(35);
    expect(response.debug?.preparation?.demandGap).toBe('preparation_variant_not_found');
    expect(recordDemand).not.toHaveBeenCalled();
  });

  it('keeps raw, boiled, and roasted as different states', async () => {
    const raw = await searchFoods('raw broccoli', null, { debug: true, limit: 80, sectionLimit: 40 });
    const boiled = await searchFoods('boiled broccoli', null, { debug: true, limit: 80, sectionLimit: 40 });
    const roasted = await searchFoods('roasted broccoli', null, { debug: true, limit: 80, sectionLimit: 40 });
    expect(raw.sections.find((section) => section.key === 'common')?.items[0]?.food.id).toBe('broccoli-raw');
    expect(boiled.sections.find((section) => section.key === 'common')?.items[0]?.food.id).toBe('broccoli-boiled');
    expect(roasted.sections.find((section) => section.key === 'common')?.items[0]?.food.id).toBe('broccoli-roasted');
    expect(raw.results.find((result) => result.food.id === 'broccoli-raw')?.preparationMatch?.status).toBe('exact_preparation');
    expect(boiled.results.find((result) => result.food.id === 'broccoli-boiled')?.preparationMatch?.status).toBe('exact_preparation');
    expect(roasted.results.find((result) => result.food.id === 'broccoli-roasted')?.preparationMatch?.status).toBe('exact_preparation');
  });

  it('preserves butter, oil, and not-fried without inventing a fat amount', async () => {
    const butter = await searchFoods('broccoli with butter', null, { debug: true, limit: 80, sectionLimit: 40 });
    expect(butter.results.map((result) => result.food.id)).not.toContain('peanut-butter');
    const plain = butter.results.find((result) => result.food.id === 'broccoli-plain');
    expect(plain?.preparationMatch?.note).toBe(
      'Requested: with butter. Listed as: preparation unspecified.',
    );
    expect(plain?.preparationMatch?.note).not.toContain('Amount not specified.');
    expect(plain?.food.fatG).toBe(0.3);

    const oil = await searchFoods('roasted broccoli without oil', null, { debug: true, limit: 80, sectionLimit: 40 });
    expect(oil.results.find((result) => result.food.id === 'broccoli-oil')?.preparationMatch?.status).toBe('conflicting_preparation');
    expect(oil.results.find((result) => result.food.id === 'broccoli-roasted')?.preparationMatch?.note).toContain(
      'Oil is not stated on this record.',
    );
    expect(oil.results.find((result) => result.food.id === 'broccoli-roasted')?.food.calories).toBe(47);

    const fried = await searchFoods('broccoli not fried', null, { debug: true, limit: 80, sectionLimit: 40 });
    expect(fried.results.find((result) => result.food.id === 'broccoli-fried')?.preparationMatch?.status).toBe('conflicting_preparation');
    expect(fried.results.find((result) => result.food.id === 'broccoli-fried')?.preparationMatch?.note).toContain('Without fried.');

    const roastedButter = await searchFoods('roasted broccoli with butter', null, { debug: true, limit: 80, sectionLimit: 40 });
    const roasted = roastedButter.results.find((result) => result.food.id === 'broccoli-roasted');
    expect(roasted?.preparationMatch?.status).toBe('exact_preparation');
    expect(roasted?.preparationMatch?.note).toContain('with butter');
    expect(roasted?.preparationMatch?.note).toContain('Butter is not stated on this record.');
    expect(roasted?.preparationMatch?.note).not.toContain('Amount not specified.');
    expect(roasted?.food.canonicalName).toBe('Broccoli, roasted');
    expect(roasted?.food.calories).toBe(47);
  });

  it('carries one cup only when the selected record supports it and does not save', async () => {
    const response = await searchFoods('1 cup steamed broccoli', null, { debug: true });
    const supported = response.results.find((result) => result.food.id === 'broccoli-steamed');
    const unsupported = response.results.find((result) => result.food.id === 'broccoli-no-cup');
    expect(supported?.preparationMatch?.quantity).toEqual({ amount: 1, unit: 'cup' });
    expect(supported?.preparationMatch?.quantitySupported).toBe(true);
    expect(supported?.food.calories).toBe(39);
    const draft = applyPreparationSelection(
      {
        id: 'draft-1',
        sourceKey: 'food:broccoli-steamed',
        kind: 'single_item',
        title: supported!.food.canonicalName,
        quantity: 1,
        unit: 'serving',
        calories: supported!.food.calories,
        macros: { protein: supported!.food.proteinG, carbs: supported!.food.carbsG, fat: supported!.food.fatG },
        foodObjectId: supported!.food.id,
        servingSizeG: supported!.food.servingSizeG,
        measures: supported!.food.measures,
        createdAt: '2026-10-06T00:00:00.000Z',
        updatedAt: '2026-10-06T00:00:00.000Z',
      },
      supported?.preparationMatch,
    );
    expect(draft.quantity).toBe(1);
    expect(draft.unit).toBe('cup');
    expect(draft.calories).toBe(39);
    const unresolved = applyPreparationSelection(
      { ...draft, quantity: 1, unit: 'serving', unresolvedQuantityLabel: null },
      unsupported?.preparationMatch,
    );
    expect(unresolved.unit).toBe('serving');
    expect(unresolved.unresolvedQuantityLabel).toBe('1 cup');
    expect(unresolved.calories).toBe(39);
    expect(recordDemand).not.toHaveBeenCalled();
  });

  it('does not decompose protected names or a real brand', async () => {
    const rice = await searchFoods('chicken fried rice', null, { debug: true });
    expect(rice.debug?.preparation?.active).toBe(false);
    expect(rice.results.map((result) => result.food.id)).toContain('fried-rice');
    expect(rice.results.find((result) => result.food.id === 'fried-rice')?.preparationMatch).toBeUndefined();

    const sugar = await searchFoods('raw sugar', null, { debug: true });
    expect(sugar.debug?.preparation?.active).toBe(false);
    expect(sugar.results.map((result) => result.food.id)).toContain('raw-sugar');

    const peanut = await searchFoods('peanut butter', null, { debug: true });
    expect(peanut.debug?.preparation?.active).toBe(false);
    expect(peanut.results.map((result) => result.food.id)).toContain('peanut-butter');

    const brand = await searchFoods('Chiquita banana', null, { debug: true });
    expect(brand.debug?.preparation?.active).toBe(false);
    expect(brand.results.map((result) => result.food.id)).toContain('chiquita');
    expect(brand.debug?.preparation?.recoveryCalls).toBe(0);
  });

  it('leaves ordinary queries, short prefixes, and leading-zero UPCs on the existing path', async () => {
    const banana = await searchFoods('banana', null, { debug: true });
    expect(banana.debug?.preparation?.active).toBe(false);
    expect(banana.debug?.preparation?.recoveryCalls).toBe(0);
    expect(rpcCalls.every((call) => call.query === 'banana')).toBe(true);
    expect(banana.results.map((result) => result.food.id)).toContain('chiquita');

    const prefix = await searchFoods('br', null, { debug: true });
    expect(prefix.debug?.preparation?.retrievalStage).toBe('not_applicable');
    expect(recordDemand).not.toHaveBeenCalled();

    const upc = await searchFoods('0092227741095', null, { debug: true });
    expect(upc.debug?.preparation?.active).toBe(false);
    expect(upc.debug?.preparation?.recoveryCalls).toBe(0);
    expect(upc.debug?.rawQuery).toBe('0092227741095');
    expect(upc.debug?.fuzzyFallback?.reason).toBe('barcode_query');
    expect(upc.debug?.fuzzyFallback?.fired).toBe(false);
  });

  it('projects the same qualification and food identity for flat and sectioned consumers', async () => {
    const sectioned = await searchFoods('steamed broccoli', null, { consumer: 'sections', debug: true });
    const flat = await searchFoods('steamed broccoli', null, { consumer: 'flat', debug: true });
    const fromSections = sectioned.sections.flatMap((section) => section.items);
    expect(fromSections.map((item) => item.food.id)).toEqual(sectioned.results.map((item) => item.food.id));
    expect(fromSections.map((item) => item.preparationMatch?.status)).toEqual(
      sectioned.results.map((item) => item.preparationMatch?.status),
    );
    expect(flat.results.map((item) => item.food.id)).toEqual(sectioned.results.map((item) => item.food.id));
    expect(flat.results.map((item) => item.preparationMatch?.status)).toEqual(
      sectioned.results.map((item) => item.preparationMatch?.status),
    );

    const page = await searchFoods('steamed broccoli', null, {
      section: 'common',
      sectionOffset: 0,
      sectionLimit: 2,
      debug: true,
    });
    expect(page.sections.every((section) => section.key === 'common' || section.items.length === 0 || section.key === 'common')).toBe(true);
    expect(page.results.every((result) => result.preparationMatch)).toBe(true);
    expect(page.results[0]?.food.id).toBe('broccoli-steamed');
  });

  it('keeps a viewer on their own foods and public foods', async () => {
    const unscoped = foodRows.filter((row) =>
      row.is_deleted !== true && String(row.canonical_name).toLowerCase().includes('broccoli'),
    );
    expect(unscoped.map((row) => row.id)).toEqual(expect.arrayContaining(['user-steamed', 'other-user']));

    const anon = await searchFoods('steamed broccoli', null, { debug: true });
    expect(anon.results.map((result) => result.food.id)).not.toContain('user-steamed');
    expect(anon.results.map((result) => result.food.id)).not.toContain('other-user');
    expect(anon.results.map((result) => result.food.id)).toContain('broccoli-steamed');
    expect(anon.results.map((result) => result.food.id)).toContain('brand-florets');
    expect(JSON.stringify(anon)).not.toContain('person-b');
    expect(JSON.stringify(anon)).not.toContain('other-user');

    const mine = await searchFoods('steamed broccoli', 'person-a', { debug: true });
    expect(mine.results.map((result) => result.food.id)).toContain('user-steamed');
    expect(mine.results.find((result) => result.food.id === 'user-steamed')?.food.personId).toBe('person-a');
    expect(mine.results.find((result) => result.food.id === 'user-steamed')?.food.sourceType).toBe('user');
    expect(mine.results.map((result) => result.food.id)).not.toContain('other-user');
    expect(mine.sections.find((section) => section.key === 'my_foods')?.items.map((item) => item.food.id)).toContain('user-steamed');
    expect(JSON.stringify(mine)).not.toContain('other-user');
    expect(mine.results.find((result) => result.food.id === 'brand-florets')?.food.sourceDataset).toBe('branded');

    const theirs = await searchFoods('steamed broccoli', 'person-b', { debug: true });
    expect(theirs.results.map((result) => result.food.id)).toContain('other-user');
    expect(theirs.results.map((result) => result.food.id)).not.toContain('user-steamed');
    expect(theirs.results.map((result) => result.food.id)).toContain('broccoli-steamed');

    rpcByQuery.set('brocoli', [
      { id: 'other-user', similarity: 0.92 },
      { id: 'broccoli-roasted', similarity: 0.7 },
    ]);
    const recovered = await searchFoods('roasted brocoli', 'person-a', { debug: true });
    expect(recovered.results.map((result) => result.food.id)).not.toContain('other-user');
    expect(recovered.results.map((result) => result.food.id)).toContain('broccoli-roasted');
    expect(JSON.stringify(recovered.debug)).not.toContain('other-user');
  });

  it('keeps an exact method discoverable under a small limit without reordering sections', async () => {
    foodRows = foodRows.filter((row) => row.id !== 'user-steamed');
    foodRows.unshift(food({
      id: 'user-boiled',
      canonical_name: 'My boiled broccoli',
      source_type: 'user',
      source_provider: null,
      source_dataset: null,
      person_id: 'person-a',
      calories: 44,
    }));
    const response = await searchFoods('steamed broccoli', 'person-a', {
      limit: 1,
      sectionLimit: 12,
      debug: true,
    });
    const keys = response.sections.map((section) => section.key);
    expect(keys.indexOf('my_foods')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf('common')).toBeGreaterThan(keys.indexOf('my_foods'));
    expect(response.results.map((result) => result.food.id)).toContain('broccoli-steamed');
    expect(response.results.find((result) => result.food.id === 'broccoli-steamed')?.preparationMatch?.status).toBe('exact_preparation');
    expect(response.results.find((result) => result.food.id === 'broccoli-steamed')?.food.calories).toBe(39);
  });

  it('keeps the requested method inside the 12 accepted fuzzy rows', async () => {
    const pack = Array.from({ length: 13 }, (_, index) => {
      const row = food({
        id: `boiled-pack-${index}`,
        canonical_name: `Broccoli, boiled, pack ${index}`,
        calories: 35,
      });
      foodRows.push(row);
      return { id: row.id, similarity: 0.95 - index * 0.01 };
    });
    rpcByQuery.set('brocoli', [
      { id: 'other-0', similarity: 0.99 },
      ...pack,
      { id: 'broccoli-steamed', similarity: 0.45 },
    ]);
    const response = await searchFoods('steamed brocoli', null, { debug: true });
    expect(response.results.map((result) => result.food.id)).toContain('broccoli-steamed');
    expect(response.results.find((result) => result.food.id === 'broccoli-steamed')?.preparationMatch?.status).toBe('exact_preparation');
    expect(response.results.map((result) => result.food.id)).not.toContain('other-0');
    expect(response.results.filter((result) => result.food.id.startsWith('boiled-pack-')).length).toBeLessThanOrEqual(11);
    expect(response.debug?.preparation?.recoveryCalls).toBe(1);
  });

  it('does not treat a single failed retrieval stage as a missing food', async () => {
    failFoodObjectCall = 2;
    const phaseB = await searchFoods('steamed xylocarp', null, { debug: true });
    expect(phaseB.debug?.preparation?.demandGap).toBeNull();
    expect(phaseB.results.every((result) => result.preparationMatch?.status !== 'approximate_preparation')).toBe(true);
    expect(recordDemand).not.toHaveBeenCalled();

    failFoodObjectCall = null;
    failRpc = true;
    recordDemand.mockClear();
    const rpc = await searchFoods('roasted brocoli', null, { debug: true });
    expect(rpc.debug?.preparation?.demandGap).toBeNull();
    expect(rpc.results.every((result) => result.preparationMatch?.status !== 'approximate_preparation')).toBe(true);
    expect(recordDemand).not.toHaveBeenCalled();

    failRpc = false;
    failHydrate = true;
    recordDemand.mockClear();
    const hydrate = await searchFoods('roasted brocoli', null, { debug: true });
    expect(hydrate.debug?.preparation?.demandGap).toBeNull();
    expect(hydrate.debug?.retrieval?.some((call) => call.error === 'simulated hydrate timeout')).toBe(true);
    expect(recordDemand).not.toHaveBeenCalled();
  });

  it('hands decimal and fraction amounts to the draft only when the measure exists', async () => {
    const decimal = await searchFoods('1.5 cups steamed broccoli', null, { debug: true });
    const supported = decimal.results.find((result) => result.food.id === 'broccoli-steamed');
    expect(supported?.preparationMatch?.quantity).toEqual({ amount: 1.5, unit: 'cup' });
    expect(supported?.preparationMatch?.quantitySupported).toBe(true);
    expect(supported?.food.calories).toBe(39);
    const draft = applyPreparationSelection(
      {
        id: 'draft-decimal',
        sourceKey: 'food:broccoli-steamed',
        kind: 'single_item',
        title: supported!.food.canonicalName,
        quantity: 1,
        unit: 'serving',
        calories: supported!.food.calories,
        macros: { protein: supported!.food.proteinG, carbs: supported!.food.carbsG, fat: supported!.food.fatG },
        foodObjectId: supported!.food.id,
        servingSizeG: supported!.food.servingSizeG,
        measures: supported!.food.measures,
        createdAt: '2026-10-06T00:00:00.000Z',
        updatedAt: '2026-10-06T00:00:00.000Z',
      },
      supported?.preparationMatch,
    );
    expect(draft.quantity).toBe(1.5);
    expect(draft.unit).toBe('cup');
    expect(draft.calories).toBe(39);

    const fraction = await searchFoods('1/2 cup steamed broccoli', null, { debug: true });
    const half = fraction.results.find((result) => result.food.id === 'broccoli-steamed');
    const halfDraft = applyPreparationSelection(
      { ...draft, quantity: 1, unit: 'serving' },
      half?.preparationMatch,
    );
    expect(half?.preparationMatch?.quantity).toEqual({ amount: 0.5, unit: 'cup' });
    expect(halfDraft.quantity).toBe(0.5);
    expect(halfDraft.unit).toBe('cup');

    const negative = await searchFoods('-1 cup steamed broccoli', null, { debug: true });
    const negated = negative.results.find((result) => result.food.id === 'broccoli-steamed');
    expect(negated?.preparationMatch?.quantity).toBeNull();
    const negativeDraft = applyPreparationSelection(
      { ...draft, quantity: 1, unit: 'serving' },
      negated?.preparationMatch,
    );
    expect(negativeDraft.quantity).toBe(1);
    expect(negativeDraft.unit).toBe('serving');
    expect(negativeDraft.calories).toBe(39);
  });

  it('does not turn a database timeout into demand or an approximate match', async () => {
    failFoodObjects = true;
    const response = await searchFoods('steamed broccoli', null, { debug: true });
    expect(response.totalReturned).toBe(0);
    expect(response.results.every((result) => result.preparationMatch == null)).toBe(true);
    expect(response.debug?.preparation?.demandGap).toBeNull();
    expect(recordDemand).not.toHaveBeenCalled();
    expect(response.debug?.retrieval?.some((call) => call.error === 'simulated timeout')).toBe(true);
  });

  it('names a completed miss as base food not found and keeps methods apart', async () => {
    foodRows = [];
    await searchFoods('steamed xylocarp', null);
    await searchFoods('roasted xylocarp', null);
    expect(recordDemand).toHaveBeenCalledTimes(2);
    expect(recordDemand.mock.calls[0][0].rawInput).toBe('steamed xylocarp');
    expect(recordDemand.mock.calls[0][0].fallbackMetadata.demand_gap).toBe('base_food_not_found');
    expect(recordDemand.mock.calls[0][0].fallbackMetadata.requested_preparation).toEqual(['steamed']);
    expect(recordDemand.mock.calls[1][0].fallbackMetadata.requested_preparation).toEqual(['roasted']);
    expect(recordDemand.mock.calls[0][0].rawInput).not.toBe(recordDemand.mock.calls[1][0].rawInput);
  });
});
