import fs from 'fs';
import path from 'path';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

describe('grocery haul schema write-path holds', () => {
  it('does not add Haul creation UI, POST create, or detail routes', () => {
    const listPage = read('pages/app/food/groceries/[listId].tsx');
    expect(listPage).not.toContain('createHaul');
    expect(listPage).not.toContain('Start haul');
    expect(listPage).not.toContain('Start shopping');
    expect(listPage).not.toContain('grocery_hauls');

    const pages = [
      'pages/api/journal/food/grocery-lists/[listId]/haul-summary.ts',
      'pages/api/journal/plans/[planId]/grocery/haul-summary.ts',
    ];
    for (const file of pages) {
      const source = read(file);
      expect(source).toMatch(/GET/);
      expect(source).not.toMatch(/insert\(/);
      expect(source).not.toContain('grocery_hauls');
    }

    expect(fs.existsSync(path.join(process.cwd(), 'pages/app/food/hauls'))).toBe(false);
    expect(
      fs.existsSync(path.join(process.cwd(), 'pages/api/journal/food/hauls')),
    ).toBe(false);
  });

  it('does not reinterpret Full Haul Estimate as persisted Haul truth', () => {
    const estimate = read('lib/plans/fullHaulEstimate.ts');
    expect(estimate).toContain('Pure read-model math');
    expect(estimate).not.toContain('grocery_hauls');
    expect(estimate).not.toContain('creation_token');

    const summaryTypes = read('lib/plans/groceryPricingTypes.ts');
    expect(summaryTypes).toContain('export interface FullHaulEstimate');
    expect(summaryTypes).toContain('export interface GroceryHaulSummary');
    expect(summaryTypes).not.toContain('creation_token');
    expect(summaryTypes).not.toContain('shopping_date');

    const format = read('lib/plans/groceryPricingFormat.ts');
    expect(format).toMatch(/Estimate only/i);
    expect(format).toMatch(/not a dated shopping trip/i);
  });

  it('does not mutate Packet 10 readiness, list archive, or pantry writers', () => {
    const readiness = read('lib/plans/groceryListReadiness/policy.ts');
    expect(readiness).toContain('grocery-list-readiness.v1');
    expect(readiness).not.toContain('grocery_hauls');

    const listService = read('lib/plans/groceryListService.ts');
    expect(listService).toContain('archiveGroceryList');
    expect(listService).not.toContain('grocery_hauls');

    const pantry = read('lib/plans/groceryStateStore.ts');
    expect(pantry).toContain('updatePantryOnHandItem');
    expect(pantry).not.toContain('grocery_hauls');
  });

  it('does not retune NBA forward coverage', () => {
    const coverage = read('lib/plans/decisioning/forwardCoveragePolicy.ts');
    expect(coverage).toContain('horizonDays: 6');
    expect(coverage).toContain('healthyMinCoveredDays: 3');
  });

  it('keeps duplicate-safety indexes and list-delete protection after the item lifecycle correction', () => {
    const sql = read('scripts/sql/createGroceryHaulFoundation.sql');
    expect(sql).toContain('idx_grocery_hauls_person_creation_token');
    expect(sql).toContain('idx_grocery_hauls_open_list_date');
    expect(sql).toContain('CONSTRAINT grocery_hauls_list_owner_fk');
    expect(sql).toContain('ON DELETE NO ACTION');
    expect(sql).toContain('REFERENCES public.grocery_items(id) ON DELETE SET NULL');
    expect(sql).toContain('Users can read own grocery_hauls');
    expect(sql).toContain('WITH CHECK');
  });
});
