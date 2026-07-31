/**
 * Meal Object Foundation — Packet 6: MealDocument search service tests.
 *
 * Proves the retrieval contract WITHOUT a real database:
 *   - person scope is applied on every query (no cross-user reads),
 *   - meals vs recipes filtering (explicit kind + mode-derived),
 *   - review_state filter,
 *   - empty/browse query orders by updated_at DESC and applies no ilike,
 *   - query search matches title (ilike) with wildcards escaped,
 *   - limit is clamped,
 *   - ONLY the meal_documents table is queried (branded food search untouched),
 *   - the service performs no writes.
 */

import type { MealDocument } from '../types';

// ----------------------------------------------------------------------------
// Supabase mock — chainable, thenable query builder that records the calls the
// service issues and resolves a queued result.
// ----------------------------------------------------------------------------

let mockFrom!: jest.Mock;
let resultQueue: Array<{ data: unknown; error: unknown }> = [];
let fromTables: string[] = [];
let eqCalls: Array<[string, unknown]> = [];
let ilikeCalls: Array<[string, unknown]> = [];
let orderCalls: Array<[string, unknown]> = [];
let limitCalls: number[] = [];
let rangeCalls: Array<[number, number]> = [];
let writeCalls: string[] = [];

function nextResult(): { data: unknown; error: unknown } {
  return resultQueue.shift() ?? { data: [], error: null };
}

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  return { supabaseAdmin: { from: mockFrom } };
});

function makeBuilder() {
  const q: Record<string, unknown> = {};
  q.select = jest.fn(() => q);
  q.eq = jest.fn((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return q;
  });
  q.ilike = jest.fn((col: string, val: unknown) => {
    ilikeCalls.push([col, val]);
    return q;
  });
  q.order = jest.fn((col: string, opts: unknown) => {
    orderCalls.push([col, opts]);
    return q;
  });
  q.limit = jest.fn((n: number) => {
    limitCalls.push(n);
    return q;
  });
  q.range = jest.fn((from: number, to: number) => {
    rangeCalls.push([from, to]);
    return q;
  });
  // Guard rails: any write verb fails the test loudly.
  q.insert = jest.fn(() => {
    writeCalls.push('insert');
    return q;
  });
  q.update = jest.fn(() => {
    writeCalls.push('update');
    return q;
  });
  q.delete = jest.fn(() => {
    writeCalls.push('delete');
    return q;
  });
  q.upsert = jest.fn(() => {
    writeCalls.push('upsert');
    return q;
  });
  (q as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(nextResult()).then(resolve, reject);
  return q;
}

import {
  clampSearchLimit,
  escapeIlikePattern,
  searchMealDocumentsForPerson,
} from '../mealDocumentSearchService';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const PERSON = 'person-1';

function doc(overrides: Partial<MealDocument> = {}): MealDocument {
  return {
    schema_version: 1,
    id: 'doc-1',
    person_id: PERSON,
    kind: 'meal',
    review_state: 'confirmed',
    title: 'Chicken Bowl',
    description: 'A bowl',
    intents: ['lunch'],
    meal_type_hint: 'lunch',
    components: [],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: { calories: 500, macros: { protein_g: 40, carbs_g: 30, fat_g: 20 } },
    totals: null,
    source: { source_type: 'manual' },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function row(d: MealDocument, id = 'row-1', person = PERSON) {
  return {
    id,
    person_id: person,
    kind: d.kind,
    title: d.title,
    description: d.description,
    review_state: d.review_state,
    intents: d.intents,
    source_type: d.source.source_type,
    document_json: { ...d, id, person_id: person },
    updated_at: '2026-01-02T00:00:00.000Z',
  };
}

beforeEach(() => {
  resultQueue = [];
  fromTables = [];
  eqCalls = [];
  ilikeCalls = [];
  orderCalls = [];
  limitCalls = [];
  rangeCalls = [];
  writeCalls = [];
  mockFrom.mockReset();
  mockFrom.mockImplementation((table: string) => {
    fromTables.push(table);
    return makeBuilder();
  });
});

// ============================================================================
// pure helpers
// ============================================================================

describe('clampSearchLimit', () => {
  it('defaults, clamps low, and caps high', () => {
    expect(clampSearchLimit(undefined)).toBe(20);
    expect(clampSearchLimit(null)).toBe(20);
    expect(clampSearchLimit(0)).toBe(1);
    expect(clampSearchLimit(-5)).toBe(1);
    expect(clampSearchLimit(9999)).toBe(50);
    expect(clampSearchLimit(12)).toBe(12);
    expect(clampSearchLimit(Number.NaN)).toBe(20);
  });
});

describe('escapeIlikePattern', () => {
  it('escapes ilike wildcards so they match literally', () => {
    expect(escapeIlikePattern('100%')).toBe('100\\%');
    expect(escapeIlikePattern('a_b')).toBe('a\\_b');
    expect(escapeIlikePattern('back\\slash')).toBe('back\\\\slash');
    expect(escapeIlikePattern('plain')).toBe('plain');
  });
});

// ============================================================================
// person scope + table isolation
// ============================================================================

describe('searchMealDocumentsForPerson — person scope & isolation', () => {
  it('always scopes to the owner and only queries meal_documents', async () => {
    resultQueue = [{ data: [row(doc())], error: null }];

    await searchMealDocumentsForPerson(PERSON, {});

    expect(fromTables).toEqual(['meal_documents']);
    expect(eqCalls).toContainEqual(['person_id', PERSON]);
    // No branded food table is ever touched by this service.
    expect(fromTables).not.toContain('food_objects');
    expect(fromTables).not.toContain('off_products_mirror');
  });

  it('performs no writes', async () => {
    resultQueue = [{ data: [row(doc())], error: null }];
    await searchMealDocumentsForPerson(PERSON, { q: 'chicken' });
    expect(writeCalls).toEqual([]);
  });

  it('maps rows into typed meal_document results with per-serving nutrition', async () => {
    resultQueue = [{ data: [row(doc())], error: null }];
    const out = await searchMealDocumentsForPerson(PERSON, {});
    expect(out.results).toHaveLength(1);
    const r = out.results[0];
    expect(r.type).toBe('meal_document');
    expect(r.id).toBe('row-1');
    expect(r.person_id).toBe(PERSON);
    expect(r.document_kind).toBe('meal');
    expect(r.title).toBe('Chicken Bowl');
    expect(r.nutrition?.calories).toBe(500);
  });
});

// ============================================================================
// browse mode
// ============================================================================

describe('searchMealDocumentsForPerson — browse mode (empty query)', () => {
  it('orders by updated_at desc and applies no ilike', async () => {
    resultQueue = [{ data: [row(doc()), row(doc(), 'row-2')], error: null }];

    const out = await searchMealDocumentsForPerson(PERSON, { q: '   ' });

    expect(out.browse).toBe(true);
    expect(out.query).toBe('');
    expect(ilikeCalls).toHaveLength(0);
    expect(orderCalls).toContainEqual(['updated_at', { ascending: false }]);
  });

  it('applies the default limit when none is given', async () => {
    resultQueue = [{ data: [], error: null }];
    const out = await searchMealDocumentsForPerson(PERSON, {});
    expect(out.limit).toBe(20);
    // Active library pages via range (document_json archive filter).
    expect(rangeCalls[0]).toEqual([0, 49]);
  });

  it('applies stable secondary order by id after updated_at', async () => {
    resultQueue = [{ data: [], error: null }];
    await searchMealDocumentsForPerson(PERSON, {});
    expect(orderCalls).toEqual([
      ['updated_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });

  it('preserves equal-timestamp active rows in stable id order from the page', async () => {
    const stamp = '2026-07-31T12:00:00.000Z';
    // Simulates DB returning ties ordered by id DESC after updated_at DESC.
    resultQueue = [
      {
        data: [
          row(
            doc({
              id: 'b-active',
              title: 'Active B',
              lifecycle_state: 'active',
              updated_at: stamp,
            }),
            'b-active',
          ),
          row(
            doc({
              id: 'a-active',
              title: 'Active A',
              lifecycle_state: 'active',
              updated_at: stamp,
            }),
            'a-active',
          ),
        ],
        error: null,
      },
    ];

    const out = await searchMealDocumentsForPerson(PERSON, { limit: 2 });
    expect(orderCalls).toEqual([
      ['updated_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(out.results.map((r) => r.id)).toEqual(['b-active', 'a-active']);
  });

  it('pages past archived rows so active library is not under-filled', async () => {
    const archivedPage = Array.from({ length: 50 }, (_, i) =>
      row(
        doc({
          id: `arch-${i}`,
          title: `Archived ${i}`,
          lifecycle_state: 'archived',
          archived_at: '2026-07-01T00:00:00.000Z',
        }),
        `arch-${i}`,
      ),
    );
    const activePage = [
      row(doc({ id: 'active-1', title: 'Still Active', lifecycle_state: 'active' }), 'active-1'),
      row(doc({ id: 'active-2', title: 'Also Active', lifecycle_state: 'active' }), 'active-2'),
    ];
    // First page: 50 archived (newest). Second page: active rows then exhaust.
    resultQueue = [
      { data: archivedPage, error: null },
      { data: activePage, error: null },
    ];

    const out = await searchMealDocumentsForPerson(PERSON, { limit: 2 });

    expect(rangeCalls).toEqual([
      [0, 49],
      [50, 99],
    ]);
    expect(out.results).toHaveLength(2);
    expect(out.results.map((r) => r.id)).toEqual(['active-1', 'active-2']);
    expect(out.results.every((r) => r.archived !== true)).toBe(true);
  });
});

// ============================================================================
// query search
// ============================================================================

describe('searchMealDocumentsForPerson — query search', () => {
  it('matches title via ilike with escaped wildcards', async () => {
    resultQueue = [{ data: [row(doc())], error: null }];

    const out = await searchMealDocumentsForPerson(PERSON, { q: '50% off_meal' });

    expect(out.browse).toBe(false);
    expect(out.query).toBe('50% off_meal');
    expect(ilikeCalls).toEqual([['title', '%50\\% off\\_meal%']]);
    // Still ordered deterministically by updated_at desc.
    expect(orderCalls).toContainEqual(['updated_at', { ascending: false }]);
  });

  it('clamps an oversized limit', async () => {
    resultQueue = [{ data: [], error: null }];
    const out = await searchMealDocumentsForPerson(PERSON, { q: 'x', limit: 9999 });
    expect(out.limit).toBe(50);
    // Active path uses range pages; public outcome.limit remains clamped.
    expect(rangeCalls[0]).toEqual([0, 49]);
  });
});

// ============================================================================
// meals vs recipes filtering
// ============================================================================

describe('searchMealDocumentsForPerson — kind / mode filtering', () => {
  it('mode=meals filters kind=meal', async () => {
    resultQueue = [{ data: [row(doc())], error: null }];
    const out = await searchMealDocumentsForPerson(PERSON, { mode: 'meals' });
    expect(out.kind).toBe('meal');
    expect(eqCalls).toContainEqual(['kind', 'meal']);
  });

  it('mode=recipes filters kind=recipe', async () => {
    resultQueue = [{ data: [row(doc({ kind: 'recipe' }))], error: null }];
    const out = await searchMealDocumentsForPerson(PERSON, { mode: 'recipes' });
    expect(out.kind).toBe('recipe');
    expect(eqCalls).toContainEqual(['kind', 'recipe']);
  });

  it('mode=all applies no kind filter (both meals and recipes)', async () => {
    resultQueue = [{ data: [row(doc()), row(doc({ kind: 'recipe' }), 'row-2')], error: null }];
    const out = await searchMealDocumentsForPerson(PERSON, { mode: 'all' });
    expect(out.kind).toBeNull();
    expect(eqCalls.some(([c]) => c === 'kind')).toBe(false);
  });

  it('explicit kind overrides the mode-derived kind', async () => {
    resultQueue = [{ data: [row(doc({ kind: 'recipe' }))], error: null }];
    const out = await searchMealDocumentsForPerson(PERSON, { mode: 'meals', kind: 'recipe' });
    expect(out.kind).toBe('recipe');
    expect(eqCalls).toContainEqual(['kind', 'recipe']);
    expect(eqCalls).not.toContainEqual(['kind', 'meal']);
  });

  it('applies the review_state filter when provided', async () => {
    resultQueue = [{ data: [row(doc())], error: null }];
    await searchMealDocumentsForPerson(PERSON, { review_state: 'confirmed' });
    expect(eqCalls).toContainEqual(['review_state', 'confirmed']);
  });
});

// ============================================================================
// errors
// ============================================================================

describe('searchMealDocumentsForPerson — errors', () => {
  it('throws when the query errors', async () => {
    resultQueue = [{ data: null, error: { message: 'boom' } }];
    await expect(searchMealDocumentsForPerson(PERSON, {})).rejects.toThrow(/boom/);
  });
});
