import fs from 'fs';
import path from 'path';

import { getSevenCalendarDates } from '@/components/journal/plans/WeekPlanningWorkspace';
import { resolveSelectedCalendarWeek } from '@/components/journal/plans/WeekPlanningWorkspacePage';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 18 calendar-aware Week workspace', () => {
  it('normalizes every selected date to one seven-day calendar week', () => {
    const range = resolveSelectedCalendarWeek('2026-09-11');
    expect(range).toEqual({ start: '2026-09-06', end: '2026-09-12' });
    expect(getSevenCalendarDates(range)).toEqual([
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ]);
  });

  it('makes the converged workspace the canonical /app/plans/week surface', () => {
    const route = read('pages/app/plans/week.tsx');
    expect(route).toContain('WeekPlanningWorkspacePage');
    expect(route).not.toContain('SimplifiedPlanWeekView');
  });

  it('loads Week without requiring an active dated plan', () => {
    const page = read('components/journal/plans/WeekPlanningWorkspacePage.tsx');
    const workspace = read('components/journal/plans/WeekPlanningWorkspace.tsx');
    expect(page).toContain('if (targetPlanIds.length === 0)');
    expect(page).toContain("setLoadState('ready')");
    expect(workspace).toContain('getSevenCalendarDates');
    expect(workspace).not.toContain('Create your first weekly plan');
  });

  it('keeps week navigation read-only and removes arbitrary range/generate gating', () => {
    const page = read('components/journal/plans/WeekPlanningWorkspacePage.tsx');
    const workspace = read('components/journal/plans/WeekPlanningWorkspace.tsx');
    const navigateStart = page.indexOf('const navigateToRange');
    const navigateEnd = page.indexOf('const selectedPlanDays');
    const navigation = page.slice(navigateStart, navigateEnd);
    expect(navigation).toContain('router.push');
    expect(navigation).not.toContain('planService.');
    expect(workspace).not.toContain('type="date"\n              value={props.selectedRange.start}');
    expect(workspace).not.toContain('Generate');
    expect(workspace).not.toContain('Pantry Readiness');
  });

  it('uses one contextual modal and applies a bound Day only from an explicit action', () => {
    const workspace = read('components/journal/plans/WeekPlanningWorkspace.tsx');
    const embeddedDay = read('components/journal/plans/EmbeddedDayPlanner.tsx');
    const page = read('components/journal/plans/WeekPlanningWorkspacePage.tsx');
    const dayActions = read('lib/plans/dayPlanActions.ts');
    expect(workspace).toContain('Week Plans Library');
    expect(workspace).toContain('Create or Edit');
    expect(workspace).toContain("activeTab: 'create-edit', boundDate: dateLocal");
    expect(embeddedDay).toContain('<TemplateDayEditor');
    expect(embeddedDay).toContain('onApplyReusable(draft.id, dateLocal)');
    expect(page).toContain('applyReusableDayPlan');
    expect(dayActions).toContain('target_date_local: dateLocal');
    expect(dayActions).toContain('allow_duplicate_append: true');
    expect(dayActions).toContain('confirmAppend');
  });

  it('saves one isolated Week Plan snapshot with canonical naming', () => {
    const page = read('components/journal/plans/WeekPlanningWorkspacePage.tsx');
    expect(page).toContain('async function saveCurrentWeek');
    expect(page).toContain('selectedPlanDays.length !== 7');
    expect(page).toContain('planService.savePlanWeekPattern({');
    expect(page).toContain('name: name.trim() || defaultWeekPlanName(selectedRange.start)');
    expect(page).not.toContain('Save week pattern failed');
  });

  it('searches, copies, and applies reusable Week Plans through distinct actions', () => {
    const workspace = read('components/journal/plans/WeekPlanningWorkspace.tsx');
    const page = read('components/journal/plans/WeekPlanningWorkspacePage.tsx');
    expect(workspace).toContain('Search Week Plans');
    expect(workspace).toContain('Make a copy');
    expect(workspace).toContain('Choose new week');
    expect(workspace).toContain('Apply to week');
    expect(page).toContain('planService.duplicatePlanWeekPattern');
    expect(page).toContain('target_start_date_local: targetRange.start');
    expect(workspace.indexOf('setApplyOpen(true)')).toBeGreaterThan(-1);
    expect(page.indexOf('instantiatePlanWeekPattern')).toBeGreaterThan(
      page.indexOf('async function applyWeekPlan'),
    );
  });

  it('resolves/creates the dated Week target only inside confirmed application', () => {
    const endpoint = read(
      'pages/api/journal/plans/templates/week-patterns/[patternId]/instantiate.ts',
    );
    expect(endpoint).toContain('target_start_date_local');
    expect(endpoint).toContain('getPlanWeekPattern(personId, patternId)');
    expect(endpoint).toContain('resolvePlansHomeTargetForPerson');
    expect(endpoint).toContain('instantiatePlanWeekPattern');
    expect(endpoint.indexOf('getPlanWeekPattern(personId, patternId)')).toBeLessThan(
      endpoint.indexOf('resolvePlansHomeTargetForPerson({'),
    );
    expect(endpoint.indexOf('resolvePlansHomeTargetForPerson({')).toBeLessThan(
      endpoint.indexOf('instantiatePlanWeekPattern({'),
    );
  });

  it('keeps Day 17D and dated Day routes intact', () => {
    expect(read('pages/app/plans/day/index.tsx')).toContain(
      "export { default } from '../../../journal/plans/day'",
    );
    expect(read('pages/app/plans/day/[date].tsx')).toContain(
      "export { default } from '../../../journal/plans/day/[date]'",
    );
  });
});
