import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Week and Month shared Plans view header', () => {
  const week = read('components/journal/plans/WeekPlanningWorkspace.tsx');
  const month = read('components/journal/plans/MonthCalendarProjection.tsx');

  it('renders PlansViewSwitcher on Week and Month', () => {
    expect(week).toContain('<PlansViewSwitcher currentView="week" />');
    expect(month).toContain('<PlansViewSwitcher currentView="month" />');
  });

  it('removes the old caret dropdown eyebrow from Week and Month', () => {
    expect(week).not.toContain('viewOpen');
    expect(week).not.toContain('Week <span aria-hidden>⌄</span>');
    expect(week).not.toContain('aria-haspopup="menu"');
    expect(month).not.toContain('viewOpen');
    expect(month).not.toContain('Month <span aria-hidden>⌄</span>');
    expect(month).not.toContain('aria-haspopup="menu"');
  });

  it('styles the Week Plan name like Day metadata', () => {
    expect(week).toContain('aria-label="Week Plan name"');
    expect(week).toContain(
      'min-w-0 flex-1 border-0 bg-transparent px-2 py-2 text-base font-regular outline-none placeholder:text-white/30 focus:bg-white/[0.04] sm:min-w-48',
    );
    expect(week).not.toContain('font-semibold outline-none focus:bg-white/[0.04] sm:basis-auto');
  });

  it('uses borderless Day-style Open and New actions on Week metadata row', () => {
    expect(week).toContain('FILE_ACTION_CLASSNAME');
    expect(week).toContain(
      "font-semibold px-2 py-2 text-xs hover:underline decoration-2 underline-offset-[5px] sm:px-3",
    );
    const openIndex = week.indexOf('className={FILE_ACTION_CLASSNAME}');
    const makeCopyIndex = week.indexOf('Make a copy');
    expect(openIndex).toBeGreaterThan(-1);
    expect(makeCopyIndex).toBeGreaterThan(openIndex);
    expect(week.indexOf('className={SMALL_BUTTON}>Make a copy')).toBeGreaterThan(-1);
  });

  it('styles the Week description like Day metadata', () => {
    expect(week).toContain('aria-label="Week Plan description"');
    expect(week).toContain('h-[38px]');
    expect(week).toContain('overflow-y-auto');
    expect(week).toContain('scrollbar-hide');
    expect(week).toContain('resize-none');
    expect(week).not.toContain('h-[30px]');
  });

  it('uses tighter Week metadata section spacing', () => {
    expect(week).toContain('className="pt-3 pb-1"');
  });
});
