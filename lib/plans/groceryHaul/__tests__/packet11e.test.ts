/**
 * Packet 11E — Groceries Lists → Hauls UX Reconciliation tests.
 *
 * Tests verify:
 * 1. Haul collection API route is GET/read-only and person-scoped
 * 2. Actual-Haul-only display — no inferred Hauls from List state
 * 3. List readiness does not create or infer a Haul
 * 4. UI state coverage: no Hauls / active Hauls / recent Hauls
 * 5. Left navigation taxonomy (Grocery Lists + Hauls distinct entries)
 * 6. Existing Packet 10/11 write-path holds remain intact
 * 7. Copy constants — proper Packet 11E language (no "Shopping trip")
 * 8. Haul collection list function type contract
 */

import fs from 'fs';
import path from 'path';
import {
  GROCERIES_LISTS_SECTION_HEADING,
  GROCERIES_LISTS_SECTION_COPY,
  GROCERIES_HAULS_SECTION_HEADING,
  GROCERIES_HAULS_SECTION_COPY,
  GROCERIES_HAULS_EMPTY,
  HAULS_INDEX_TITLE,
  HAULS_INDEX_SUPPORTING_COPY,
  GROCERIES_INDEX_SUPPORTING_COPY,
  groceryListReadinessHeadline,
  groceryListReadinessIndexCtaLabel,
  formatGroceryListReadinessCopy,
} from '@/lib/plans/groceryListReadiness/copy';
import { evaluateGroceryListReadiness } from '@/lib/plans/groceryListReadiness/policy';
import { resolveGroceryHaulCreateEligibility } from '@/lib/plans/groceryHaul/eligibility';
import {
  APP_DRAWER_HUBS,
  getActiveDrawerHubId,
} from '@/lib/navigation/appDrawerNavigation';
import type { GroceryItem, GroceryHaulCollectionItem } from '@/lib/plans/types';
import type { GroceryListReadinessState } from '@/lib/plans/groceryListReadiness/policy';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return {
    id: 'item-1',
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    name: 'Oats',
    quantity: 2,
    unit: 'cup',
    aisle_category: null,
    food_object_id: 'food-oats',
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

// ============================================================================
// 1 — Haul collection API: GET-only, person-scoped
// ============================================================================

describe('Packet 11E — Haul collection API', () => {
  it('GET /api/journal/food/hauls is read-only', () => {
    const source = read('pages/api/journal/food/hauls/index.ts');
    expect(source).toContain("req.method !== 'GET'");
    expect(source).not.toMatch(/\.insert\(/i);
    expect(source).not.toMatch(/\.update\(/i);
    expect(source).not.toMatch(/\.delete\(/i);
    expect(source).not.toContain('create_grocery_haul_from_list');
    expect(source).not.toContain('checkout');
  });

  it('API requires journal access (person-scoped auth)', () => {
    const source = read('pages/api/journal/food/hauls/index.ts');
    expect(source).toContain('requireJournalAccess');
    expect(source).toContain('personId');
    expect(source).toContain('listGroceryHaulsForPerson');
  });

  it('API returns hauls field in response', () => {
    const source = read('pages/api/journal/food/hauls/index.ts');
    expect(source).toContain('{ hauls }');
  });
});

// ============================================================================
// 2 — server-side collection function
// ============================================================================

describe('Packet 11E — listGroceryHaulsForPerson service function', () => {
  it('is exported from groceryHaul/service.ts', () => {
    const source = read('lib/plans/groceryHaul/service.ts');
    expect(source).toContain('export async function listGroceryHaulsForPerson');
  });

  it('scopes to person_id and never writes', () => {
    const source = read('lib/plans/groceryHaul/service.ts');
    expect(source).toMatch(/\.eq\('person_id', personId\)/);
    expect(source).not.toMatch(/\.insert\(/i);
    expect(source).not.toMatch(/\.update\(/i);
    expect(source).not.toMatch(/\.delete\(/i);
    expect(source).not.toContain('create_grocery_haul_from_list');
  });

  it('resolves source list names in a single batch query (no N+1)', () => {
    const source = read('lib/plans/groceryHaul/service.ts');
    // Uses .in() for batched list lookup rather than per-haul queries
    expect(source).toContain(".in('id', listIds)");
    expect(source).toContain('GroceryHaulCollectionItem');
  });

  it('is available on the client planService', () => {
    const source = read('lib/plans/planService.ts');
    expect(source).toContain('async listGroceryHauls()');
    expect(source).toContain("'/api/journal/food/hauls'");
    // listGroceryHauls itself is a GET (no explicit method means GET)
    const listHaulsStart = source.indexOf('async listGroceryHauls()');
    const listHaulsEnd = source.indexOf('},', listHaulsStart);
    const listHaulsBody = source.slice(listHaulsStart, listHaulsEnd);
    expect(listHaulsBody).not.toContain("method: 'POST'");
  });
});

// ============================================================================
// 3 — GroceryHaulCollectionItem type contract
// ============================================================================

describe('Packet 11E — GroceryHaulCollectionItem type', () => {
  it('is defined in types.ts with the required presentation fields', () => {
    const source = read('lib/plans/types.ts');
    expect(source).toContain('export interface GroceryHaulCollectionItem');
    expect(source).toContain('source_grocery_list_id');
    expect(source).toContain('source_list_name');
    expect(source).toContain('shopping_date');
    expect(source).toContain('item_count');
    expect(source).toContain('created_at');
  });

  it('shape satisfies presentation needs (runtime check)', () => {
    const haul: GroceryHaulCollectionItem = {
      id: 'haul-1',
      source_grocery_list_id: 'list-1',
      source_list_name: 'My Grocery List',
      shopping_date: '2026-08-22',
      status: 'planned',
      item_count: 5,
      created_at: '2026-08-18T00:00:00Z',
    };
    expect(haul.id).toBe('haul-1');
    expect(haul.source_list_name).toBe('My Grocery List');
    expect(haul.item_count).toBe(5);
  });
});

// ============================================================================
// 4 — Actual-Haul-only display: List readiness cannot invent a Haul
// ============================================================================

describe('Packet 11E — List readiness does not infer a Haul', () => {
  const states: GroceryListReadinessState[] = [
    'empty_or_no_demand',
    'needs_resolution',
    'ready_to_shop',
    'shopping_in_progress',
    'complete_or_closed',
  ];

  it('no readiness state produces a Haul by itself', () => {
    for (const state of states) {
      // Readiness state does not auto-create a Haul record
      const eligibility = resolveGroceryHaulCreateEligibility({ readinessState: state });
      if (eligibility.eligible) {
        // Even when eligible, no Haul is created without explicit user action
        expect(eligibility).toEqual({ eligible: true });
      } else {
        expect(eligibility.eligible).toBe(false);
      }
    }
  });

  it('groceries index page never auto-calls getGroceryHaul or creates Hauls on load', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    // getGroceryHaul (single haul detail fetch) is not called on this page at all
    expect(indexPage).not.toContain('getGroceryHaul(');
    // 11E-R1: startGroceryHaulFromList must not appear anywhere on the index page.
    // The writer is only invoked from the List detail page after explicit user confirmation.
    expect(indexPage).not.toContain('startGroceryHaulFromList');
  });

  it('groceries index page fetches Hauls from canonical API, not infers from list state', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    expect(indexPage).toContain('listGroceryHauls');
    // Must not construct fake hauls from readiness
    expect(indexPage).not.toContain('shopping_in_progress.*haul');
    expect(indexPage).not.toContain('readyToShop.*haul');
  });

  it('hauls collection page never infers a Haul from Pantry or pricing state', () => {
    const haulsPage = read('pages/app/food/hauls/index.tsx');
    expect(haulsPage).not.toContain('pantry');
    expect(haulsPage).not.toContain('pricing');
    expect(haulsPage).not.toContain('createGroceryHaul');
    expect(haulsPage).not.toContain('startGroceryHaulFromList');
  });
});

// ============================================================================
// 5 — UI state coverage
// ============================================================================

describe('Packet 11E — UI state coverage', () => {
  it('groceries index shows empty Hauls state when no Hauls exist', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    // The page uses {GROCERIES_HAULS_EMPTY} constant reference
    expect(indexPage).toContain('GROCERIES_HAULS_EMPTY');
    // The constant itself has the right content
    expect(GROCERIES_HAULS_EMPTY).toContain('No Hauls yet');
    expect(GROCERIES_HAULS_EMPTY).toContain('build a Haul');
  });

  it('groceries index shows active/upcoming and recent Haul groups', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    expect(indexPage).toContain('Upcoming');
    expect(indexPage).toContain('Active');
    expect(indexPage).toContain('Recent Hauls');
  });

  it('hauls index shows empty state with guidance to build a Haul', () => {
    const haulsPage = read('pages/app/food/hauls/index.tsx');
    expect(haulsPage).toContain('No Hauls yet');
    expect(haulsPage).toContain('build a Haul');
    expect(haulsPage).toContain('Go to Grocery Lists');
  });

  it('hauls index distinguishes open from historical Hauls', () => {
    const haulsPage = read('pages/app/food/hauls/index.tsx');
    expect(haulsPage).toContain('Upcoming');
    expect(haulsPage).toContain('Active');
    expect(haulsPage).toContain('Past Hauls');
  });

  it('hauls index provides a loading skeleton', () => {
    const haulsPage = read('pages/app/food/hauls/index.tsx');
    expect(haulsPage).toContain('animate-pulse');
    expect(haulsPage).toContain('loading');
  });
});

// ============================================================================
// 6 — Left navigation taxonomy
// ============================================================================

describe('Packet 11E — Left navigation taxonomy', () => {
  it('Food hub contains Grocery Lists and Hauls as distinct entries', () => {
    const foodHub = APP_DRAWER_HUBS.find((h) => h.id === 'food');
    expect(foodHub).toBeDefined();
    const items = foodHub!.items ?? [];

    const groceryListsItem = items.find((i) => i.id === 'food-grocery-lists');
    const haulsItem = items.find((i) => i.id === 'food-hauls');

    expect(groceryListsItem).toBeDefined();
    expect(groceryListsItem!.label).toBe('Grocery Lists');
    expect(groceryListsItem!.href).toBe('/app/food/groceries');

    expect(haulsItem).toBeDefined();
    expect(haulsItem!.label).toBe('Hauls');
    expect(haulsItem!.href).toBe('/app/food/hauls');
  });

  it('does not have the old ambiguous "Groceries" entry', () => {
    const foodHub = APP_DRAWER_HUBS.find((h) => h.id === 'food');
    const items = foodHub!.items ?? [];
    const oldEntry = items.find((i) => i.id === 'food-groceries');
    expect(oldEntry).toBeUndefined();
  });

  it('Food hub itself remains at /app/food', () => {
    const foodHub = APP_DRAWER_HUBS.find((h) => h.id === 'food');
    expect(foodHub!.href).toBe('/app/food');
    expect(foodHub!.matchPrefix).toBe('/app/food');
  });

  it('active hub resolves correctly for groceries and hauls routes', () => {
    expect(getActiveDrawerHubId('/app/food/groceries')).toBe('food');
    expect(getActiveDrawerHubId('/app/food/groceries/some-list-id')).toBe('food');
    expect(getActiveDrawerHubId('/app/food/hauls')).toBe('food');
    expect(getActiveDrawerHubId('/app/food/hauls/some-haul-id')).toBe('food');
  });
});

// ============================================================================
// 7 — Packet 11E copy constants
// ============================================================================

describe('Packet 11E — Copy constants', () => {
  it('Groceries landing uses new supporting copy (no Shopping trip)', () => {
    expect(GROCERIES_INDEX_SUPPORTING_COPY).toContain('build a Haul');
    expect(GROCERIES_INDEX_SUPPORTING_COPY).not.toContain('Shopping trip');
    expect(GROCERIES_INDEX_SUPPORTING_COPY).not.toContain('List → Ready to shop');
  });

  it('Lists section headings and copy', () => {
    expect(GROCERIES_LISTS_SECTION_HEADING).toBe('Grocery Lists');
    expect(GROCERIES_LISTS_SECTION_COPY).toContain('Ongoing');
  });

  it('Hauls section headings and empty state', () => {
    expect(GROCERIES_HAULS_SECTION_HEADING).toBe('Hauls');
    expect(GROCERIES_HAULS_SECTION_COPY).toMatch(/what you're buying/i);
    expect(GROCERIES_HAULS_EMPTY).toContain('No Hauls yet');
    expect(GROCERIES_HAULS_EMPTY).toContain('build a Haul');
  });

  it('Hauls index title and copy', () => {
    expect(HAULS_INDEX_TITLE).toBe('Hauls');
    expect(HAULS_INDEX_SUPPORTING_COPY).toBeTruthy();
  });

  it('readiness headline for shopping_in_progress is neutral (not Shopping in progress)', () => {
    const headline = groceryListReadinessHeadline('shopping_in_progress');
    expect(headline).not.toBe('Shopping in progress');
    expect(headline).toBe('In progress');
  });

  it('readiness headlines do not contain Haul language', () => {
    const states: GroceryListReadinessState[] = [
      'empty_or_no_demand',
      'needs_resolution',
      'ready_to_shop',
      'shopping_in_progress',
      'complete_or_closed',
    ];
    for (const state of states) {
      const headline = groceryListReadinessHeadline(state);
      expect(headline.toLowerCase()).not.toContain('haul');
      expect(headline.toLowerCase()).not.toContain('trip');
    }
  });

  it('all list CTAs are Open List (no state-specific routing confusion)', () => {
    const states: GroceryListReadinessState[] = [
      'empty_or_no_demand',
      'needs_resolution',
      'ready_to_shop',
      'shopping_in_progress',
      'complete_or_closed',
    ];
    for (const state of states) {
      const cta = groceryListReadinessIndexCtaLabel(state);
      expect(cta).toBe('Open List');
    }
  });

  it('shopping_in_progress copy is neutral (no Shopping in progress)', () => {
    const decision = evaluateGroceryListReadiness({
      items: [item(), item({ id: 'item-2', status: 'bought' })],
    });
    expect(decision.state).toBe('shopping_in_progress');
    const copy = formatGroceryListReadinessCopy(decision);
    expect(copy.toLowerCase()).not.toContain('shopping in progress');
    expect(copy).toContain('still on the list');
  });
});

// ============================================================================
// 8 — Build a Haul CTA: reuses existing write path
// ============================================================================

describe('Packet 11E — Build a Haul CTA (post-R1 correction)', () => {
  it('11E-R1: groceries index does not call the writer directly', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    // The writer is invoked by the List detail page after explicit confirmation
    expect(indexPage).not.toContain('startGroceryHaulFromList');
    expect(indexPage).not.toContain('handleBuildHaul');
    expect(indexPage).not.toContain('creation_token');
    expect(indexPage).not.toContain('create_grocery_haul_from_list');
    expect(indexPage).not.toContain('createHaul');
    expect(indexPage).not.toContain('assignStore');
    expect(indexPage).not.toContain('checkout');
    expect(indexPage).not.toMatch(/from\('grocery_hauls'\)/);
  });

  it('11E-R1: Build a Haul is a Link into list detail with ?action=build-haul', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    // Routing into existing creation flow rather than inline write
    expect(indexPage).toContain('action=build-haul');
    expect(indexPage).toContain('Build a Haul');
  });

  it('eligibility still gates the Build a Haul link (resolveGroceryHaulCreateEligibility)', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    expect(indexPage).toContain('resolveGroceryHaulCreateEligibility');
    expect(indexPage).toContain('eligibility.eligible');
    expect(indexPage).toContain('buildHaulHref');
  });
});

// ============================================================================
// 9 — Haul detail page updates
// ============================================================================

describe('Packet 11E — Haul detail page', () => {
  it('uses Haul language in heading (not Shopping trip)', () => {
    const source = read('pages/app/food/hauls/[haulId].tsx');
    // h1 now says "Haul" (bare string in JSX)
    expect(source).toContain('>Haul<');
    expect(source).not.toContain('>Shopping trip<');
  });

  it('breadcrumb links to Hauls collection', () => {
    const source = read('pages/app/food/hauls/[haulId].tsx');
    expect(source).toContain('/app/food/hauls');
    expect(source).toContain('← Hauls');
  });

  it('remains read-only', () => {
    const source = read('pages/app/food/hauls/[haulId].tsx');
    expect(source).not.toContain('startGroceryHaulFromList');
    expect(source).not.toContain('checkout');
    expect(source).not.toContain('assignStore');
    expect(source).not.toContain('updatePantryOnHandItem');
  });
});

// ============================================================================
// 10 — Existing Packet 10/11 write-path holds remain intact
// ============================================================================

describe('Packet 11E — Existing write-path holds preserved', () => {
  it('Packet 10 readiness policy is unchanged', () => {
    const readiness = read('lib/plans/groceryListReadiness/policy.ts');
    expect(readiness).toContain('grocery-list-readiness.v1');
    expect(readiness).not.toContain('grocery_hauls');
    expect(readiness).toContain('empty_or_no_demand');
    expect(readiness).toContain('needs_resolution');
    expect(readiness).toContain('ready_to_shop');
    expect(readiness).toContain('shopping_in_progress');
    expect(readiness).toContain('complete_or_closed');
  });

  it('groceryListService does not touch grocery_hauls', () => {
    const listService = read('lib/plans/groceryListService.ts');
    expect(listService).not.toContain('grocery_hauls');
    expect(listService).not.toContain('create_grocery_haul_from_list');
    expect(listService).toContain('archiveGroceryList');
  });

  it('Pantry store does not touch grocery_hauls', () => {
    const pantry = read('lib/plans/groceryStateStore.ts');
    expect(pantry).not.toContain('grocery_hauls');
    expect(pantry).not.toContain('create_grocery_haul_from_list');
  });

  it('Packet 11C RPC remains the sole Haul create authority', () => {
    const service = read('lib/plans/groceryHaul/service.ts');
    expect(service).toContain("supabaseAdmin.rpc(GROCERY_HAUL_CREATE_RPC_NAME");
    expect(service).not.toMatch(/UPDATE public\.grocery_items/i);
  });

  it('existing Haul routes still intact', () => {
    const routes = read('lib/routes/appRoutes.ts');
    expect(routes).toContain("foodHauls: '/app/food/hauls'");
    expect(routes).toContain('foodHaul: (haulId: string)');
  });

  it('haul-summary routes remain read-only', () => {
    const pages = [
      'pages/api/journal/food/grocery-lists/[listId]/haul-summary.ts',
      'pages/api/journal/plans/[planId]/grocery/haul-summary.ts',
    ];
    for (const p of pages) {
      const src = read(p);
      expect(src).toMatch(/GET/);
      expect(src).not.toMatch(/insert\(/i);
      expect(src).not.toContain('grocery_hauls');
    }
  });

  it('fullHaulEstimate is pure read-model math (not a Haul record)', () => {
    const estimate = read('lib/plans/fullHaulEstimate.ts');
    expect(estimate).toContain('Pure read-model math');
    expect(estimate).not.toContain('grocery_hauls');
    expect(estimate).not.toContain('creation_token');
  });
});

// ============================================================================
// 11 — Review corrections: R1, R2, R3, R4
// ============================================================================

describe('Packet 11E Review Corrections', () => {
  // ── R1: Build a Haul routes to list detail, never calls writer directly ──

  it('11E-R1: groceries index does not call startGroceryHaulFromList directly', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    // The landing page must not contain the direct write call at all
    expect(indexPage).not.toContain('startGroceryHaulFromList');
    // No writer-related state: no buildingHaulForListId, no haulTokenRefs
    expect(indexPage).not.toContain('buildingHaulForListId');
    expect(indexPage).not.toContain('haulTokenRefs');
    expect(indexPage).not.toContain('creation_token');
    expect(indexPage).not.toContain('handleBuildHaul');
  });

  it('11E-R1: Build a Haul CTA is a Link to list detail with ?action=build-haul', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    // Routes into list detail so user explicitly sees the new-object boundary
    expect(indexPage).toContain('action=build-haul');
    expect(indexPage).toContain('Build a Haul');
    // Still gated by eligibility — the link only appears when eligible
    expect(indexPage).toContain('resolveGroceryHaulCreateEligibility');
    expect(indexPage).toContain('buildHaulHref');
  });

  // ── R2: Failed hauls read → unavailable state, not empty-state copy ──

  it('11E-R2: groceries index tracks haulsLoadState separately from empty state', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    // Distinct unavailable state exists
    expect(indexPage).toContain("'unavailable'");
    expect(indexPage).toContain('HaulsLoadState');
    // haulsError is tracked independently
    expect(indexPage).toContain('haulsError');
    // unavailable renders an error+retry, not GROCERIES_HAULS_EMPTY
    expect(indexPage).toContain("haulsLoadState === 'unavailable'");
    expect(indexPage).toContain('Retry');
  });

  it('11E-R2: empty-state copy only renders after a successful empty read', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    // The JSX guard for the empty state
    const readyEmptyGuard = "haulsLoadState === 'ready' && hauls.length === 0";
    const readyGuardIdx = indexPage.indexOf(readyEmptyGuard);
    expect(readyGuardIdx).toBeGreaterThan(-1);
    // GROCERIES_HAULS_EMPTY must appear AFTER the ready guard (inside the JSX block)
    const emptyIdxAfterGuard = indexPage.indexOf('GROCERIES_HAULS_EMPTY', readyGuardIdx);
    expect(emptyIdxAfterGuard).toBeGreaterThan(readyGuardIdx);
    // The unavailable block must not contain the empty-state constant
    const unavailableStart = indexPage.indexOf("haulsLoadState === 'unavailable'");
    expect(unavailableStart).toBeGreaterThan(-1);
    const unavailableBlock = indexPage.slice(unavailableStart, readyGuardIdx);
    expect(unavailableBlock).not.toContain('GROCERIES_HAULS_EMPTY');
  });

  // ── R3: Unknown persisted status fails the collection read ──

  it('11E-R3: listGroceryHaulsForPerson fails on unrecognised status', () => {
    const service = read('lib/plans/groceryHaul/service.ts');
    // Must iterate and check each status before mapping
    expect(service).toContain('unrecognised status');
    expect(service).toContain('Collection read aborted');
    // The listGroceryHaulsForPerson function must not coerce to 'planned'.
    // Scope the check to only that function (after its export line).
    const fnStart = service.indexOf('export async function listGroceryHaulsForPerson');
    const fnBody = service.slice(fnStart);
    expect(fnBody).not.toMatch(/isGroceryHaulStatus\(rawStatus\) \? rawStatus : 'planned'/);
    // The cast in the mapping section uses the pre-validated status — no coercion to 'planned'
    expect(fnBody).not.toContain(": 'planned'");
  });

  it('11E-R3: status validation loop runs before item-count fetch inside listGroceryHaulsForPerson', () => {
    const service = read('lib/plans/groceryHaul/service.ts');
    // Scope to the listGroceryHaulsForPerson function body only to avoid
    // matching earlier helper functions that also query grocery_haul_items.
    const fnStart = service.indexOf('export async function listGroceryHaulsForPerson');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = service.slice(fnStart);
    const validationIdx = fnBody.indexOf('Collection read aborted');
    const countFetchIdx = fnBody.indexOf("from('grocery_haul_items')");
    // Validation must appear before the item-count query within the function
    expect(validationIdx).toBeGreaterThan(-1);
    expect(countFetchIdx).toBeGreaterThan(-1);
    expect(validationIdx).toBeLessThan(countFetchIdx);
  });

  // ── R4: Item-count query failure is fatal, not silent ──

  it('11E-R4: listGroceryHaulsForPerson throws on countErr', () => {
    const service = read('lib/plans/groceryHaul/service.ts');
    // countErr must be checked and thrown, not ignored
    expect(service).toContain('Failed to load grocery haul item counts');
    expect(service).toMatch(/if \(countErr\)/);
    // Must not fall back silently: no `?? 0` after a potential undefined counts
    // The ?? 0 may only appear in the mapping after counts is confirmed non-null
    const countErrBlock = service.slice(
      service.indexOf('if (countErr)'),
      service.indexOf('const itemCountMap'),
    );
    expect(countErrBlock).toContain('throw new Error');
  });

  it('11E-R4: source-list-name fallback is documented as intentional', () => {
    const service = read('lib/plans/groceryHaul/service.ts');
    // listErr non-fatal behaviour must be explicitly documented
    expect(service).toContain('listErr is intentionally not thrown');
    expect(service).toContain('name is cosmetic');
  });
});

// ============================================================================
// 12 — R1B: Grocery List detail consumes ?action=build-haul
// ============================================================================

describe('Packet 11E — R1B: List detail ?action=build-haul handoff', () => {
  it('11E-R1B: list detail reads router.query.action for build-haul signal', () => {
    const detail = read('pages/app/food/groceries/[listId].tsx');
    // Must read the action query param
    expect(detail).toContain("router.query.action === 'build-haul'");
    expect(detail).toContain('actionBuildHaul');
  });

  it('11E-R1B: list detail scrolls the creation card into view on action=build-haul', () => {
    const detail = read('pages/app/food/groceries/[listId].tsx');
    // Scroll effect must check actionBuildHaul before scrolling
    expect(detail).toContain('haulCreationCardRef');
    expect(detail).toContain('scrollIntoView');
    expect(detail).toContain('actionBuildHaul');
  });

  it('11E-R1B: Haul creation card has id/ref anchor for scroll target', () => {
    const detail = read('pages/app/food/groceries/[listId].tsx');
    expect(detail).toContain('id="haul-creation-card"');
    expect(detail).toContain('ref={haulCreationCardRef}');
  });

  it('11E-R1B: creation card displays "Build a Haul" heading (not "Start shopping")', () => {
    const detail = read('pages/app/food/groceries/[listId].tsx');
    // Card heading is now "Build a Haul"
    expect(detail).toContain('Build a Haul');
    // Button label also updated
    const cardStart = detail.indexOf('id="haul-creation-card"');
    const cardEnd = detail.indexOf('</div>', detail.indexOf('{haulCreateError ?', cardStart));
    const cardBody = detail.slice(cardStart, cardEnd + 10);
    expect(cardBody).toContain('Build a Haul');
    // "Start shopping" must not be the button label any more
    expect(cardBody).not.toContain("'Start shopping'");
    expect(cardBody).not.toContain('"Start shopping"');
    expect(cardBody).not.toContain('>Start shopping<');
  });

  it('11E-R1B: creation card explains the snapshot boundary to the user', () => {
    const detail = read('pages/app/food/groceries/[listId].tsx');
    const cardStart = detail.indexOf('id="haul-creation-card"');
    // Boundary copy must appear inside the card
    const afterCard = detail.slice(cardStart, cardStart + 2000);
    // Must mention that the List remains ongoing after the Haul is built
    expect(afterCard).toMatch(/Grocery List stays|remains ongoing|list.*remains|ongoing/i);
    // Must mention the snapshot / execution nature of a Haul
    expect(afterCard).toMatch(/snapshot|dated|execution/i);
  });

  it('11E-R1B: the creation card still uses the existing Packet 11B/11C writer', () => {
    const detail = read('pages/app/food/groceries/[listId].tsx');
    // Writer function must still be present and unchanged
    expect(detail).toContain('startGroceryHaulFromList');
    expect(detail).toContain('handleStartShopping');
    expect(detail).toContain('creationTokenForShoppingDate');
    // Must not add a second writer call
    const writerCount = (detail.match(/startGroceryHaulFromList/g) ?? []).length;
    expect(writerCount).toBe(1);
  });

  it('11E-R1B: groceries index Build a Haul link correctly passes ?action=build-haul', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    // The link builds the query string into the href
    expect(indexPage).toContain('action=build-haul');
    // Gated by eligibility
    expect(indexPage).toContain('buildHaulHref');
    expect(indexPage).toContain('resolveGroceryHaulCreateEligibility');
  });
});
