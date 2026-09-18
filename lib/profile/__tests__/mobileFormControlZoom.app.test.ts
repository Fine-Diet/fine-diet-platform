import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Signed-in app mobile form control zoom (Pass 2)', () => {
  it('uses text-xl on Plan Library search and sort controls', () => {
    const browser = read('components/journal/plans/PlanLibraryBrowser.tsx');
    expect(browser).toContain('py-1 pr-5 text-xl text-white/80');
    expect(browser).toContain('py-2 pr-9 text-xl text-white outline-none');
  });

  it('uses text-xl on Pantry primary search and shared editor inputs', () => {
    const pantry = read('components/food/pantry/PantryManager.tsx');
    expect(pantry).toMatch(/const inputClass =[\s\S]{0,220}text-xl/);
    expect(pantry).toContain('py-2.5 pl-10 pr-10 text-xl text-white');
  });

  it('uses text-xl on Lists primary search', () => {
    const lists = read('components/food/lists/ListsManager.tsx');
    expect(lists).toContain('py-2 text-xl text-white outline-none placeholder:text-white/35');
  });

  it('uses text-xl on Hauls Library search', () => {
    const hauls = read('components/food/hauls/HaulsLibrary.tsx');
    expect(hauls).toContain('pl-10 pr-4 text-xl text-white outline-none');
  });

  it('uses text-xl on Food Meals library search', () => {
    const meals = read('pages/app/food/meals.tsx');
    expect(meals).toContain('py-2.5 text-xl text-brand-50 antialiased');
  });

  it('uses text-xl on MealComponentFoodSearch shared inputs', () => {
    const search = read('components/meals/MealComponentFoodSearch.tsx');
    expect(search).toMatch(/const inputClass =[\s\S]{0,220}text-xl/);
  });

  it('uses text-xl on MealComposerRecipeSearch', () => {
    const search = read('components/meals/MealComposerRecipeSearch.tsx');
    expect(search).toContain('py-2.5 text-xl text-brand-50 outline-none');
  });

  it('preserves already-fixed Log nutrition searches at text-xl', () => {
    const draft = read('components/journal/log/LogNutritionDraftPage.tsx');
    const editor = read('components/journal/log/CommittedNutritionEditor.tsx');
    expect(draft).toContain('px-7 text-xl text-white/85');
    expect(editor).toContain('px-4 py-2 text-xl outline-none');
  });

  it('uses text-xl on Onboarding editable field classes', () => {
    const onboarding = read('components/onboarding/OnboardingFlowView.tsx');
    expect(onboarding).toMatch(/const FIELD_CLASS =[\s\S]{0,220}text-xl/);
    expect(onboarding).toMatch(/const UNIT_SELECT_CLASS =[\s\S]{0,220}text-xl/);
  });
});
