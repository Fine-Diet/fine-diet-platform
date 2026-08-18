import fs from 'fs';
import path from 'path';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

describe('grocery list readiness write-path holds', () => {
  it('keeps Packet 9 list-id handoff GET-only and does not generate on [listId] load', () => {
    const listPage = read('pages/app/food/groceries/[listId].tsx');
    expect(listPage).toContain('getPersistentGroceryList');
    expect(listPage).not.toContain('generateGroceryList');
    expect(listPage).not.toContain('/grocery/generate');
    const loadAt = listPage.indexOf('const result = await planService.getPersistentGroceryList(listId);');
    const redirectAt = listPage.indexOf('APP_ROUTE_BUILDERS.planGrocery(result.list.plan_id)');
    expect(loadAt).toBeGreaterThan(0);
    expect(redirectAt).toBe(-1);

    const save = read('lib/plans/planGroceryHandoff/save.ts');
    expect(save).toContain('regenerate: false');
    expect(save).not.toContain('regenerate: true');
    expect(save).toContain('planGroceryHandoffHref');
  });

  it('keeps containing-range provenance copy truthful', () => {
    const policy = read('lib/plans/planGroceryHandoff/policy.ts');
    expect(policy).toContain('Requested ');
    expect(policy).toContain('Showing the existing grocery list for');
    const listPage = read('pages/app/food/groceries/[listId].tsx');
    expect(listPage).toContain('formatContainingRangeCopy');
  });

  it('distinguishes additive Pull from Plan from Packet 9 canonical generate/reuse', () => {
    const listPage = read('pages/app/food/groceries/[listId].tsx');
    expect(listPage).toContain('GROCERY_LIST_PULL_FROM_PLAN_TITLE');
    expect(listPage).toContain('GROCERY_LIST_PULL_FROM_PLAN_HELP');
    expect(listPage).toContain('Add pending needs to this list');
    expect(listPage).toContain('reconcilePlanGroceryList');
    expect(listPage).not.toContain('generateGroceryList');

    const reconcile = read('lib/plans/groceryListService.ts');
    expect(reconcile).toContain("source_type: 'planned_meal'");
    expect(reconcile).toContain("source_type === 'planned_meal'");
    expect(reconcile).toContain('manual items and');
    expect(reconcile).toContain('Cannot reconcile into a plan-scoped list');

    const reconcileTest = read('lib/plans/__tests__/groceryListService.test.ts');
    expect(reconcileTest).toContain('does not touch manual items or other reconciliation batches');
    expect(reconcileTest).toContain("expect(manual.source_type).toBe('manual')");
  });

  it('does not create Haul/store/cart truth from readiness or retailer preview', () => {
    const policy = read('lib/plans/groceryListReadiness/policy.ts');
    expect(policy).not.toContain('haul-summary');
    expect(policy).not.toContain('createHaul');
    expect(policy).toContain('never classify a list');

    const listPage = read('pages/app/food/groceries/[listId].tsx');
    expect(listPage).toContain('Preview only — not applied');
    expect(listPage).toContain('Use these prices for this list');
    expect(listPage).not.toContain('createHaul');
    expect(listPage).not.toContain('assignStore');
    const loadAt = listPage.indexOf(
      'const result = await planService.getPersistentGroceryList(listId);',
    );
    const startAt = listPage.indexOf('planService.startGroceryHaulFromList');
    expect(loadAt).toBeGreaterThan(0);
    expect(startAt).toBeGreaterThan(loadAt);

    const retailer = read('lib/plans/groceryListRetailerScenario.ts');
    expect(retailer).toContain('Never mutates active quotes');
  });

  it('keeps Full Haul Estimate as an estimate, not a Haul record', () => {
    const format = read('lib/plans/groceryPricingFormat.ts');
    expect(format).toContain('GROCERY_HAUL_ESTIMATE_DISCLAIMER');
    expect(format).toMatch(/Estimate only/i);
    expect(format).toMatch(/not a dated shopping trip/i);

    const card = read('components/grocery/GroceryPricingUi.tsx');
    expect(card).toContain('Full Haul Estimate');
    expect(card).toContain('GROCERY_HAUL_ESTIMATE_DISCLAIMER');

    const api = read('pages/api/journal/food/grocery-lists/[listId]/haul-summary.ts');
    expect(api).toMatch(/GET/);
    expect(api).not.toMatch(/insert\(/);
  });

  it('does not retune NBA forward coverage or add Haul/schema writes', () => {
    const coverage = read('lib/plans/decisioning/forwardCoveragePolicy.ts');
    expect(coverage).toContain('horizonDays: 6');
    expect(coverage).toContain('healthyMinCoveredDays: 3');

    const files = [
      'lib/plans/groceryListReadiness/policy.ts',
      'lib/plans/groceryListReadiness/events.ts',
      'pages/app/food/groceries/[listId].tsx',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/create table/i);
      expect(source).not.toMatch(/alter table/i);
      expect(source).not.toContain('ensurePlanHorizonThroughDate');
      expect(source).not.toContain('instantiatePlanWeekPattern');
    }
  });

  it('leaves Packet 3/7/8/9 writers intact', () => {
    const repeat = read('lib/plans/planRepeatServerService.ts');
    expect(repeat).toContain('ensurePlanOccasionStructureForPerson');
    expect(repeat).not.toContain('generateGroceryList');

    const attach = read('lib/plans/mealCreation/attachCanonicalMealForPerson.ts');
    expect(attach).toContain('insertPlannedMeal');
    expect(attach).not.toContain('generateGroceryList');

    const structure = read('lib/plans/planStructureServerService.ts');
    expect(structure).not.toContain('insertPlannedMeal');
    expect(structure).not.toContain('generateGroceryList');

    const handoff = read('lib/plans/planGroceryHandoff/save.ts');
    expect(handoff).toContain('planService.generateGroceryList');
    expect(handoff).toContain('regenerate: false');
  });
});
