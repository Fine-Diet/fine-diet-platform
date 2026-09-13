import fs from 'fs';
import path from 'path';

import { APP_ROUTE_BUILDERS, getCanonicalAppRouteForLegacyJournalPath } from '@/lib/routes/appRoutes';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Plan demand to persistent List handoff after Packet 3', () => {
  it('routes plan-derived demand directly under canonical Food Lists', () => {
    expect(APP_ROUTE_BUILDERS.planGrocery('plan-1')).toBe('/app/food/lists/plan/plan-1');
    expect(getCanonicalAppRouteForLegacyJournalPath('/journal/plans/grocery/plan-1')).toBe(
      '/app/food/lists/plan/plan-1',
    );
  });

  it('keeps the existing explicit additive target-List reconciliation', () => {
    const planList = read('pages/journal/plans/grocery/[planId].tsx');
    expect(planList).toContain('planService.reconcilePlanGroceryList');
    expect(planList).toContain('target_list_id: target.id');
    expect(planList).toContain('Add pending needs to this list');
  });

  it('opens the selected persistent List through the canonical manager', () => {
    const planList = read('pages/journal/plans/grocery/[planId].tsx');
    expect(planList).toContain('APP_ROUTE_BUILDERS.foodGroceryList(sendResult.listId)');
  });
});
