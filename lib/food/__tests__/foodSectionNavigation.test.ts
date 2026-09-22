import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Food section shared eyebrow navigation', () => {
  it('uses the shared switcher on all primary Food pages with approved alignment', () => {
    const surface = read('components/food/home/FoodHomeStatusSurface.tsx');
    const pantry = read('components/food/pantry/PantryManager.tsx');
    const lists = read('components/food/lists/ListsManager.tsx');
    const hauls = read('components/food/hauls/HaulsLibrary.tsx');
    const meals = read('pages/app/food/meals.tsx');
    const topNav = read('components/journal/AppTopNav.tsx');

    expect(surface).toContain('currentView="overview"');
    expect(surface).toContain('align="center"');
    expect(pantry).toContain('currentView="pantry"');
    expect(pantry).toContain('align="center"');
    expect(lists).toContain('currentView="lists"');
    expect(lists).toContain('align="left"');
    expect(hauls).toContain('currentView="hauls"');
    expect(hauls).toContain('align="left"');
    expect(meals).toContain('currentView="recipes"');
    expect(meals).toContain('align="left"');

    expect(pantry).not.toMatch(/<p[^>]*>\s*Pantry\s*<\/p>/);
    expect(meals).not.toContain('text-emerald-200/70');
    expect(meals).not.toMatch(/uppercase tracking-\[0\.2em\][\s\S]{0,80}Meal Library/);
    expect(lists).not.toContain('FoodShoppingViewSwitcher');
    expect(hauls).not.toContain('FoodShoppingViewSwitcher');
    expect(topNav).toContain('h-[.85rem] w-auto');
  });

  it('defines the shared five-view navigator with mobile rail contract', () => {
    const switcher = read('components/food/FoodSectionViewSwitcher.tsx');
    expect(switcher).toContain("label: 'Recipes', href: APP_ROUTES.foodMeals");
    expect(switcher).toContain("label: 'Pantry', href: APP_ROUTES.foodPantry");
    expect(switcher).toContain('data-food-section-sibling-rail');
    expect(switcher).toContain('overflow-x-auto');
    expect(switcher).toContain('scrollbar-hide');
    expect(switcher).toContain('anchorBackgroundClass');
    expect(switcher).toContain("align?: 'center' | 'left'");
  });
});
