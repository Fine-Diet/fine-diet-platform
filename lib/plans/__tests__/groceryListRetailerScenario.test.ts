import {
  buildRetailerScenarioPreview,
  listRetailersFromQuotePools,
  pickBestQuoteForRetailer,
  scenarioMatchedObservationsByItemId,
} from '../groceryListRetailerScenario';
import {
  LIST_RETAILER_SCENARIO_QA_CASES,
  isListRetailerScenarioQaEnabled,
} from '../listPriceAddQaCases';
import type { GroceryItem, GroceryListPriceObservation } from '../types';

function item(overrides: Partial<GroceryItem> & Pick<GroceryItem, 'id' | 'name'>): GroceryItem {
  return {
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    quantity: 1,
    unit: 'each',
    aisle_category: null,
    food_object_id: 'food-1',
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
  overrides: Partial<GroceryListPriceObservation> &
    Pick<GroceryListPriceObservation, 'id' | 'match_key' | 'retailer'>,
): GroceryListPriceObservation {
  return {
    person_id: 'person-1',
    grocery_list_id: 'list-1',
    grocery_item_id: 'item-1',
    purchasing_choice_id: null,
    food_object_id: 'food-1',
    source: 'manual',
    postal_code: '10001',
    product_title: 'Blueberries',
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
    retrieved_at: '2026-07-30T12:00:00.000Z',
    match_confidence: null,
    user_confirmed: true,
    supersedes_observation_id: null,
    created_at: '2026-07-30T12:00:00.000Z',
    ...overrides,
  };
}

const now = new Date('2026-07-30T18:00:00.000Z');

describe('groceryListRetailerScenario', () => {
  it('lists distinct retailers from compatible quote pools', () => {
    const a = item({ id: 'a', name: 'Blueberries' });
    const b = item({ id: 'b', name: 'Milk' });
    const options = listRetailersFromQuotePools({
      items: [a, b],
      poolByItemId: {
        a: [
          obs({ id: 'q1', match_key: 'food:food-1', retailer: 'Whole Foods', grocery_item_id: 'a' }),
          obs({ id: 'q2', match_key: 'food:food-1', retailer: 'Trader Joe\'s', grocery_item_id: 'a' }),
        ],
        b: [
          obs({
            id: 'q3',
            match_key: 'food:food-1',
            retailer: 'Whole Foods',
            grocery_item_id: 'b',
            food_object_id: 'food-1',
          }),
        ],
      },
    });
    expect(options.map((row) => row.key)).toEqual(['trader joe\'s', 'whole foods']);
    expect(options.find((row) => row.key === 'whole foods')?.quote_count).toBe(2);
  });

  it('never matches a quote from another retailer', () => {
    const groceryItem = item({ id: 'item-1', name: 'Blueberries' });
    const row = pickBestQuoteForRetailer({
      item: groceryItem,
      observationsForItem: [
        obs({ id: 'tj', match_key: 'food:food-1', retailer: 'Trader Joe\'s', line_total: 3 }),
        obs({ id: 'wf', match_key: 'food:food-1', retailer: 'Whole Foods', line_total: 9 }),
      ],
      retailerKey: 'whole foods',
      now,
    });
    expect(row.state).toBe('matched');
    expect(row.quote?.id).toBe('wf');
  });

  it('marks missing when no quote exists for the retailer', () => {
    const groceryItem = item({ id: 'item-1', name: 'Blueberries' });
    const row = pickBestQuoteForRetailer({
      item: groceryItem,
      observationsForItem: [
        obs({ id: 'tj', match_key: 'food:food-1', retailer: 'Trader Joe\'s' }),
      ],
      retailerKey: 'whole foods',
      now,
    });
    expect(row.state).toBe('missing');
    expect(row.quote).toBeNull();
  });

  it('marks stale when compatible quote is past TTL', () => {
    const groceryItem = item({ id: 'item-1', name: 'Blueberries' });
    const row = pickBestQuoteForRetailer({
      item: groceryItem,
      observationsForItem: [
        obs({
          id: 'old',
          match_key: 'food:food-1',
          retailer: 'Whole Foods',
          retrieved_at: '2020-01-01T00:00:00.000Z',
          created_at: '2020-01-01T00:00:00.000Z',
        }),
      ],
      retailerKey: 'whole foods',
      now,
    });
    expect(row.state).toBe('stale');
    expect(row.quote?.id).toBe('old');
  });

  it('builds preview selections for matched only', () => {
    const matched = item({ id: 'matched', name: 'Blueberries' });
    const missing = item({ id: 'missing', name: 'Kale' });
    const stale = item({ id: 'stale', name: 'Milk' });
    const preview = buildRetailerScenarioPreview({
      items: [matched, missing, stale],
      poolByItemId: {
        matched: [
          obs({
            id: 'q-match',
            match_key: 'food:food-1',
            retailer: 'Whole Foods',
            grocery_item_id: 'matched',
          }),
        ],
        missing: [],
        stale: [
          obs({
            id: 'q-stale',
            match_key: 'food:food-1',
            retailer: 'Whole Foods',
            grocery_item_id: 'stale',
            retrieved_at: '2020-01-01T00:00:00.000Z',
            created_at: '2020-01-01T00:00:00.000Z',
          }),
        ],
      },
      retailerKey: 'Whole Foods',
      now,
    });

    expect(preview.matched_count).toBe(1);
    expect(preview.missing_count).toBe(1);
    expect(preview.stale_count).toBe(1);
    expect(preview.matched_observation_ids_by_item_id).toEqual({ matched: 'q-match' });
    expect(scenarioMatchedObservationsByItemId(preview).has('matched')).toBe(true);
    expect(scenarioMatchedObservationsByItemId(preview).has('stale')).toBe(false);
  });
});

describe('listRetailerScenarioQaCases', () => {
  it('exposes required founder QA case ids', () => {
    expect(LIST_RETAILER_SCENARIO_QA_CASES.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        'scenario-matched',
        'scenario-missing',
        'scenario-stale',
        'scenario-preview-only',
        'scenario-apply',
      ]),
    );
  });

  it('enables scenario QA only for scenario flag', () => {
    expect(isListRetailerScenarioQaEnabled('scenario')).toBe(true);
    expect(isListRetailerScenarioQaEnabled('quotes')).toBe(false);
  });
});
