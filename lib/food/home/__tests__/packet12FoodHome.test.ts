import fs from 'fs';
import path from 'path';

import {
  formatFoodHomeHaulTiming,
  hasBuildableFoodHomeList,
  selectNextFoodHomeHaul,
} from '../status';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import { evaluateGroceryListReadiness } from '@/lib/plans/groceryListReadiness/policy';
import type {
  GeneratedGroceryList,
  GroceryHaulCollectionItem,
  GroceryItem,
} from '@/lib/plans/types';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

function haul(
  id: string,
  status: GroceryHaulCollectionItem['status'],
  shoppingDate: string,
  updatedAt: string,
): GroceryHaulCollectionItem {
  return {
    id,
    source_grocery_list_id: 'list-1',
    source_list_name: 'Weekly',
    source_list_names: ['Weekly'],
    title: null,
    shopping_date: shoppingDate,
    status,
    item_count: 1,
    execution_item_count: 1,
    unpriced_item_count: 0,
    estimated_total: 5,
    currency: 'USD',
    budget_amount: null,
    store_names: [],
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: updatedAt,
  };
}

function list(): GeneratedGroceryList {
  return {
    id: 'list-1',
    person_id: 'person-1',
    plan_id: null,
    title: 'Weekly',
    status: 'active',
    is_default: false,
    archived_at: null,
    created_at: '',
    updated_at: '',
  };
}

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return {
    id: 'item-1',
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    name: 'Oats',
    quantity: 1,
    unit: null,
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

describe('Packet 12 Food Home status surface', () => {
  it('retires the old visible modules and keeps the canonical Pantry handoff percentage-free', () => {
    const page = read('pages/app/food/index.tsx');
    const view = read('components/food/home/FoodHomeView.tsx');
    const surface = read('components/food/home/FoodHomeStatusSurface.tsx');
    expect(page).toContain('<FoodHomeView />');
    expect(page).not.toMatch(/FoodReadinessModule|ReadyAnytimeModule|BuildAheadModule/);
    expect(view).not.toMatch(/FoodReadinessModule|ReadyAnytimeModule|BuildAheadModule/);
    expect(surface).toContain('Essentials Ready');
    expect(surface).toContain('Open Pantry');
    expect(surface).toContain('APP_ROUTES.foodPantry');
    expect(`${view}\n${surface}`).not.toMatch(/80%|PantryReadinessSummary|coverage/);
  });

  it('prioritizes active execution and routes each continuation state canonically', () => {
    const selected = selectNextFoodHomeHaul([
      haul('planned-near', 'planned', '2026-09-09', '2026-09-08T16:00:00Z'),
      haul('active-later', 'active', '2026-09-12', '2026-09-08T12:00:00Z'),
      haul('closed', 'closed', '2026-09-08', '2026-09-08T20:00:00Z'),
      haul('cancelled', 'cancelled', '2026-09-08', '2026-09-08T21:00:00Z'),
    ], '2026-09-08');
    expect(selected?.id).toBe('active-later');
    expect(APP_ROUTE_BUILDERS.foodHaulShop(selected!.id)).toBe(
      '/app/food/hauls/active-later/shop',
    );
    expect(APP_ROUTE_BUILDERS.foodHaul('planned-near')).toBe(
      '/app/food/hauls/planned-near',
    );
  });

  it('uses nearest upcoming date, recent-update fallback, and no stale cutoff', () => {
    expect(selectNextFoodHomeHaul([
      haul('far', 'planned', '2026-09-20', '2026-09-08T20:00:00Z'),
      haul('near', 'planned', '2026-09-10', '2026-09-08T10:00:00Z'),
    ], '2026-09-08')?.id).toBe('near');

    expect(selectNextFoodHomeHaul([
      haul('older-update', 'planned', '2026-09-01', '2026-09-07T10:00:00Z'),
      haul('recent-update', 'planned', '2026-09-02', '2026-09-08T10:00:00Z'),
    ], '2026-09-08')?.id).toBe('recent-update');
    expect(read('lib/food/home/status.ts')).not.toMatch(
      /\b(STALE|MAX_AGE|CUTOFF)_DAYS\b|\b(30|60|90)\s*\*\s*DAY_MS/i,
    );
  });

  it('formats timing with calendar-safe calm labels', () => {
    expect(formatFoodHomeHaulTiming('2026-09-08', '2026-09-08')).toBe('Today');
    expect(formatFoodHomeHaulTiming('2026-09-10', '2026-09-08')).toBe('Thu');
    expect(formatFoodHomeHaulTiming('2026-09-15', '2026-09-08')).toBe('Next Tue');
    expect(formatFoodHomeHaulTiming('2026-09-29', '2026-09-08')).toBe('3 Wks');
    expect(formatFoodHomeHaulTiming('2026-09-01', '2026-09-08')).toBe('Sep 1');
    expect(formatFoodHomeHaulTiming('2026-09-01', '2026-09-08')).not.toMatch(/overdue/i);
  });

  it('proves buildability through existing readiness semantics and otherwise fails closed', () => {
    const ready = evaluateGroceryListReadiness({ items: [item()] });
    const unresolved = evaluateGroceryListReadiness({
      items: [item({ food_object_id: null })],
    });
    expect(hasBuildableFoodHomeList([list()], { 'list-1': ready })).toBe(true);
    expect(hasBuildableFoodHomeList([list()], { 'list-1': unresolved })).toBe(false);
    expect(hasBuildableFoodHomeList([list()], {})).toBe(false);

    const surface = read('components/food/home/FoodHomeStatusSurface.tsx');
    expect(surface).toContain("href: APP_ROUTES.foodHauls");
    expect(surface).toContain("action: 'Build a Haul'");
    expect(surface).toContain("href: APP_ROUTES.foodLists");
    expect(surface).toContain("action: 'Review Lists'");
  });

  it('offers only supported recipe terminal paths from Home', () => {
    const view = read('components/food/home/FoodHomeView.tsx');
    const menu = read('components/food/home/RecipeEntryMenu.tsx');
    const surface = read('components/food/home/FoodHomeStatusSurface.tsx');
    expect(surface).toContain('Recipes');
    expect(surface).toContain('Add recipes from links, text or scratch.');
    expect(menu).toContain('Add a recipe.');
    expect(menu).toContain('Create from scratch');
    expect(menu).toContain('Copy & paste text');
    expect(menu).toContain('Import from a link');
    expect(view).toContain('<CreateMealDocumentPanel');
    expect(view).toContain('APP_ROUTES.planImportNew');
    expect(`${view}\n${menu}\n${surface}`).not.toMatch(/photo|image|pdf|food\/recipes/i);
    expect(APP_ROUTES.food).toBe('/app/food');
  });
});
