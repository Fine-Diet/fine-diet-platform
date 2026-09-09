import fs from 'fs';
import path from 'path';

import { APP_DRAWER_HUBS } from '@/lib/navigation/appDrawerNavigation';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 13F compact Home authoring and Plans IA', () => {
  it('keeps Home on the shared editor while selecting compact presentation only', () => {
    const home = read('components/plans/home/MealGuidanceModule.tsx');
    const day = read('pages/journal/plans/day/[date].tsx');

    expect(home).toContain('<PlanMealComposerPanel');
    expect(home).toContain('density="compact"');
    expect(day).toContain('<PlanMealComposerPanel');
    expect(day).toContain('density="comfortable"');
  });

  it('makes heavy capture chrome conditional and keeps dirty-only actions', () => {
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');

    expect(capture).toContain("className={compact ? 'sr-only'");
    expect(capture).toContain('const showSearchFilters =');
    expect(capture).toContain('{!compact && <div');
    expect(capture).toContain('components.length === 0 ?');
    expect(capture).toContain('!compact && (');
    expect(capture).toContain('components.length > 0 && compact');
    expect(capture).toContain('>Total</span>');
    expect(capture).toContain("NDS: {nds == null ? '—' : Math.round(nds)}");
    expect(capture).toContain('{dirty && (');
  });

  it('uses editable Qty and Unit rows with persisted overflow confirmation', () => {
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');

    expect(capture).toContain("const persisted = initialComponentIds.current.has");
    expect(capture).toContain("'Meal'");
    expect(capture).toContain("'Single Item'");
    expect(capture).toContain('const visibleComponents = compact && savedMealRootId');
    expect(capture).toContain('state.document.title');
    expect(capture).toContain('Qty');
    expect(capture).toContain('Unit');
    expect(capture).toContain('Remove from {occasionLabel}');
    expect(capture).toContain('pendingRemovalId');
    expect(capture).toContain('Cancel');
  });

  it('locks Home / Manage / Library without a live Month route', () => {
    const plans = APP_DRAWER_HUBS.find((hub) => hub.id === 'plans');
    const items = plans?.items ?? [];

    expect(items[0]).toMatchObject({ id: 'plans-home', label: 'Home' });
    expect(items.filter((item) => item.group === 'manage').map((item) => item.label))
      .toEqual(['Day', 'Week', 'Month']);
    expect(items.find((item) => item.id === 'plans-month')).toMatchObject({
      disabled: true,
      href: '/app/plans',
    });
    expect(items.filter((item) => item.group === 'library').map((item) => item.label))
      .toEqual(['Meals', 'Day Plans', 'Week Plans']);
    expect(fs.existsSync(path.join(process.cwd(), 'pages/app/plans/month.tsx'))).toBe(false);
  });
});
