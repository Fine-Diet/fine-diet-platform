/**
 * Phase E — UI projection parity tests.
 *
 * Verifies that the two ways UI consumers can obtain a flat list of
 * results — directly from `response.results` (legacy flat array) vs
 * `flattenSections(response.sections)` (canonical helper) — yield
 * identical results.
 *
 * This is the property that makes the `Journal Log` (sections renderer)
 * and `AddItemsPanel` (flat renderer using flattenSections) guaranteed
 * to render the same top result for the same backend response.
 */

import {
  flattenSections,
  type FoodSearchResponse,
  type FoodSearchResult,
  type SearchResultSection,
  type SectionKey,
} from '../types';

function makeResult(id: string, source: 'curated' | 'off' = 'curated'): FoodSearchResult {
  return {
    food: {
      id,
      canonicalName: id,
      brandName: null,
      aliases: [],
      sourceType: 'common',
      sourceProvider: null,
      sourceId: null,
      sourceDataset: null,
      upc: null,
      servingSizeG: 100,
      servingUnit: 'g',
      servingDescription: null,
      householdServingText: null,
      measures: null,
      calories: 100,
      proteinG: 5,
      carbsG: 10,
      fatG: 2,
      fiberG: null,
      sugarG: null,
      sodiumMg: null,
      nutrientsExtended: {},
      nutrientProvenance: 'usda',
      nutrientConfidence: 'high',
      personId: null,
      isVerified: true,
      imageUrl: null,
      category: null,
      tags: [],
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    group: 'common',
    score: 100,
    isFavorite: false,
    logCount: 0,
    source,
  };
}

function makeSection(key: SectionKey, ids: string[]): SearchResultSection {
  const items = ids.map((id) => makeResult(id, key === 'off' ? 'off' : 'curated'));
  return {
    key,
    label: key,
    order: 1,
    topScore: 100,
    total: items.length,
    shown: items.length,
    hasMore: false,
    offset: 0,
    items,
  };
}

describe('Phase E projection parity', () => {
  it('flattenSections(sections) preserves section order (my_foods → common → branded → ...)', () => {
    const sections: SearchResultSection[] = [
      makeSection('my_foods', ['mf-1']),
      makeSection('common', ['c-1', 'c-2']),
      makeSection('branded', ['b-1']),
      makeSection('off', ['off-1']),
    ];

    const flat = flattenSections(sections);
    expect(flat.map((r) => r.food.id)).toEqual(['mf-1', 'c-1', 'c-2', 'b-1', 'off-1']);
  });

  it('flattenSections preserves the exact item references (no re-clone, no re-sort)', () => {
    const sec = makeSection('common', ['x-1', 'x-2']);
    const flat = flattenSections([sec]);
    expect(flat[0]).toBe(sec.items[0]);
    expect(flat[1]).toBe(sec.items[1]);
  });

  it('flattenSections returns identical items as response.results when both come from the same sections', () => {
    // Simulates the server contract: `response.results` is the flatten
    // of `response.sections` in section order. The Journal Log (sections
    // renderer) and AddItemsPanel (flattenSections renderer) must agree
    // on the top result and the full ordered list.
    const sections: SearchResultSection[] = [
      makeSection('my_foods', ['mf-1']),
      makeSection('common', ['c-1', 'c-2', 'c-3']),
      makeSection('branded', ['b-1', 'b-2']),
      makeSection('off', ['off-1']),
    ];
    const serverResults: FoodSearchResult[] = sections.flatMap((s) => s.items);

    const response: FoodSearchResponse = {
      results: serverResults,
      sections,
      totalReturned: serverResults.length,
      yourFoods: sections.find((s) => s.key === 'my_foods')?.items ?? [],
      branded: sections.find((s) => s.key === 'branded')?.items ?? [],
      common: sections.find((s) => s.key === 'common')?.items ?? [],
      totalCount: serverResults.length,
    };

    const flatFromHelper = flattenSections(response.sections);
    expect(flatFromHelper.map((r) => r.food.id)).toEqual(
      response.results.map((r) => r.food.id)
    );
    // Top result must match — this is the key invariant for AddItemsPanel
    // vs Journal Log parity.
    expect(flatFromHelper[0]).toBe(response.results[0]);
  });

  it('flattenSections of empty sections array returns []', () => {
    expect(flattenSections([])).toEqual([]);
  });

  it('flattenSections of all-empty sections returns []', () => {
    const sections: SearchResultSection[] = [
      makeSection('my_foods', []),
      makeSection('common', []),
    ];
    expect(flattenSections(sections)).toEqual([]);
  });
});
