import fs from 'fs';
import path from 'path';

describe('simplified plan today write-path holds', () => {
  it('does not create a new planning model or week/grocery writes', () => {
    const view = fs.readFileSync(
      path.join(process.cwd(), 'components/plans/planToday/SimplifiedPlanTodayView.tsx'),
      'utf8',
    );
    expect(view).toContain('buildPlansHomeCreateMealHref');
    expect(view).toContain('buildPlansHomeGuidance');
    expect(view).not.toContain('meal_creation_wizard_result');
    expect(view).not.toContain('plan_today_wizard_result');
    expect(view).not.toContain('/api/journal/entries');
    expect(view).not.toContain('action=generate');
    expect(view).not.toContain('/grocery/generate');
    expect(view).toContain('It is not added to today’s plan');
    expect(view).toContain('Save ${nextOccasion.label} to library');
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

  it('leaves grocery week/custom-range generation untouched', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'pages/api/journal/plans/[planId]/grocery/generate.ts'),
      'utf8',
    );
    expect(source).toContain('date_end?: string');
    expect(source).toContain('dateStart');
    expect(source).toContain('dateEnd');
  });
});
