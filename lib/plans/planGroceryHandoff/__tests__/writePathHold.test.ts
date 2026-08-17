import fs from 'fs';
import path from 'path';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

describe('plan grocery handoff write-path holds', () => {
  it('reuses the existing generateGroceryList contract and never force-regenerates', () => {
    const save = read('lib/plans/planGroceryHandoff/save.ts');
    expect(save).toContain('planService.generateGroceryList');
    expect(save).toContain('regenerate: false');
    expect(save).not.toContain('regenerate: true');
    expect(save).not.toContain('forceRegenerate: true');
    expect(save).not.toContain('reconcilePlanScopeIntoGroceryList');
    expect(save).not.toContain('deriveItemsFromMeals');
    expect(save).not.toContain('haul-summary');

    const grocery = read('pages/api/journal/plans/[planId]/grocery/generate.ts');
    expect(grocery).toContain('date_end?: string');
    expect(grocery).toContain('dateStart');
    expect(grocery).toContain('dateEnd');
    expect(grocery).toContain('generateGroceryList');
  });

  it('routes the Plan Week success handoff by list id without a second generate write', () => {
    const save = read('lib/plans/planGroceryHandoff/save.ts');
    expect(save).toContain('listId: list.id');
    expect(save).toContain('planGroceryHandoffHref');
    expect(save).not.toContain('planGrocery(');
    expect(save).not.toContain('buildPlanGroceryRangeHref');

    const policy = read('lib/plans/planGroceryHandoff/policy.ts');
    expect(policy).toContain('foodGroceryList');
    expect(policy).toContain('containing_range');
    expect(policy).not.toContain('buildPlanGroceryRangeHref');
    expect(policy).not.toContain("planGrocery(");

    const listPage = read('pages/app/food/groceries/[listId].tsx');
    expect(listPage).toContain('getPersistentGroceryList');
    expect(listPage).not.toContain('generateGroceryList');
    expect(listPage).not.toContain('/grocery/generate');
    const loadAt = listPage.indexOf('const result = await planService.getPersistentGroceryList(listId);');
    const redirectAt = listPage.indexOf('APP_ROUTE_BUILDERS.planGrocery(result.list.plan_id)');
    expect(loadAt).toBeGreaterThan(0);
    expect(redirectAt).toBe(-1);
  });

  it('does not generate on Plan Week page load and keeps regenerate out of the default action', () => {
    const view = read('components/plans/planWeek/SimplifiedPlanWeekView.tsx');
    const loadAt = view.indexOf('planService.list()');
    const openAt = view.indexOf('function openGroceryHandoff');
    const commitAt = view.indexOf('async function commitGroceryHandoff');
    expect(loadAt).toBeGreaterThan(0);
    expect(openAt).toBeGreaterThan(loadAt);
    expect(commitAt).toBeGreaterThan(openAt);
    expect(view.indexOf('commitPlanGroceryHandoff({')).toBeGreaterThan(commitAt);
    expect(view).not.toContain('planService.generate');
    expect(view).not.toContain('/grocery/generate');
    expect(view).not.toContain('regenerate: true');
    expect(view).toContain('Build grocery list');
  });

  it('does not retune NBA forward coverage or add an automatic grocery generate CTA', () => {
    const coverage = read('lib/plans/decisioning/forwardCoveragePolicy.ts');
    expect(coverage).toContain('horizonDays: 6');
    expect(coverage).toContain('healthyMinCoveredDays: 3');

    const nba = read('lib/plans/decisioning/resolvePlansNextBestAction.ts');
    expect(nba).toContain("action('open_grocery'");
    expect(nba).not.toContain('generateGroceryList');
    expect(nba).not.toContain('/grocery/generate');
    expect(nba).toContain('if (!input.groceryDemand || !input.destinations.grocery) return null');
  });

  it('leaves Packet 3/7/8 writers and Packet 8 grocery holds intact', () => {
    const repeat = read('lib/plans/planRepeatServerService.ts');
    expect(repeat).toContain('ensurePlanOccasionStructureForPerson');
    expect(repeat).toContain('attachCanonicalMealForPerson');
    expect(repeat).not.toContain('generateGroceryList');

    const attach = read('lib/plans/mealCreation/attachCanonicalMealForPerson.ts');
    expect(attach).toContain('insertPlannedMeal');
    expect(attach).not.toContain('generateGroceryList');

    const structure = read('lib/plans/planStructureServerService.ts');
    expect(structure).not.toContain('insertPlannedMeal');
    expect(structure).not.toContain('generateGroceryList');
  });

  it('does not introduce schema/DDL, Haul, or a second grocery derivation path', () => {
    const files = [
      'lib/plans/planGroceryHandoff/policy.ts',
      'lib/plans/planGroceryHandoff/events.ts',
      'lib/plans/planGroceryHandoff/save.ts',
      'components/plans/planWeek/SimplifiedPlanWeekView.tsx',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/create table/i);
      expect(source).not.toMatch(/alter table/i);
      expect(source).not.toContain('haul-summary');
      expect(source).not.toContain('ensurePlanHorizonThroughDate');
      expect(source).not.toContain('instantiatePlanWeekPattern');
    }
    const policy = read('lib/plans/planGroceryHandoff/policy.ts');
    expect(policy).not.toContain('deriveItemsFromMeals');
    expect(policy).toContain('plan-grocery-handoff.explicit');
  });
});
