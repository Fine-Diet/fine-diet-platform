import fs from 'fs';
import path from 'path';

import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 17 canonical Manage Day routing', () => {
  it('keeps dated Day addressing canonical and makes Today compatibility-only', () => {
    expect(APP_ROUTE_BUILDERS.planDay('2026-09-10')).toBe('/app/plans/day/2026-09-10');

    const today = read('pages/app/plans/today.tsx');
    expect(today).toContain('router.replace(APP_ROUTE_BUILDERS.planDay(todayLocalDateKey()))');
    expect(today).not.toContain('SimplifiedPlanTodayView');
  });

  it('uses one reusable Manage rail with a selected Day state', () => {
    const rail = read('components/plans/home/PlanningRouteRail.tsx');
    const day = read('pages/journal/plans/day/[date].tsx');

    expect(rail).toContain("export type PlanningRouteSelection = 'day' | 'week' | 'month'");
    expect(rail).toContain('href={APP_ROUTE_BUILDERS.planDay(dayDate)}');
    expect(rail).toContain("aria-current={selected === 'day' ? 'page' : undefined}");
    expect(day).toContain('<PlanningRouteRail');
    expect(day).toContain('selected="day"');
  });

  it('resolves bare dated routes by Plan coverage, not PlanDay row existence', () => {
    const day = read('pages/journal/plans/day/[date].tsx');
    const navigateStart = day.indexOf('const navigateToDate');
    const navigateEnd = day.indexOf('const planTitle', navigateStart);
    const navigation = day.slice(navigateStart, navigateEnd);
    const resolveStart = day.indexOf('A bare dated route');
    const resolveEnd = day.indexOf('const refresh = useCallback');
    const resolution = day.slice(resolveStart, resolveEnd);

    expect(day).toContain('selectCurrentPlan(await planService.list())');
    expect(day).toContain('resolveRequestedPlanDateState(');
    expect(day).toContain('dateState.kind === \'out_of_range\'');
    expect(resolution).not.toContain('detail.days.some(');
    expect(day).toContain('APP_ROUTE_BUILDERS.planDayWithPlan(date, current.id)');
    expect(day).toContain('showHeading={false}');
    expect(day).toContain('<PlanMealComposerPanel');
    expect(day).toContain('density="comfortable"');
    expect(navigation).toContain('router.push(href)');
    expect(navigation).not.toMatch(/generate|extend|createDay|updateDay|ensurePlanOccasionStructure/);
  });
});
