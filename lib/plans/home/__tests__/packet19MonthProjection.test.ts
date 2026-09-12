import fs from 'fs';
import path from 'path';

import { APP_ROUTES, getCanonicalAppRouteForLegacyJournalPath } from '@/lib/routes/appRoutes';
import { APP_DRAWER_HUBS } from '@/lib/navigation/appDrawerNavigation';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 19 objectless Month projection', () => {
  it('owns the canonical route and safely maps the legacy Month path', () => {
    expect(APP_ROUTES.plansMonth).toBe('/app/plans/month');
    expect(read('pages/app/plans/month.tsx')).toContain('MonthCalendarProjectionPage');
    expect(read('pages/journal/plans/month.tsx')).toContain('MonthCalendarProjectionPage');
    expect(getCanonicalAppRouteForLegacyJournalPath('/journal/plans/month')).toBe(
      APP_ROUTES.plansMonth,
    );
  });

  it('loads dated projection data through GET-only navigation effects', () => {
    const page = read('components/journal/plans/MonthCalendarProjectionPage.tsx');
    const loader = read('lib/plans/monthProjectionLoad.ts');
    expect(page).toContain('fetchMonthProjectionData');
    expect(page).toContain('projectionRequestRef');
    expect(loader).toContain('services.list()');
    expect(loader).toContain('services.getDetail(planId)');
    expect(page).toContain('if (cancelled || requestToken !== projectionRequestRef.current) return');
    const loadEffectStart = page.indexOf('useEffect(() => {');
    const loadEffectEnd = page.indexOf('}, [loadMonthProjection, router.isReady]);');
    const loadEffect = page.slice(loadEffectStart, loadEffectEnd);
    expect(loadEffect).not.toMatch(
      /planService\.(save|create|update|delete|duplicate|instantiate|generate|archive)/,
    );
    expect(page).toContain('applyReusableDayPlan');
    expect(page).toContain('saveDatedDayPlan');
  });

  it('keeps opening and previous/current/next navigation free of planning writes', () => {
    const page = read('components/journal/plans/MonthCalendarProjectionPage.tsx');
    const navigationStart = page.indexOf('const navigateToMonth');
    const navigationEnd = page.indexOf('const dayPlanServices', navigationStart);
    const navigation = page.slice(navigationStart, navigationEnd);
    expect(navigation).toContain('router.push');
    expect(navigation).not.toContain('planService.');
  });

  it('does not introduce Month document, copy, library, API, or schema semantics', () => {
    const component = read('components/journal/plans/MonthCalendarProjection.tsx');
    const page = read('components/journal/plans/MonthCalendarProjectionPage.tsx');
    const combined = `${component}\n${page}`;
    expect(combined).not.toMatch(
      /Unnamed Month Plan|Month Plans Library|saveMonth|createMonth|duplicateMonth/,
    );
    expect(combined).toContain('Day Plan Library');
    expect(combined).not.toContain('Week Plans Library');
    expect(fs.existsSync(path.join(process.cwd(), 'pages/api/journal/plans/month'))).toBe(false);
  });

  it('links every Plans View selector and drawer destination to canonical Month', () => {
    const rail = read('components/plans/home/PlanningRouteRail.tsx');
    expect(read('pages/journal/plans/day/index.tsx')).toContain(
      'href={APP_ROUTES.plansMonth}',
    );
    expect(read('components/journal/plans/WeekPlanningWorkspace.tsx')).toContain(
      'href={APP_ROUTES.plansMonth}',
    );
    expect(read('components/journal/plans/MonthCalendarProjection.tsx')).toContain(
      'href={APP_ROUTES.plansMonth}',
    );
    expect(rail).toContain('href={APP_ROUTES.plansMonth}');
    expect(rail).not.toContain('Month planning is not available yet');
    const month = APP_DRAWER_HUBS
      .find((hub) => hub.id === 'plans')
      ?.items?.find((item) => item.id === 'plans-month');
    expect(month).toMatchObject({
      href: APP_ROUTES.plansMonth,
      status: 'current',
    });
    expect(month?.disabled).not.toBe(true);
  });

  it('uses canonical structural-slot projection helpers', () => {
    const projection = read('lib/plans/monthProjection.ts');
    expect(projection).toContain('canonicalMealsByStructuralSlot(dayMeals)');
    expect(projection).toContain('countPlannedStructuralSlots(canonicalMeals)');
    expect(projection).not.toContain('execution_state');
  });
});
