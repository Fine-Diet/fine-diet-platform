import {
  buildPlannedMealLogHref,
  parsePlannedMealLogQuery,
  PLANNED_MEAL_LOG_MODE,
} from '../plannedMealLogRoute';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';

describe('buildPlannedMealLogHref', () => {
  it('includes required planned-meal context and safe redirect', () => {
    const href = buildPlannedMealLogHref({
      date: '2026-07-14',
      time: '08:30',
      mealSlot: 'breakfast',
      plannedMealId: '11111111-1111-1111-1111-111111111111',
      redirect: '/app/plans/day/2026-07-14',
    });
    expect(href).toContain('/app/log/new?');
    expect(href).toContain('date=2026-07-14');
    expect(href).toContain('time=08%3A30');
    expect(href).toContain('mealSlot=breakfast');
    expect(href).toContain('plannedMealId=11111111-1111-1111-1111-111111111111');
    expect(href).toContain(`mode=${PLANNED_MEAL_LOG_MODE}`);
    expect(href).toContain(
      `redirect=${encodeURIComponent('/app/plans/day/2026-07-14')}`,
    );
  });

  it('preserves plan day redirect with planId for round-trip navigation', () => {
    const redirect = APP_ROUTE_BUILDERS.planDayWithPlan('2026-07-14', 'plan-abc-123');
    const href = buildPlannedMealLogHref({
      date: '2026-07-14',
      time: '15:00',
      mealSlot: 'afternoon_snack',
      plannedMealId: '11111111-1111-1111-1111-111111111111',
      redirect,
    });
    expect(href).toContain(`redirect=${encodeURIComponent(redirect)}`);
    expect(redirect).toContain('planId=plan-abc-123');
  });

  it('rejects unsafe redirect targets', () => {
    const href = buildPlannedMealLogHref({
      date: '2026-07-14',
      plannedMealId: '11111111-1111-1111-1111-111111111111',
      redirect: 'https://evil.example/phish',
    });
    expect(href).toContain(`redirect=${encodeURIComponent('/app/log')}`);
    expect(href).not.toContain('evil.example');
  });
});

describe('parsePlannedMealLogQuery', () => {
  it('round-trips planned meal context from query params', () => {
    const parsed = parsePlannedMealLogQuery({
      date: '2026-07-14',
      time: '08:30',
      mealSlot: 'breakfast',
      plannedMealId: '11111111-1111-1111-1111-111111111111',
      mode: PLANNED_MEAL_LOG_MODE,
      redirect: '/app/plans/day/2026-07-14',
    });
    expect(parsed.date).toBe('2026-07-14');
    expect(parsed.time).toBe('08:30');
    expect(parsed.mealSlot).toBe('breakfast');
    expect(parsed.plannedMealId).toBe('11111111-1111-1111-1111-111111111111');
    expect(parsed.mode).toBe(PLANNED_MEAL_LOG_MODE);
    expect(parsed.redirect).toBe('/app/plans/day/2026-07-14');
  });
});
