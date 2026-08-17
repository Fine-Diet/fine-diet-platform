import fs from 'fs';
import path from 'path';

describe('plan structure ensure write-path holds', () => {
  it('creates only canonical day/slot structure and never attaches meals', () => {
    const service = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/planStructureServerService.ts'),
      'utf8',
    );
    expect(service).toContain('from(\'plan_days\')');
    expect(service).toContain('from(\'plan_slots\')');
    expect(service).toContain('insertCanonicalPlanDay');
    expect(service).toContain('insertCanonicalPlanSlot');
    expect(service).toContain('canonicalEnsureSlotOrdinal');
    expect(service).not.toContain('insertPlannedMeal');
    expect(service).not.toContain('from(\'planned_meals\')');
    expect(service).not.toContain('activateGeneratedPlan');
    expect(service).not.toContain('activatePlanForPerson');
    expect(service).not.toContain('persistAiPlan');
    expect(service).not.toContain('ensurePlanHorizonThroughDate');
    expect(service).not.toContain('instantiatePlanDayTemplate');
    expect(service).not.toContain('instantiatePlanWeekPattern');
    expect(service).not.toContain('planService.generate');
    expect(service).not.toContain('end_date');
  });

  it('keeps Packet 3 attach as the only planned-meal writer', () => {
    const write = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/mealCreation/write.ts'),
      'utf8',
    );
    expect(write).toContain('/api/journal/plans/meals');
    expect(write).not.toContain('/structure/ensure');
    expect(write).not.toContain('ensurePlanOccasionStructure');

    const meals = fs.readFileSync(
      path.join(process.cwd(), 'pages/api/journal/plans/meals/index.ts'),
      'utf8',
    );
    expect(meals).toContain('findExistingCanonicalSlotAttach');
    expect(meals).not.toContain('ensurePlanOccasionStructureForPerson');
    expect(meals).not.toContain('insertCanonicalPlanDay');
  });

  it('does not ensure structure on Plan Today or Plan Week page load', () => {
    const today = fs.readFileSync(
      path.join(process.cwd(), 'components/plans/planToday/SimplifiedPlanTodayView.tsx'),
      'utf8',
    );
    const week = fs.readFileSync(
      path.join(process.cwd(), 'components/plans/planWeek/SimplifiedPlanWeekView.tsx'),
      'utf8',
    );
    const todayFillAt = today.indexOf('async function fillSlot');
    const weekFillAt = week.indexOf('async function fillSlot');
    expect(today.indexOf('ensurePlanOccasionStructure({')).toBeGreaterThan(todayFillAt);
    expect(week.indexOf('ensurePlanOccasionStructure({')).toBeGreaterThan(weekFillAt);
    expect(today.indexOf('planService.list()')).toBeLessThan(todayFillAt);
    expect(week.indexOf('planService.list()')).toBeLessThan(weekFillAt);
  });

  it('leaves grocery week/custom-range generation and forward-coverage thresholds untouched', () => {
    const grocery = fs.readFileSync(
      path.join(process.cwd(), 'pages/api/journal/plans/[planId]/grocery/generate.ts'),
      'utf8',
    );
    expect(grocery).toContain('date_end?: string');
    expect(grocery).toContain('dateStart');
    expect(grocery).toContain('dateEnd');

    const coverage = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/decisioning/forwardCoveragePolicy.ts'),
      'utf8',
    );
    expect(coverage).toContain('horizonDays: 6');
    expect(coverage).toContain('healthyMinCoveredDays: 3');
  });
});
