import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 13B capture-first Plans Add Meal contract', () => {
  it('keeps the full-screen shell and makes nutrition search the first body interaction', () => {
    const dialog = read('components/plans/home/PlanningMealComposerDialog.tsx');
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');
    const shell = read('components/meals/composer/FullScreenMealComposerShell.tsx');

    expect(dialog).toContain('presentation="capture-draft"');
    expect(shell).toContain('h-[100dvh]');
    const searchControl = capture.indexOf('placeholder="Search foods and brands"');
    const draftSection = capture.indexOf('<section aria-labelledby={`${searchId}-draft`}>');
    const metadataSection = capture.indexOf('Optional meal details');
    expect(searchControl).toBeGreaterThan(-1);
    expect(searchControl).toBeLessThan(draftSection);
    expect(searchControl).toBeLessThan(metadataSection);
    expect(capture).not.toContain('Slot type');
  });

  it('uses real search and barcode lookup to dispatch local MealComposer draft actions', () => {
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');
    expect(capture).toContain('foodService.search');
    expect(capture).toContain('<BarcodeScanner');
    expect(capture).toContain('foodService.lookupUpc(cleaned, { createProvisional: false })');
    expect(capture).toContain("type: 'ADD_COMPONENT_FROM_SELECTION'");
    expect(capture).toContain("type: 'ADD_COMPONENT_FROM_RECIPE'");
    expect(capture).toContain("type: 'ADD_BLANK_COMPONENT'");
    expect(capture).not.toMatch(/planService|journalService|executeMeal|journal_entries/);
  });

  it('supports additive draft review before the injected context action', () => {
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');
    expect(capture).toContain("type: 'UPDATE_COMPONENT_QUANTITY_UNIT'");
    expect(capture).toContain("type: 'REMOVE_COMPONENT'");
    expect(capture).toContain('Already in your draft');
    expect(capture).toContain('commit.onCommit()');
    expect(capture).toContain('disabled={!draftReady || submitting}');
  });

  it('exposes only live secondary methods and no unsupported capture controls', () => {
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');
    expect(capture).toContain('Quick Add');
    expect(capture).toContain('Add saved Recipe');
    expect(capture).not.toMatch(
      />\s*(Photo|Describe|Paste|Scan Nutrition Label|Scan Meal|Coming soon)\s*</i,
    );
  });

  it('keeps planning persistence behind Save with no Log action', () => {
    const panel = read('components/journal/plans/PlanMealComposerPanel.tsx');
    const dialog = read('components/plans/home/PlanningMealComposerDialog.tsx');
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');

    expect(panel).toContain('planService.createMeal');
    expect(panel).toContain('mealDocumentToPlannedMealPayload');
    expect(dialog).toContain('primaryLabel="Save"');
    expect(dialog).toContain('resolvePlansHomeTarget');
    expect(capture).not.toMatch(/Log Meal|Log CTA|log_meal/);
    expect(panel).not.toContain('planService.executeMeal');
  });

  it('does no persistence on open or Cancel and preserves Packet 13A contracts', () => {
    const dialog = read('components/plans/home/PlanningMealComposerDialog.tsx');
    const view = read('components/plans/home/PlansHomeView.tsx');
    const module = read('components/plans/home/MealGuidanceModule.tsx');

    expect(dialog.indexOf('resolvePlansHomeTarget')).toBeGreaterThan(dialog.indexOf('resolveTarget={'));
    expect(dialog).not.toMatch(/useEffect[^]*resolvePlansHomeTarget/);
    expect(view).toContain('<PlanningMealComposerDialog');
    expect(view).toContain('buildPlansHomeLogHref');
    expect(module).toContain('Planned {model.plannedCount} of {model.totalCount}');
    expect(module).toContain('model.projectedNds');
    expect(module).toContain('model.plannedCalories');
    expect(module).toContain('model.dailyCalorieGoal');
    expect(module).toContain('revealedEmptyKey');
  });
});
