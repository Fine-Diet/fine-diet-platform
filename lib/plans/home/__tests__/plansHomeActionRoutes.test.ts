import {
  buildPlansHomeCreateMealHref,
  buildPlansHomeEmptyLogHref,
  buildPlansHomeLogHref,
  buildPlansHomeUpdateHref,
} from '../plansHomeActionRoutes';
import { buildPlannedMealLogHref } from '@/lib/plans/plannedMealLogRoute';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import type { PlansMealGuidanceRow } from '../types';

const row: Pick<
  PlansMealGuidanceRow,
  'mealId' | 'slotKey' | 'targetTimeValue' | 'state'
> = {
  mealId: 'meal-abc',
  slotKey: 'breakfast',
  targetTimeValue: '11:00',
  state: 'pending',
};

describe('plansHomeActionRoutes', () => {
  it('routes non-empty Log through buildPlannedMealLogHref (mode=planned)', () => {
    const href = buildPlansHomeLogHref({
      row,
      selectedDate: '2026-07-28',
    });
    const expected = buildPlannedMealLogHref({
      date: '2026-07-28',
      time: '11:00',
      mealSlot: 'breakfast',
      plannedMealId: 'meal-abc',
      redirect: APP_ROUTES.plans,
    });
    expect(href).toBe(expected);
    expect(href).toContain('/app/log/new');
    expect(href).toContain('plannedMealId=meal-abc');
    expect(href).toContain('mode=planned');
    expect(href).not.toContain('editMeal=');
  });

  it('routes Update to plan day editMeal (not planned log)', () => {
    const href = buildPlansHomeUpdateHref({
      row,
      selectedDate: '2026-07-28',
      planId: 'plan-1',
    });
    const dayHref = APP_ROUTE_BUILDERS.planDayWithPlan('2026-07-28', 'plan-1');
    expect(href).toBe(`${dayHref}&editMeal=meal-abc`);
    expect(href).toContain('editMeal=meal-abc');
    expect(href).not.toContain('plannedMealId=');
    expect(href).not.toContain('mode=planned');
  });

  it('diverges Log and Update for the same non-empty row', () => {
    const logHref = buildPlansHomeLogHref({
      row,
      selectedDate: '2026-07-28',
    });
    const updateHref = buildPlansHomeUpdateHref({
      row,
      selectedDate: '2026-07-28',
      planId: 'plan-1',
    });
    expect(logHref).not.toBe(updateHref);
    expect(logHref).toContain('/app/log/new');
    expect(updateHref).toContain('editMeal=');
  });

  it('routes empty Log to normal log-new without plannedMealId', () => {
    const href = buildPlansHomeEmptyLogHref({
      row: { slotKey: 'lunch', targetTimeValue: '14:00' },
      selectedDate: '2026-07-28',
    });
    expect(href.startsWith(APP_ROUTES.logNew)).toBe(true);
    expect(href).toContain('mealSlot=lunch');
    expect(href).not.toContain('plannedMealId=');
    expect(href).not.toContain('mode=planned');
  });

  it('returns null Log href when mealId is missing', () => {
    expect(
      buildPlansHomeLogHref({
        row: { ...row, mealId: null },
        selectedDate: '2026-07-28',
      }),
    ).toBeNull();
  });

  it('routes empty Plan to simplified meal creation with date, slot, and planId', () => {
    const href = buildPlansHomeCreateMealHref({
      date: '2026-07-28',
      slot: 'breakfast',
      planId: 'plan-1',
    });
    expect(href).toContain('/app/plans/create-meal');
    expect(href).toContain('date=2026-07-28');
    expect(href).toContain('slot=breakfast');
    expect(href).toContain('planId=plan-1');
    expect(href).not.toContain('createSlot=');
  });
});
