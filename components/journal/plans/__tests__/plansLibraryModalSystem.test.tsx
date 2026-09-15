import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Plans library modal system', () => {
  it('uses the shared modal shell and library browser on Day Open without Create Or Edit', () => {
    const day = read('pages/journal/plans/day/index.tsx');
    expect(day).toContain('PlanContextModal');
    expect(day).toContain('PlanLibraryBrowser');
    expect(day).not.toContain('aria-labelledby="day-plan-library-title" className="fixed inset-0 z-50 grid place-items-center');
    expect(day).not.toContain('createEditTabLabel');
    expect(day).toContain('libraryTabLabel="Day Plans Library"');
  });

  it('uses the shared library browser in Week and Month contexts with both tabs', () => {
    const week = read('components/journal/plans/WeekPlanningWorkspace.tsx');
    const month = read('components/journal/plans/MonthCalendarProjection.tsx');
    expect(week).toContain('PlanLibraryBrowser');
    expect(month).toContain('PlanLibraryBrowser');
    expect(week).toContain('createEditTabLabel="Create Or Edit"');
    expect(month).toContain('createEditTabLabel="Create Or Edit"');
  });

  it('keeps modal accessibility behaviors in the shared shell', () => {
    const modal = read('components/journal/plans/PlanContextModal.tsx');
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain("event.key === 'Escape'");
    expect(modal).toContain('returnFocusRef');
    expect(modal).toContain('role="tabpanel"');
    expect(modal).toContain('hidden={');
  });

  it('anchors the overlay to the signed-in main pane and stacks above footer nav', () => {
    const modal = read('components/journal/plans/PlanContextModal.tsx');
    expect(modal).toContain('SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS');
    expect(modal).toContain('z-[80]');
    expect(modal).toContain('left-0');
    expect(modal).not.toContain('inset-0');
  });

  it('exposes description authoring controls in Day and Week file metadata headers', () => {
    const day = read('pages/journal/plans/day/index.tsx');
    const week = read('components/journal/plans/WeekPlanningWorkspace.tsx');
    expect(day).toContain('aria-label="Day Plan description"');
    expect(week).toContain('aria-label="Week Plan description"');
  });
});
