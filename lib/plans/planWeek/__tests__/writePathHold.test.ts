import fs from 'fs';
import path from 'path';

describe('simplified plan week write-path holds', () => {
  it('fills open occasions through Packet 3 create/attach and does not generate a week', () => {
    const view = fs.readFileSync(
      path.join(process.cwd(), 'components/plans/planWeek/SimplifiedPlanWeekView.tsx'),
      'utf8',
    );
    expect(view).toContain('buildPlansHomeCreateMealHref');
    expect(view).toContain('proposePlanWeek');
    expect(view).toContain('buildPlanWeekDaysFromPlan');
    expect(view).not.toContain('meal_creation_wizard_result');
    expect(view).not.toContain('plan_week_wizard_result');
    expect(view).not.toContain('/api/journal/entries');
    expect(view).not.toContain('action=generate');
    expect(view).not.toContain('planService.generate');
    expect(view).not.toContain('/grocery/generate');
    expect(view).not.toContain('copyMeal');
    expect(view).toContain('It is not added to the plan');
    expect(view).toContain('PLAN_WEEK_RETURN_PATH');
  });

  it('does not attach create-meal without a plan id', () => {
    const createMeal = fs.readFileSync(
      path.join(process.cwd(), 'components/plans/createMeal/SimplifiedMealCreationView.tsx'),
      'utf8',
    );
    expect(createMeal).toContain("if (!planId) {");
    expect(createMeal).toContain('It is not added to a plan yet.');
    expect(createMeal).toContain('isSafeAppReturnPath');
  });

  it('does not introduce a week persistence model or schema/DDL', () => {
    const files = [
      'lib/plans/planWeek/policy.ts',
      'lib/plans/planWeek/events.ts',
      'components/plans/planWeek/SimplifiedPlanWeekView.tsx',
      'pages/app/plans/week.tsx',
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/create table/i);
      expect(source).not.toMatch(/alter table/i);
      expect(source).not.toMatch(/from\('plan_week/);
      expect(source).not.toContain('wizard-result');
    }
  });

  it('leaves grocery week/custom-range generation untouched', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'pages/api/journal/plans/[planId]/grocery/generate.ts'),
      'utf8',
    );
    expect(source).toContain('date_end?: string');
    expect(source).toContain('dateStart');
    expect(source).toContain('dateEnd');
  });

  it('consumes the existing forward-coverage policy instead of retuning thresholds', () => {
    const policy = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/planWeek/policy.ts'),
      'utf8',
    );
    expect(policy).toContain('PLANS_FORWARD_COVERAGE_POLICY');
    expect(policy).toContain('assessForwardCoverage');
    expect(policy).not.toContain('healthyMinCoveredDays: 4');
    expect(policy).not.toContain('horizonDays: 7');

    const destinations = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/decisioning/fromPlansHome.ts'),
      'utf8',
    );
    expect(destinations).toContain('planAhead: APP_ROUTES.plansWeek');
    expect(destinations).not.toContain("planAhead: `${APP_ROUTES.plansWeek}?action=generate`");
  });
});
