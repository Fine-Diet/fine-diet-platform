import fs from 'fs';
import path from 'path';

describe('plan repeat selected-open write-path holds', () => {
  it('reuses Packet 7 ensure and Packet 3 attach instead of copy/template/week writers', () => {
    const service = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/planRepeatServerService.ts'),
      'utf8',
    );
    expect(service).toContain('ensurePlanOccasionStructureForPerson');
    expect(service).toContain('attachCanonicalMealForPerson');
    expect(service).toContain('readSourceMealDocumentId');
    expect(service).toContain('resolveRepeatInsertRace');
    expect(service).toContain('deleteMealId === attached.meal.id');
    expect(service).not.toContain('copyPlannedMeal');
    expect(service).not.toContain('copyMeal');
    expect(service).not.toContain('instantiatePlanDayTemplate');
    expect(service).not.toContain('instantiatePlanWeekPattern');
    expect(service).not.toContain('ensurePlanHorizonThroughDate');
    expect(service).not.toContain('activateGeneratedPlan');
    expect(service).not.toContain('planService.generate');
    expect(service).not.toContain('insertPlannedMeal');
    expect(service).not.toContain('from(\'planned_meals\')');
  });

  it('keeps Packet 3 attach as the planned-meal writer and does not invent a document clone', () => {
    const attach = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/mealCreation/attachCanonicalMealForPerson.ts'),
      'utf8',
    );
    expect(attach).toContain('buildExistingMealAttachBody');
    expect(attach).toContain('findExistingCanonicalSlotAttach');
    expect(attach).toContain('insertPlannedMeal');
    expect(attach).not.toContain('ensurePlanOccasionStructureForPerson');
    expect(attach).not.toContain('insertCanonicalPlanDay');
    expect(attach).not.toContain('copyPlannedMeal');

    const meals = fs.readFileSync(
      path.join(process.cwd(), 'pages/api/journal/plans/meals/index.ts'),
      'utf8',
    );
    expect(meals).toContain('findExistingCanonicalSlotAttach');
    expect(meals).not.toContain('ensurePlanOccasionStructureForPerson');
    expect(meals).not.toContain('repeatSelectedOpenForPerson');
  });

  it('does not repeat on Plan Week page load and never uses copyMeal', () => {
    const week = fs.readFileSync(
      path.join(process.cwd(), 'components/plans/planWeek/SimplifiedPlanWeekView.tsx'),
      'utf8',
    );
    const fillAt = week.indexOf('async function fillSlot');
    const repeatAt = week.indexOf('async function commitRepeat');
    expect(fillAt).toBeGreaterThan(0);
    expect(repeatAt).toBeGreaterThan(0);
    expect(week.indexOf('planService.list()')).toBeLessThan(fillAt);
    expect(week.indexOf('planService.list()')).toBeLessThan(repeatAt);
    expect(week.indexOf('repeatSelectedOpenOccasions({')).toBeGreaterThan(repeatAt);
    expect(week).not.toContain('copyMeal');
    expect(week).not.toContain('planService.generate');
    expect(week).not.toContain('/grocery/generate');
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

  it('does not introduce schema/DDL or grocery/haul writers on the Packet 8 path', () => {
    const files = [
      'lib/plans/planRepeat/policy.ts',
      'lib/plans/planRepeat/events.ts',
      'lib/plans/planRepeat/save.ts',
      'lib/plans/planRepeatServerService.ts',
      'pages/api/journal/plans/meals/repeat.ts',
      'components/plans/planWeek/SimplifiedPlanWeekView.tsx',
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/create table/i);
      expect(source).not.toMatch(/alter table/i);
      expect(source).not.toContain('/grocery/generate');
      expect(source).not.toContain('haul-summary');
    }
  });
});
