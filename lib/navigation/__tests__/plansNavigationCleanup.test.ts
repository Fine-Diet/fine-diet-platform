import fs from 'fs';
import path from 'path';

import { APP_DRAWER_HUBS } from '@/lib/navigation/appDrawerNavigation';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Plans navigation cleanup', () => {
  const plans = APP_DRAWER_HUBS.find((hub) => hub.id === 'plans');

  it('uses a flat five-item Plans submenu and one Library route', () => {
    expect(plans?.items?.map((item) => ({
      label: item.label,
      href: item.href,
      group: item.group ?? null,
    }))).toEqual([
      { label: 'Overview', href: APP_ROUTES.plans, group: null },
      { label: 'Day', href: APP_ROUTES.plansDay, group: null },
      { label: 'Week', href: APP_ROUTES.plansWeek, group: null },
      { label: 'Month', href: APP_ROUTES.plansMonth, group: null },
      { label: 'Library', href: APP_ROUTES.plansLibrary, group: null },
    ]);
    expect(plans?.items?.find((item) => item.id === 'plans-overview')?.match).toBe('exact');
    expect(plans?.items?.some((item) => item.href === APP_ROUTES.foodMeals)).toBe(false);
  });

  it('keeps Recipes on the Food submenu', () => {
    const food = APP_DRAWER_HUBS.find((hub) => hub.id === 'food');
    expect(food?.items?.find((item) => item.id === 'food-meals')).toMatchObject({
      label: 'Recipes',
      href: APP_ROUTES.foodMeals,
    });
  });

  it('presents one Plans Library with Meals, Day Plans, and Week Plans', () => {
    const library = read('components/plans/library/PlansLibraryView.tsx');
    expect(library).toContain('currentView="library"');
    expect(library).toContain('Plans Library');
    expect(library).toContain('title="Meals"');
    expect(library).toContain('title="Day Plans"');
    expect(library).toContain('title="Week Plans"');
    expect(library).toContain('mode=meals');
    expect(library).toContain("row.document_kind !== 'recipe'");
    expect(library).not.toContain('mode=recipes');
    expect(read('pages/app/plans/library/index.tsx')).toContain('PlansLibraryView');
  });

  it('puts the same eyebrow on Overview, Day, Week, Month, and the dated Day surface', () => {
    expect(read('components/plans/home/MealGuidanceModule.tsx')).toContain(
      'currentView="overview"',
    );
    expect(read('pages/journal/plans/day/index.tsx')).toContain('currentView="day"');
    expect(read('pages/journal/plans/day/[date].tsx')).toContain('currentView="day"');
    expect(read('pages/journal/plans/day/[date].tsx')).not.toContain('› Manage');
    expect(read('components/journal/plans/WeekPlanningWorkspace.tsx')).toContain(
      'currentView="week"',
    );
    expect(read('components/journal/plans/MonthCalendarProjection.tsx')).toContain(
      'currentView="month"',
    );
  });
});
