import fs from 'fs';
import path from 'path';

import { APP_ROUTES } from '@/lib/routes/appRoutes';
import {
  APP_DRAWER_HUBS,
  FOOD_DRAWER_SHOPPING_SUBGROUP_ID,
  getFoodDrawerHub,
  isFoodDrawerShoppingChildPath,
} from '@/lib/navigation/appDrawerNavigation';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Food drawer taxonomy (Figma convergence)', () => {
  const food = getFoodDrawerHub();

  it('exposes the approved top-level Food drawer labels in order', () => {
    expect(food?.items?.map((item) => item.label)).toEqual([
      'Home',
      'Pantry',
      'Shopping',
      'Recipes',
    ]);
  });

  it('maps canonical routes for Home, Pantry, and Recipes', () => {
    expect(food?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'food-home', label: 'Home', href: APP_ROUTES.food }),
        expect.objectContaining({ id: 'food-pantry', label: 'Pantry', href: APP_ROUTES.foodPantry }),
        expect.objectContaining({ id: 'food-meals', label: 'Recipes', href: APP_ROUTES.foodMeals }),
      ]),
    );
  });

  it('nests Lists and Hauls under a non-navigating Shopping subgroup', () => {
    const shopping = food?.items?.find((item) => item.id === FOOD_DRAWER_SHOPPING_SUBGROUP_ID);
    expect(shopping?.label).toBe('Shopping');
    expect(shopping?.href).toBeUndefined();
    expect(shopping?.children).toEqual([
      expect.objectContaining({
        id: 'food-lists',
        label: 'Lists',
        href: APP_ROUTES.foodLists,
      }),
      expect.objectContaining({
        id: 'food-hauls',
        label: 'Hauls',
        href: APP_ROUTES.foodHauls,
      }),
    ]);
  });

  it('removes legacy Food drawer quick-action rows without deleting routes elsewhere', () => {
    const labels = food?.items?.flatMap((item) => [
      item.label,
      ...(item.children?.map((child) => child.label) ?? []),
    ]);
    expect(labels).not.toContain('Add Meal');
    expect(labels).not.toContain('Food Home');
    expect(labels).not.toContain('Meals & Recipes');
    expect(labels).not.toContain('Haul');
    expect(labels).not.toContain('List');
    expect(APP_DRAWER_HUBS.find((hub) => hub.id === 'food')?.items?.length).toBe(4);
  });

  it('detects Haul and List paths for Shopping auto-expand', () => {
    expect(isFoodDrawerShoppingChildPath('/app/food/hauls')).toBe(true);
    expect(isFoodDrawerShoppingChildPath('/app/food/hauls/haul-1')).toBe(true);
    expect(isFoodDrawerShoppingChildPath('/app/food/lists')).toBe(true);
    expect(isFoodDrawerShoppingChildPath('/app/food/lists/plan/plan-1')).toBe(true);
    expect(isFoodDrawerShoppingChildPath('/app/food/pantry')).toBe(false);
  });
});

describe('AppSideMenu Shopping subgroup presentation', () => {
  const menu = read('components/journal/AppSideMenu.tsx');

  it('renders Shopping as an accessible expandable subgroup with deeper Lists/Hauls inset', () => {
    expect(menu).toContain('aria-expanded={subgroupOpen}');
    expect(menu).toContain('toggleSubgroup');
    expect(menu).toContain('pl-[52px]');
    expect(menu).toContain('FOOD_DRAWER_SHOPPING_SUBGROUP_ID');
    expect(menu).toContain('isFoodDrawerShoppingChildPath');
    expect(menu).toContain('border-b-[0.5px] border-white/50');
    expect(menu).toContain('shopping-child');
    expect(menu).toContain('bg-white/10 text-white/72');
    expect(menu).toContain('text-white/88');
  });
});
