import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 17 Correction A in-range unmaterialized Day', () => {
  it('does not treat missing PlanDay rows as out-of-range membership', () => {
    const helper = read('lib/plans/resolveRequestedPlanDateState.ts');
    const day = read('pages/journal/plans/day/[date].tsx');

    expect(helper).toContain("kind: materialized ? 'in_range_materialized' : 'in_range_unmaterialized'");
    expect(helper).toContain('resolvePlanDateCoverage({');
    expect(helper).toContain('days: []');
    expect(day).toContain('resolveRequestedPlanDateState(');
    expect(day).toContain("dateState.kind === 'in_range_unmaterialized'");
    expect(day).not.toContain('detail.days.some((planDay) => planDay.date_local === date)');
  });

  it('keeps navigation resolution zero-write and ensures structure only on explicit Save', () => {
    const day = read('pages/journal/plans/day/[date].tsx');
    const resolveStart = day.indexOf('A bare dated route');
    const resolveEnd = day.indexOf('const refresh = useCallback');
    const resolution = day.slice(resolveStart, resolveEnd);
    const navigateStart = day.indexOf('const navigateToDate');
    const navigateEnd = day.indexOf('const planTitle', navigateStart);
    const navigation = day.slice(navigateStart, navigateEnd);

    expect(resolution).not.toContain('ensurePlanOccasionStructure');
    expect(navigation).not.toContain('ensurePlanOccasionStructure');
    expect(day).toContain('resolveTarget={() => handleEnsureOccasionTarget(slot.id)}');
    expect(day.indexOf('ensurePlanOccasionStructure({')).toBeGreaterThan(
      day.indexOf('const handleEnsureOccasionTarget'),
    );
  });

  it('renders one coherent invalid state instead of stacked Day-not-found plus out-of-range', () => {
    const day = read('pages/journal/plans/day/[date].tsx');

    expect(day).toContain('OUT_OF_RANGE_PLAN_DATE_MESSAGE');
    expect(day).toContain('NO_ACTIVE_PLAN_DATE_MESSAGE');
    expect(day).toContain('{error ?? (');
    expect(day).toContain('{showValidDay && error && (');
    expect(day).toContain('Day not found. Open a plan from the');
  });
});
