import fs from 'fs';
import path from 'path';

import { APP_ROUTES, APP_ROUTE_BUILDERS, getCanonicalAppRouteForLegacyJournalPath } from '@/lib/routes/appRoutes';
import { APP_DRAWER_HUBS } from '@/lib/navigation/appDrawerNavigation';

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Packet 3 Food IA and Lists manager', () => {
  it('makes Lists canonical and keeps legacy route constants explicit', () => {
    expect(APP_ROUTES.foodLists).toBe('/app/food/lists');
    expect(APP_ROUTES.foodGroceries).toBe('/app/food/groceries');
    expect(APP_ROUTE_BUILDERS.foodGroceryList('list 1')).toBe(
      '/app/food/lists?listId=list%201',
    );
    expect(APP_ROUTE_BUILDERS.planGrocery('plan-1')).toBe(
      '/app/food/lists/plan/plan-1',
    );
  });

  it('collapses legacy journal plan grocery routing to canonical Food Lists', () => {
    expect(getCanonicalAppRouteForLegacyJournalPath('/journal/plans/grocery/plan-1')).toBe(
      '/app/food/lists/plan/plan-1',
    );
  });

  it('presents Lists as the canonical Food drawer destination', () => {
    const food = APP_DRAWER_HUBS.find((hub) => hub.id === 'food');
    expect(food?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'food-lists',
          label: 'Lists',
          href: '/app/food/lists',
        }),
      ]),
    );
    expect(food?.items?.some((item) => item.label === 'Grocery Lists')).toBe(false);
  });

  it('redirects legacy Groceries collection and detail URLs without dropping context', () => {
    const collection = read('pages/app/food/groceries/index.tsx');
    const detail = read('pages/app/food/groceries/[listId].tsx');
    const plan = read('pages/app/food/groceries/plan/[planId].tsx');
    expect(collection).toContain('destination: `/app/food/lists');
    expect(detail).toContain('new URLSearchParams({ listId })');
    expect(detail).toContain('destination: `/app/food/lists?');
    expect(plan).toContain('/app/food/lists/plan/');
  });

  it('renders one selected persistent List with production-safe intake and creation', () => {
    const manager = read('components/food/lists/ListsManager.tsx');
    expect(manager).toContain('Select a List');
    expect(manager).toContain('+ New List');
    expect(manager).toContain('planService.createNamedGroceryList');
    expect(manager).toContain('planService.addPersistentGroceryItem(selectedListId');
    expect(manager).toContain('planService.getPersistentGroceryList(selectedListId)');
    expect(manager).toContain("pathname: '/app/food/lists'");
  });

  it('preserves Need then Product then Store then Price then Quantity grammar', () => {
    const manager = read('components/food/lists/ListsManager.tsx');
    const need = manager.indexOf('{item.name}</h2>');
    const product = manager.indexOf('{product}</p>', need);
    const store = manager.indexOf('{price.retailer}</p>', product);
    const price = manager.indexOf('formatGroceryCurrency(price.line_total', store);
    const quantity = manager.indexOf('Decrease ${item.name} quantity', price);
    expect(need).toBeGreaterThan(-1);
    expect(product).toBeGreaterThan(need);
    expect(store).toBeGreaterThan(product);
    expect(price).toBeGreaterThan(store);
    expect(quantity).toBeGreaterThan(price);
    expect(manager).toContain('Choose Product');
    expect(manager).toContain('•••');
    expect(manager).toContain('rounded-full border border-white/20');
    expect(manager).toContain('bg-gradient-to-b from-[#17130f] via-brand-900 to-neutral-700');
    expect(manager).toContain('bg-[length:100%_100vh]');
    expect(manager).toContain('bg-no-repeat');
    expect(manager).toContain('bg-top');
    expect(manager).toContain('bg-neutral-700');
    expect(manager).toContain("if (list.is_default) return 'Essentials'");
    expect(manager).toContain('max-w-[950px]');
    expect(manager).toContain('currentView="lists"');
    expect(manager).toContain('align="left"');
    expect(manager).toContain('text-[2.5rem] font-regular tracking-tight');
    expect(manager).toContain('sm:text-[2.75rem]');
    expect(manager).toContain('appearance-none');
    expect(manager).toContain('polygon points="12,18 2,6 22,6"');
    expect(manager).not.toContain('min-h-14 flex-1 rounded-full');
    expect(manager).not.toContain('Delete');
    expect(read('components/food/lists/ListsItemEditor.tsx')).toContain('Remove from List');
  });

  it('keeps List editing persistent and omits transfer checkboxes', () => {
    const manager = read('components/food/lists/ListsManager.tsx');
    const editor = read('components/food/lists/ListsItemEditor.tsx');
    expect(manager).toContain('<ListsItemEditor');
    expect(manager).toContain('planService.updatePersistentGroceryItem');
    expect(manager).toContain('planService.changePersistentGroceryListItemNeed');
    expect(manager).toContain('planService.deletePersistentGroceryItem');
    expect(editor).toContain('Change need');
    expect(editor).toContain('Remove from List');
    expect(manager).not.toContain('Find Price');
    expect(manager).not.toContain('type="checkbox"');
  });

  it('uses the approved non-destructive Haul handoff and current one-List writer', () => {
    const manager = read('components/food/lists/ListsManager.tsx');
    expect(manager).toContain('Ready to shop?');
    expect(manager).toContain('Create a haul to combine items from one or more lists.');
    expect(manager).toContain('Build a Haul');
    expect(manager).toContain('planService.startGroceryHaulFromList(selectedListId');
    expect(manager).toContain('Your source List and its items stay intact.');
    expect(manager).not.toContain('grocery_haul_source_lists');
    expect(manager).not.toContain('pantry_acquisition_lots');
  });

  it('defaults null list item quantity to one in display and edit flows', () => {
    const manager = read('components/food/lists/ListsManager.tsx');
    expect(manager).toContain('item.quantity ?? 1');
    expect(manager).toContain("item.quantity == null ? '1' : String(item.quantity)");
    expect(manager).toContain("editQuantity.trim() === '' ? 1 : Number(editQuantity)");
    expect(manager).toContain('evaluateGroceryListReadiness');
  });

  it('uses Packet 1 shell and dialog primitives with footer clearance', () => {
    const manager = read('components/food/lists/ListsManager.tsx');
    expect(manager).toContain('<SignedInPageScroll');
    expect(manager).toContain('<AppDialog');
    expect(manager).toContain('<JournalFooterNav');
  });
});
