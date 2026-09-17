import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Plans Home overview layout', () => {
  const module = read('components/plans/home/MealGuidanceModule.tsx');
  const rail = read('components/plans/home/PlanningRouteRail.tsx');

  it('renders Plans and Overview in a nowrap horizontal-scroll breadcrumb', () => {
    expect(module).toContain('>Plans</span>');
    expect(module).toContain('>Overview</span>');
    expect(module).toContain('data-plans-breadcrumb');
    expect(module).toContain('whitespace-nowrap');
    expect(module).toContain('overflow-x-auto');
    expect(module).toContain('[scrollbar-width:none]');
    expect(module).toContain('[&::-webkit-scrollbar]:hidden');
  });

  it('uses the summary headline and places month label above tabs', () => {
    expect(module).toContain('Your summary by week');
    expect(module).not.toContain('Your week overview');
    const headlineIndex = module.indexOf('Your summary by week');
    const monthIndex = module.indexOf('{monthLabel(model.selectedDate)}');
    const tabsIndex = module.indexOf('data-plans-week-tabs');
    expect(monthIndex).toBeGreaterThan(headlineIndex);
    expect(tabsIndex).toBeGreaterThan(monthIndex);
  });

  it('books week chevrons around the scrolling tab strip', () => {
    expect(module).toContain('data-plans-week-tabs');
    expect(module).toContain('aria-label="Previous week"');
    expect(module).toContain('aria-label="Next week"');
    const tabsBlockStart = module.indexOf('data-plans-week-tabs');
    const tabsBlockEnd = module.indexOf('</div>', module.indexOf('aria-label="Next week"'));
    const tabsBlock = module.slice(tabsBlockStart, tabsBlockEnd);
    expect(tabsBlock.indexOf('Previous week')).toBeLessThan(tabsBlock.indexOf('role="tablist"'));
    expect(tabsBlock.indexOf('role="tablist"')).toBeLessThan(tabsBlock.indexOf('Next week'));
    expect(module).not.toMatch(/flex flex-1 items-center justify-between[\s\S]{0,200}Previous week/);
  });

  it('styles inactive tabs with a top/side outline and no bottom border', () => {
    expect(module).toContain('border-x border-t border-b-0 border-white/15');
  });

  it('renders one text-base time line with lowercase am/pm and a text-xl meal label', () => {
    expect(module).toContain('{row.targetTimeLabel} {periodLabelFromTimeValue(row.targetTimeValue)}');
    expect(module).toContain('text-base text-white/50');
    expect(module).toContain('<p className="text-xl text-white">{row.label}</p>');
    expect(module).toContain("return Number.isFinite(hour) && hour >= 12 ? 'pm' : 'am'");
    expect(module).not.toMatch(
      /\{row\.targetTimeLabel\}[\s\S]{0,200}text-xs/,
    );
  });

  it('keeps collapsed time and meal label visible in the row header', () => {
    const rowHeaderStart = module.indexOf('MealStateMarker planned={Boolean(row.mealId)}');
    const rowHeader = module.slice(rowHeaderStart, rowHeaderStart + 500);
    expect(rowHeader).toContain('{row.targetTimeLabel}');
    expect(rowHeader).toContain('{row.label}');
    expect(module).toContain('aria-expanded={active}');
  });

  it('renders summary metrics after the meal list with updated labels', () => {
    const listIndex = module.indexOf('<ul className="my-1 -mx-1" role="list">');
    const summaryIndex = module.indexOf('data-plans-summary');
    expect(summaryIndex).toBeGreaterThan(listIndex);
    expect(module).toContain('Planned meals {model.plannedCount} of {model.totalCount}');
    expect(module).toContain("NDS: {model.projectedNds == null ? '—'");
    expect(module).toContain('kCal:');
    expect(module).toContain('border-t border-white/15');
  });

  it('rebuilds the planning rail with a 950px center region and fixed Manage block', () => {
    expect(rail).toContain('min(100%,950px)');
    expect(rail).toContain('max-w-[950px]');
    expect(rail).toContain('bg-brand-800');
    expect(rail).toContain('<span className={manageCellClass}>Manage</span>');
    expect(rail).not.toContain('grid-cols-4');
    expect(rail).toContain('href={APP_ROUTES.plansDay}');
    expect(rail).toContain('href={APP_ROUTES.plansWeek}');
    expect(rail).toContain('href={APP_ROUTES.plansMonth}');
    expect(rail).toContain("aria-current={selected === 'day' ? 'page' : undefined}");
  });

  it('keeps Manage outside the scrolling route strip on mobile', () => {
    const manageIndex = rail.indexOf('manageCellClass}>Manage</span>');
    const stripIndex = rail.indexOf('data-plans-route-strip');
    expect(manageIndex).toBeGreaterThan(-1);
    expect(stripIndex).toBeGreaterThan(manageIndex);
    expect(rail).toContain('data-plans-route-strip');
    expect(rail).toContain('[scrollbar-width:none]');
    expect(rail).toContain('flex w-max min-w-full flex-nowrap items-stretch sm:w-full');
  });
});
