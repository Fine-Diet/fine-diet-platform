import { readFileSync } from 'fs';
import { join } from 'path';
import {
  appendManualGroceryPriceObservation,
  appendSourcedGroceryPriceObservation,
  buildCandidateSnapshot,
  searchEventMatchesItemScope,
  upsertGroceryPriceCache,
} from '../groceryPriceStore';
import type { GroceryPriceProviderCandidate } from '../groceryPriceProviderTypes';
import { GroceryPriceManualReplaceRequiredError } from '../groceryPriceManualReplace';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';

const mockFrom = supabaseAdmin.from as jest.Mock;

const SCOPE = { planId: 'plan-1', dateStart: '2026-07-15', dateEnd: '2026-07-15' };

function mockObservationQuery(current: Record<string, unknown> | null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: current, error: null }),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: {
        id: 'obs-new',
        source: 'manual',
        match_key: 'food-1::cup',
        supersedes_observation_id: current?.id ?? null,
      },
      error: null,
    }),
  };
  mockFrom.mockImplementation((table: string) => {
    if (table === 'grocery_price_observations') return chain;
    throw new Error(`Unexpected table ${table}`);
  });
  return chain;
}

describe('groceryPriceStore hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not match scope when durable plan reference was cleared by plan deletion', () => {
    const event = {
      id: 'event-1',
      person_id: 'person-1',
      grocery_item_id: null,
      grocery_list_id: null,
      plan_id: null,
      date_range_start: '2026-07-15',
      date_range_end: '2026-07-15',
      match_key: 'food-1::cup',
      food_object_id: 'food-1',
      provider: 'serpapi',
      query: 'spinach',
      retailer: 'Whole Foods Market',
      postal_code: '94110',
      cache_key: 'cache-1',
      cache_hit: false,
      billed: true,
      result_count: 1,
      candidate_snapshot: null,
      created_at: new Date().toISOString(),
    };

    expect(searchEventMatchesItemScope(event, SCOPE, 'food-1::cup', 'item-new')).toBe(false);
  });

  it('matches search events by stable scope and match key even when item id is null', () => {
    const event = {
      id: 'event-1',
      person_id: 'person-1',
      grocery_item_id: null,
      grocery_list_id: null,
      plan_id: 'plan-1',
      date_range_start: '2026-07-15',
      date_range_end: '2026-07-15',
      match_key: 'food-1::cup',
      food_object_id: 'food-1',
      provider: 'serpapi',
      query: 'spinach',
      retailer: 'Whole Foods Market',
      postal_code: '94110',
      cache_key: 'cache-1',
      cache_hit: false,
      billed: true,
      result_count: 1,
      candidate_snapshot: null,
      created_at: new Date().toISOString(),
    };

    expect(searchEventMatchesItemScope(event, SCOPE, 'food-1::cup', 'item-new')).toBe(true);
  });

  it('appends manual observations instead of updating in place', async () => {
    const chain = mockObservationQuery({ id: 'obs-old', source: 'manual' });
    await appendManualGroceryPriceObservation({
      person_id: 'person-1',
      grocery_item_id: 'item-1',
      grocery_list_id: 'list-1',
      plan_id: 'plan-1',
      date_range_start: '2026-07-15',
      date_range_end: '2026-07-15',
      match_key: 'food-1::cup',
      food_object_id: 'food-1',
      retailer: null,
      postal_code: null,
      product_title: 'Spinach',
      brand_name: null,
      package_size: null,
      package_unit: null,
      unit_price: 4.5,
      currency: 'USD',
      package_count: 1,
      line_total: 4.5,
      product_url: null,
      image_url: null,
    });
    expect(chain.insert).toHaveBeenCalled();
  });

  it('blocks sourced confirmation when current manual observation exists without replace intent', async () => {
    mockObservationQuery({ id: 'obs-manual', source: 'manual' });
    await expect(
      appendSourcedGroceryPriceObservation({
        person_id: 'person-1',
        grocery_item_id: 'item-1',
        grocery_list_id: 'list-1',
        plan_id: 'plan-1',
        date_range_start: '2026-07-15',
        date_range_end: '2026-07-15',
        match_key: 'food-1::cup',
        food_object_id: 'food-1',
        retailer: 'Whole Foods Market',
        postal_code: '94110',
        product_title: 'Spinach',
        brand_name: 'Organic Girl',
        package_size: 5,
        package_unit: 'oz',
        unit_price: 3.99,
        currency: 'USD',
        package_count: 1,
        line_total: 3.99,
        product_url: null,
        image_url: null,
        provider_result_id: 'serpapi:0:spinach',
        search_event_id: 'event-1',
        match_confidence: 0.9,
      }),
    ).rejects.toMatchObject({ name: 'GroceryPriceManualReplaceRequiredError' });
  });

  it('appends sourced observation with supersedes link when replaceManual is explicit', async () => {
    const chain = mockObservationQuery({ id: 'obs-manual', source: 'manual' });
    await appendSourcedGroceryPriceObservation(
      {
        person_id: 'person-1',
        grocery_item_id: 'item-1',
        grocery_list_id: 'list-1',
        plan_id: 'plan-1',
        date_range_start: '2026-07-15',
        date_range_end: '2026-07-15',
        match_key: 'food-1::cup',
        food_object_id: 'food-1',
        retailer: 'Whole Foods Market',
        postal_code: '94110',
        product_title: 'Spinach',
        brand_name: 'Organic Girl',
        package_size: 5,
        package_unit: 'oz',
        unit_price: 3.99,
        currency: 'USD',
        package_count: 1,
        line_total: 3.99,
        product_url: null,
        image_url: null,
        provider_result_id: 'serpapi:0:spinach',
        search_event_id: 'event-1',
        match_confidence: 0.9,
      },
      { replaceManual: true },
    );
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        supersedes_observation_id: 'obs-manual',
        source: 'serpapi',
      }),
    );
  });

  it('stores same-product package variants as separate cache offers', async () => {
    const chain = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    mockFrom.mockReturnValue(chain);
    const offers = [
      {
        provider_result_id: 'almond-butter:16-oz',
        package_size: 16,
        package_unit: 'oz',
      },
      {
        provider_result_id: 'almond-butter:28-oz',
        package_size: 28,
        package_unit: 'oz',
      },
    ];

    await upsertGroceryPriceCache({
      cache_key: 'cache-variants',
      food_object_id: 'food-1',
      preferred_product: null,
      retailer: 'Whole Foods Market',
      postal_code: '94110',
      provider: 'serpapi',
      query_used: 'Whole Foods Almond Butter',
      offers: offers as never,
      retrieved_at: '2026-07-15T00:00:00.000Z',
      expires_at: '2026-07-16T00:00:00.000Z',
    });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        offers_json: offers,
      }),
    );
  });
});

describe('createGroceryPriceSearchTables.sql hardening', () => {
  it('uses SET NULL for ephemeral grocery references and denies client search-event writes', () => {
    const sql = readFileSync(
      join(process.cwd(), 'scripts/sql/createGroceryPriceSearchTables.sql'),
      'utf8',
    );
    expect(sql).toContain('grocery_item_id UUID REFERENCES public.grocery_items(id) ON DELETE SET NULL');
    expect(sql).toContain('grocery_list_id UUID REFERENCES public.generated_grocery_lists(id) ON DELETE SET NULL');
    expect(sql).toContain('No direct client access to grocery_price_search_events');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).not.toMatch(/CREATE POLICY "Users can insert own grocery_price_observations"/);
    expect(sql).toContain('No direct client mutation of grocery_price_observations');
    expect(sql).toContain('FOR INSERT WITH CHECK (false)');
    expect(sql).toContain('expires_at TIMESTAMPTZ NOT NULL');
    expect(sql).toContain('p_claim_ttl_seconds INTEGER DEFAULT 300');
    expect(sql).toContain("status = 'released'");
    expect(sql).toContain('expires_at <= now()');
    expect(sql).toContain('expires_at > now()');
    expect(sql).toMatch(
      /grocery_price_search_events[\s\S]*plan_id UUID REFERENCES public\.plans\(id\) ON DELETE SET NULL/,
    );
    expect(sql).toMatch(
      /grocery_price_observations[\s\S]*plan_id UUID REFERENCES public\.plans\(id\) ON DELETE SET NULL/,
    );
  });
});

describe('buildCandidateSnapshot', () => {
  it('persists parsed package_size and package_unit in search snapshots', () => {
    const candidate: GroceryPriceProviderCandidate = {
      provider: 'serpapi',
      provider_result_id: 'id-1',
      title: 'Organic Girl Baby Spinach 5 oz',
      retailer: 'Whole Foods Market',
      price: 3.99,
      currency: 'USD',
      package_text: '5 oz',
      package_size: 5,
      package_unit: 'oz',
      product_url: null,
      image_url: null,
      upc: null,
      is_local: false,
      retrieved_at: '2026-07-15T00:00:00.000Z',
      source_rank: 0,
      match_score: 0.9,
      match_reasons: [],
    };
    const snapshot = buildCandidateSnapshot([candidate]);
    const offers = snapshot.offers as Array<{ package_size: number | null; package_unit: string | null }>;
    expect(offers[0]?.package_size).toBe(5);
    expect(offers[0]?.package_unit).toBe('oz');
  });
});

describe('verifyGroceryPriceSearchTables.sql', () => {
  it('accepts pg_policies cmd ALL and documents Preview migration ledger entries', () => {
    const sql = readFileSync(
      join(process.cwd(), 'scripts/sql/verifyGroceryPriceSearchTables.sql'),
      'utf8',
    );
    expect(sql).toContain("pol.cmd IN ('*', 'ALL')");
    expect(sql).toContain('create_grocery_price_search_tables_repair');
    expect(sql).toContain('initial_truncated_apply');
    expect(sql).toContain('authoritative_schema_apply');
  });
});
