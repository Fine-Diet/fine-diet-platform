import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 13D Plans Home contracts', () => {
  it('carries the authoritative Save target into the immediate Home read', () => {
    const panel = read('components/journal/plans/PlanMealComposerPanel.tsx');
    const dialog = read('components/plans/home/PlanningMealComposerDialog.tsx');
    const view = read('components/plans/home/PlansHomeView.tsx');

    expect(dialog).toContain('return target');
    expect(panel).toContain('await props.onSaved({ meal, target })');
    expect(view).toContain('postSaveReadTargetRef');
    expect(view).toContain('resolvePlansHomeReadPlanId');
    expect(view).toContain('planService.getDetail(readPlanId)');
  });

  it('guards the shared Home/Day slot create path and never overwrites', () => {
    const panel = read('components/journal/plans/PlanMealComposerPanel.tsx');
    const route = read('pages/api/journal/plans/meals/index.ts');

    expect(panel).toContain('create_context: props.createContext');
    expect(route).toContain("body.create_context === 'plans_home'");
    expect(route.indexOf('findExistingCanonicalSlotMeal')).toBeLessThan(
      route.indexOf('insertPlannedMeal({'),
    );
    expect(route).toContain("body.create_context === 'plans_slot'");
    expect(route).toContain('already_filled: true');
    expect(route).not.toMatch(/from\('planned_meals'\)\s*\.update/);
  });

  it('uses shared logSearch and canonical MealDocument draft loading', () => {
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');
    const reducer = read('lib/meals/composer/state.ts');

    expect(capture).toContain('logSearchService.search');
    expect(capture).toContain("'saved_meals'");
    expect(capture).toContain('Saved Meal');
    expect(capture).toContain("type: 'ADD_SAVED_MEAL_GROUP'");
    expect(reducer).toContain("case 'ADD_SAVED_MEAL_GROUP'");
    expect(read('components/journal/plans/PlanMealComposerPanel.tsx')).toContain(
      'groupedSource?.source_template_id',
    );
    expect(read('components/journal/plans/PlanMealComposerPanel.tsx')).toContain(
      'shouldStampPlannedMealDocumentPointer(state.document)',
    );
    expect(capture).not.toMatch(/journalService|journal_entries|executeMeal/);
  });
});
