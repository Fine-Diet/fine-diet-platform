import {
  groupGroceryAddSuggestions,
  parseGroceryAddIntent,
} from '../groceryListAddIntent';
import {
  isListPriceCompatibleWithActiveChoice,
  resolveActiveListPriceForItem,
} from '../groceryListPriceObservationDisplay';
import { LIST_PRICE_ADD_QA_CASES, isListPriceAddQaEnabled } from '../listPriceAddQaCases';
import type { FoodSearchResult } from '@/lib/food/types';
import type { GroceryItem, GroceryListPriceObservation, GroceryListPurchasingChoice } from '../types';

function item(overrides: Partial<GroceryItem> & Pick<GroceryItem, 'id' | 'name'>): GroceryItem {
  return {
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    quantity: 1,
    unit: 'cup',
    aisle_category: null,
    food_object_id: null,
    source_type: 'manual',
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

function obs(
  overrides: Partial<GroceryListPriceObservation> & Pick<GroceryListPriceObservation, 'id' | 'match_key'>,
): GroceryListPriceObservation {
  return {
    person_id: 'person-1',
    grocery_list_id: 'list-1',
    grocery_item_id: 'item-1',
    purchasing_choice_id: null,
    food_object_id: 'food-1',
    source: 'manual',
    retailer: null,
    postal_code: null,
    product_title: 'Chicken breast',
    brand_name: null,
    package_size: null,
    package_unit: null,
    unit_price: 5,
    currency: 'USD',
    package_count: 1,
    line_total: 5,
    product_url: null,
    image_url: null,
    provider_result_id: null,
    search_event_id: null,
    retrieved_at: '2026-07-30T00:00:00.000Z',
    match_confidence: null,
    user_confirmed: true,
    supersedes_observation_id: null,
    created_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('groceryListAddIntent', () => {
  it('parses leading quantity/unit without replacing the raw phrase', () => {
    const intent = parseGroceryAddIntent('2 cups chicken breast');
    expect(intent.raw_entry).toBe('2 cups chicken breast');
    expect(intent.quantity).toBe(2);
    expect(intent.unit).toMatch(/cup/i);
    expect(intent.name.toLowerCase()).toContain('chicken');
    expect(intent.parsed_from_phrase).toBe(true);
  });

  it('keeps unresolved free text when no qty/unit', () => {
    const intent = parseGroceryAddIntent('chiken brest');
    expect(intent.raw_entry).toBe('chiken brest');
    expect(intent.name).toBe('chiken brest');
  });

  it('groups ingredient vs product suggestions with Did you mean', () => {
    const results = [
      {
        food: {
          id: 'food-common',
          canonicalName: 'chicken breast',
          brandName: null,
          sourceType: 'common',
          upc: null,
        },
        source: 'catalog',
        source_label: 'Common',
      },
      {
        food: {
          id: 'food-brand',
          canonicalName: 'Chicken Breast',
          brandName: 'Perdue',
          sourceType: 'branded',
          upc: '123',
        },
        source: 'catalog',
        source_label: 'Branded',
      },
    ] as unknown as FoodSearchResult[];

    const grouped = groupGroceryAddSuggestions({
      intentName: 'chiken brest',
      results,
    });
    expect(grouped.ingredients[0]?.label).toMatch(/chicken breast/i);
    expect(grouped.ingredients[0]?.did_you_mean).toBe(true);
    expect(grouped.products[0]?.group).toBe('product');
  });
});

describe('groceryListPriceObservationDisplay', () => {
  it('marks incompatible match_key as stale', () => {
    const groceryItem = item({ id: 'item-1', name: 'chicken', food_object_id: 'food-old' });
    const choice = {
      id: 'choice-1',
      grocery_list_id: 'list-1',
      grocery_item_id: 'item-1',
      person_id: 'person-1',
      match_key: 'food-new::cup',
      status: 'list_owner_resolved',
      food_object_id: 'food-new',
      shopping_display_name: 'New product',
      purchase_quantity: null,
      purchase_unit: null,
      preferred_product: null,
      aisle_category: null,
      note: null,
      required_name_snapshot: 'chicken',
      required_unit_snapshot: 'cup',
      source_plan_id: null,
      source_date_range_start: null,
      source_date_range_end: null,
      applied_to_person_resolution_at: null,
      applied_to_plan_override_id: null,
      suggested_by_person_id: null,
      reviewed_at: null,
      review_note: null,
      created_at: '2026-07-30T00:00:00.000Z',
      updated_at: '2026-07-30T00:00:00.000Z',
    } as GroceryListPurchasingChoice;

    const oldQuote = obs({
      id: 'obs-old',
      match_key: 'food-old::cup',
      purchasing_choice_id: 'other-choice',
      food_object_id: 'food-old',
    });
    expect(
      isListPriceCompatibleWithActiveChoice({
        observation: oldQuote,
        item: groceryItem,
        choice,
      }),
    ).toBe(false);

    const resolved = resolveActiveListPriceForItem({
      item: groceryItem,
      choice,
      observationsForItem: [oldQuote],
    });
    expect(resolved.observation).toBeNull();
    expect(resolved.stale?.id).toBe('obs-old');
  });

  it('reuses quote when match_key matches active choice', () => {
    const groceryItem = item({ id: 'item-1', name: 'chicken', food_object_id: 'food-1' });
    const choice = {
      id: 'choice-1',
      match_key: 'food-1::cup',
      status: 'list_owner_resolved',
      food_object_id: 'food-1',
      purchase_unit: null,
    } as GroceryListPurchasingChoice;
    const quote = obs({
      id: 'obs-1',
      match_key: 'food-1::cup',
      purchasing_choice_id: 'choice-1',
      food_object_id: 'food-1',
    });
    const resolved = resolveActiveListPriceForItem({
      item: groceryItem,
      choice,
      observationsForItem: [quote],
    });
    expect(resolved.observation?.id).toBe('obs-1');
    expect(resolved.stale).toBeNull();
  });

  it('inherits blueberry-style list quote into Full Haul via soft choice alignment', () => {
    const groceryItem = item({
      id: 'e1bed4df-108e-4e7f-bef0-cb5d17e6e8ee',
      name: 'Blueberries',
      food_object_id: '634bcef8-1970-424b-ab00-a70bed9bf82c',
      unit: null,
      source_type: 'planned_meal',
      source_id: 'plan-a',
    });
    const choice = {
      id: 'b77de669-0f6c-48e6-b1bf-06a4bbf30b9e',
      match_key: 'cf4f71bc-ad5a-42af-ab44-afa4611a61a1::',
      status: 'list_owner_resolved',
      food_object_id: 'cf4f71bc-ad5a-42af-ab44-afa4611a61a1',
      purchase_unit: null,
    } as GroceryListPurchasingChoice;
    const quote = obs({
      id: '298dbd68-c729-4669-92b1-078fa52eb29c',
      grocery_item_id: groceryItem.id,
      match_key: 'cf4f71bc-ad5a-42af-ab44-afa4611a61a1::',
      purchasing_choice_id: choice.id,
      food_object_id: 'cf4f71bc-ad5a-42af-ab44-afa4611a61a1',
      unit_price: 10,
      line_total: 10,
    });
    const resolved = resolveActiveListPriceForItem({
      item: groceryItem,
      choice,
      observationsForItem: [quote],
    });
    expect(resolved.observation?.line_total).toBe(10);

    const { computeFullHaulEstimate } = require('../fullHaulEstimate');
    const { listPriceToHaulObservation } = require('../groceryListPriceObservationDisplay');
    const estimate = computeFullHaulEstimate({
      groceryListId: 'list-1',
      items: [groceryItem],
      observationsByItemId: new Map([
        [groceryItem.id, listPriceToHaulObservation(resolved.observation!)],
      ]),
      listPlanId: null,
    });
    expect(estimate.estimated_merchandise_subtotal).toBe(10);
    expect(estimate.priced_item_count).toBe(1);
  });

  it('prefers explicit active quote over newer compatible quote', () => {
    const groceryItem = item({ id: 'item-1', name: 'oats', food_object_id: 'food-1' });
    const choice = {
      id: 'choice-1',
      match_key: 'food-1::cup',
      status: 'list_owner_resolved',
      food_object_id: 'food-1',
      purchase_unit: null,
    } as GroceryListPurchasingChoice;
    const older = obs({
      id: 'obs-old',
      match_key: 'food-1::cup',
      purchasing_choice_id: 'choice-1',
      food_object_id: 'food-1',
      retailer: 'Kroger',
      line_total: 4,
      created_at: '2026-07-29T00:00:00.000Z',
    });
    const newer = obs({
      id: 'obs-new',
      match_key: 'food-1::cup',
      purchasing_choice_id: 'choice-1',
      food_object_id: 'food-1',
      retailer: 'Whole Foods',
      line_total: 9,
      created_at: '2026-07-30T00:00:00.000Z',
    });
    const resolved = resolveActiveListPriceForItem({
      item: groceryItem,
      choice,
      observationsForItem: [newer, older],
      activeObservationId: 'obs-old',
    });
    expect(resolved.observation?.id).toBe('obs-old');
    expect(resolved.observation?.line_total).toBe(4);
  });

  it('labels mixed retailers from active quotes', () => {
    const { summarizeActiveRetailers } = require('../groceryListPriceObservationDisplay');
    const summary = summarizeActiveRetailers([
      { retailer: 'Whole Foods' },
      { retailer: 'Kroger' },
    ]);
    expect(summary.mixed).toBe(true);
    expect(summary.summary).toBe('Mixed retailers');
  });
});

describe('typo hints', () => {
  it('suggests breast for brest without replacing raw entry', () => {
    const { suggestGroceryAddCorrection } = require('../groceryListAddTypoHints');
    const { parseGroceryAddIntent } = require('../groceryListAddIntent');
    expect(suggestGroceryAddCorrection('brest')).toBe('breast');
    const intent = parseGroceryAddIntent('chiken brest');
    expect(intent.raw_entry).toBe('chiken brest');
    expect(intent.correction_hint).toMatch(/chicken breast/i);
  });
});

describe('grocery list sort', () => {
  it('defaults newest first within active status group', () => {
    const { sortGroceryListItems } = require('../groceryListSort');
    const a = item({
      id: 'a',
      name: 'Zucchini',
      status: 'pending',
      created_at: '2026-07-30T10:00:00.000Z',
    });
    const b = item({
      id: 'b',
      name: 'Apples',
      status: 'pending',
      created_at: '2026-07-30T12:00:00.000Z',
    });
    const bought = item({
      id: 'c',
      name: 'AAA',
      status: 'bought',
      created_at: '2026-07-30T13:00:00.000Z',
    });
    const sorted = sortGroceryListItems({ items: [a, bought, b], mode: 'newest' });
    expect(sorted.map((row: GroceryItem) => row.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('listPriceAddQaCases', () => {
  it('exposes required founder QA case ids', () => {
    expect(LIST_PRICE_ADD_QA_CASES.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        'quote-pool-multi-retailer',
        'select-active-quote',
        'mixed-retailers-label',
        'typo-brest',
      ]),
    );
  });

  it('blocks QA fixture in production', () => {
    const prev = process.env.NODE_ENV;
    // @ts-expect-error test override
    process.env.NODE_ENV = 'production';
    expect(isListPriceAddQaEnabled('cases')).toBe(false);
    // @ts-expect-error test override
    process.env.NODE_ENV = prev;
  });
});
