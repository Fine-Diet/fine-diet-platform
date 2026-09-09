import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 13F-A final Plans Home reference corrections', () => {
  it('renders the local rail as exactly Manage, Day, Week, Month', () => {
    const rail = read('components/plans/home/PlanningRouteRail.tsx');

    expect(rail).toContain('grid-cols-4');
    expect(rail).toContain('Manage');
    expect(rail).toContain('href={APP_ROUTES.todayPlan}');
    expect(rail).toContain('href={APP_ROUTES.plansWeek}');
    expect(rail).toContain('aria-disabled="true"');
    expect(rail).toContain('Month');
    expect(rail).not.toContain('APP_ROUTES.plans}');
    expect(rail).not.toContain('APP_ROUTES.foodMeals');
    expect(rail).not.toContain('Library');
  });

  it('uses aggregate nutrition for Meal rows and item nutrition for Single Item rows', () => {
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');

    expect(capture).toContain('authoringGroup.component_ids.includes');
    expect(capture).toContain('recomputeMealNutrition(');
    expect(capture).toContain('recomputeMealNutrition([component]).totals');
    expect(capture).toContain('formatCompactNutrition(rowNutrition)');
    expect(capture).toContain('nutrition.macros.protein_g != null');
    expect(capture).toContain('nutrition.macros.carbs_g != null');
    expect(capture).toContain('nutrition.macros.fat_g != null');
    expect(capture).toContain('Nutrition will remain reviewable');
  });

  it('projects slot NDS and kcal from the whole local composition', () => {
    const panel = read('components/journal/plans/PlanMealComposerPanel.tsx');
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');

    expect(panel).toContain('mealDocumentToPlannedMealPayload(document, authoringGroups)');
    expect(panel).toContain('recomputeMealNDSShape(document.title, payload)');
    expect(panel).toContain('projectSingleMealAsDay(meal).nds_score_100');
    expect(panel).toContain('nds={slotNds}');
    expect(capture).toContain("NDS: {nds == null ? '—' : Math.round(nds)}");
    expect(capture).toContain('state.document.totals?.calories');
    expect(capture).not.toContain('<span>NDS —</span>');
  });
});
