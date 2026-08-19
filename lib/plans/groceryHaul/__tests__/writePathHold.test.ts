import fs from 'fs';
import path from 'path';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

describe('grocery haul schema write-path holds', () => {
  it('creates a Haul only from an explicit user action on list detail, not list load', () => {
    const listPage = read('pages/app/food/groceries/[listId].tsx');
    const loadAt = listPage.indexOf(
      'const result = await planService.getPersistentGroceryList(listId);',
    );
    const startAt = listPage.indexOf('planService.startGroceryHaulFromList');
    expect(loadAt).toBeGreaterThan(0);
    expect(startAt).toBeGreaterThan(loadAt);
    // 11E-R1B: button label is now "Build a Haul" (formerly "Start shopping")
    expect(listPage).toContain('Build a Haul');
    expect(listPage).toContain('handleStartShopping');
    expect(listPage).toContain('todayLocalDateKey');
    expect(listPage).toContain('creation_token: creationTokenForShoppingDate(shoppingDate)');
    expect(listPage).toContain('shopping_date: shoppingDate');
    expect(listPage).not.toContain('create_grocery_haul_from_list');
    expect(listPage).not.toContain('createHaul');
    expect(listPage).not.toContain('Start haul');
    expect(listPage).not.toContain('assignStore');
    expect(listPage).not.toContain('grocery_hauls');

    const pages = [
      'pages/api/journal/food/grocery-lists/[listId]/haul-summary.ts',
      'pages/api/journal/plans/[planId]/grocery/haul-summary.ts',
    ];
    for (const file of pages) {
      const source = read(file);
      expect(source).toMatch(/GET/);
      expect(source).not.toMatch(/insert\(/);
      expect(source).not.toContain('grocery_hauls');
    }
  });

  it('does not reinterpret Full Haul Estimate as persisted Haul truth', () => {
    const estimate = read('lib/plans/fullHaulEstimate.ts');
    expect(estimate).toContain('Pure read-model math');
    expect(estimate).not.toContain('grocery_hauls');
    expect(estimate).not.toContain('creation_token');

    const summaryTypes = read('lib/plans/groceryPricingTypes.ts');
    expect(summaryTypes).toContain('export interface FullHaulEstimate');
    expect(summaryTypes).toContain('export interface GroceryHaulSummary');
    expect(summaryTypes).not.toContain('creation_token');
    expect(summaryTypes).not.toContain('shopping_date');

    const format = read('lib/plans/groceryPricingFormat.ts');
    expect(format).toMatch(/Estimate only/i);
    expect(format).toMatch(/not a dated shopping trip/i);
  });

  it('does not mutate Packet 10 readiness, list archive, or pantry writers', () => {
    const readiness = read('lib/plans/groceryListReadiness/policy.ts');
    expect(readiness).toContain('grocery-list-readiness.v1');
    expect(readiness).not.toContain('grocery_hauls');

    const listService = read('lib/plans/groceryListService.ts');
    expect(listService).toContain('archiveGroceryList');
    expect(listService).not.toContain('grocery_hauls');
    expect(listService).not.toContain('create_grocery_haul_from_list');

    const pantry = read('lib/plans/groceryStateStore.ts');
    expect(pantry).toContain('updatePantryOnHandItem');
    expect(pantry).not.toContain('grocery_hauls');
    expect(pantry).not.toContain('create_grocery_haul_from_list');
  });

  it('does not retune NBA forward coverage', () => {
    const coverage = read('lib/plans/decisioning/forwardCoveragePolicy.ts');
    expect(coverage).toContain('horizonDays: 6');
    expect(coverage).toContain('healthyMinCoveredDays: 3');
  });

  it('keeps duplicate-safety indexes and list-delete protection after the item lifecycle correction', () => {
    const sql = read('scripts/sql/createGroceryHaulFoundation.sql');
    expect(sql).toContain('idx_grocery_hauls_person_creation_token');
    expect(sql).toContain('idx_grocery_hauls_open_list_date');
    expect(sql).toContain('CONSTRAINT grocery_hauls_list_owner_fk');
    expect(sql).toContain('ON DELETE NO ACTION');
    expect(sql).toContain('REFERENCES public.grocery_items(id) ON DELETE SET NULL');
    expect(sql).toContain('Users can read own grocery_hauls');
    expect(sql).toContain('WITH CHECK');
  });

  it('Packet 11C RPC remains the create authority and stays out of List/Pantry writers', () => {
    const rpc = read('scripts/sql/addCreateGroceryHaulFromList.sql');
    expect(rpc).toContain('create_grocery_haul_from_list');
    expect(rpc).toContain('SECURITY INVOKER');
    expect(rpc).not.toContain('CREATE TABLE');

    const listPage = read('pages/app/food/groceries/[listId].tsx');
    expect(listPage).not.toContain('create_grocery_haul_from_list');
    expect(listPage).not.toContain('Start haul');

    const service = read('lib/plans/groceryHaul/service.ts');
    expect(service).toContain("supabaseAdmin.rpc(GROCERY_HAUL_CREATE_RPC_NAME");
    expect(service).not.toMatch(/UPDATE public\.grocery_items/i);
    expect(service).not.toMatch(/from\('grocery_items'\)[\s\S]*update\(/i);

    const listService = read('lib/plans/groceryListService.ts');
    expect(listService).not.toContain('create_grocery_haul_from_list');
    const pantry = read('lib/plans/groceryStateStore.ts');
    expect(pantry).not.toContain('create_grocery_haul_from_list');
  });

  it('adds canonical Haul routes without checkout, retailer, or Pantry writes', () => {
    const routes = read('lib/routes/appRoutes.ts');
    expect(routes).toContain("foodHauls: '/app/food/hauls'");
    expect(routes).toContain('foodHaul: (haulId: string)');

    const createApi = read('pages/api/journal/food/grocery-lists/[listId]/hauls.ts');
    expect(createApi).toContain("req.method !== 'POST'");
    expect(createApi).toContain('shopping_date');
    expect(createApi).toContain('creation_token');
    expect(createApi).not.toContain('person_id: body');
    expect(createApi).not.toMatch(/\bretailer\b/);
    expect(createApi).not.toContain('checkout');

    const getApi = read('pages/api/journal/food/hauls/[haulId].ts');
    expect(getApi).toContain("req.method !== 'GET'");
    expect(getApi).not.toMatch(/insert\(/);
    expect(getApi).not.toContain('checkout');

    const detail = read('pages/app/food/hauls/[haulId].tsx');
    expect(detail).toContain('planService.getGroceryHaul');
    expect(detail).toContain('Shopping date');
    expect(detail).toContain('foodGroceryList');
    expect(detail).not.toContain('startGroceryHaulFromList');
    expect(detail).not.toContain('checkout');
    expect(detail).not.toContain('assignStore');
    expect(detail).not.toContain('updatePantryOnHandItem');
  });

  it('Packet 11E Groceries index loads Hauls from API but never auto-creates one', () => {
    const indexPage = read('pages/app/food/groceries/index.tsx');
    // Still loads grocery list overview
    expect(indexPage).toContain('planService.getGroceryListsOverview');
    expect(indexPage).toContain('APP_ROUTE_BUILDERS.foodGroceryList');
    // 11E-R1: Build a Haul routes to list detail — no writer, no handler
    expect(indexPage).not.toContain('startGroceryHaulFromList');
    expect(indexPage).not.toContain('handleBuildHaul');
    // Never directly queries the grocery_hauls table
    expect(indexPage).not.toMatch(/from\('grocery_hauls'\)/);
    // Never auto-creates
    expect(indexPage).not.toContain('create_grocery_haul_from_list');
    expect(indexPage).not.toContain('Continue shopping trip');
    // Packet 11E: lists hauls collection via planService.listGroceryHauls (not getGroceryHaul)
    expect(indexPage).not.toContain('getGroceryHaul(');

    const service = read('lib/plans/groceryListService.ts');
    expect(service).toContain('persistent_list_summaries');
    expect(service).not.toContain('grocery_hauls');
    expect(service).not.toContain('create_grocery_haul_from_list');
  });
});
