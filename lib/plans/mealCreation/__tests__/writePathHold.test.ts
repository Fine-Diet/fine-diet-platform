import fs from 'fs';
import path from 'path';

describe('simplified meal creation write-path holds', () => {
  it('creates MealDocuments and planned-meal pointers without log/execute writes', () => {
    const write = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/mealCreation/write.ts'),
      'utf8',
    );
    expect(write).toContain('/api/journal/meals/documents');
    expect(write).toContain('/api/journal/plans/meals');
    expect(write).toContain('planService.createMeal');
    expect(write).not.toContain('/log-instance');
    expect(write).not.toContain('/execute');
    expect(write).not.toMatch(/documents\/\$\{.*\}\/log/);
    expect(write).toContain('person_id: null');
    expect(write).toContain('resolveCanonicalSlotAttachAction');
    expect(write).toContain("decision.action === 'reuse'");
  });

  it('does not invent a wizard-result persistence model', () => {
    const view = fs.readFileSync(
      path.join(process.cwd(), 'components/plans/createMeal/SimplifiedMealCreationView.tsx'),
      'utf8',
    );
    expect(view).toContain("Share what you’re having");
    expect(view).not.toContain('meal_creation_wizard_result');
    expect(view).not.toContain('/api/journal/entries');
  });

  it('leaves grocery week/custom-range generation untouched', () => {
    const filePath = path.join(
      process.cwd(),
      'pages/api/journal/plans/[planId]/grocery/generate.ts',
    );
    const source = fs.readFileSync(filePath, 'utf8');
    expect(source).toContain('date_end?: string');
    expect(source).toContain('dateStart');
    expect(source).toContain('dateEnd');
  });

  it('reuses an existing planned-meal row on POST /api/journal/plans/meals', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'pages/api/journal/plans/meals/index.ts'),
      'utf8',
    );
    expect(source).toContain('findExistingCanonicalSlotAttach');
    expect(source).toContain('listMealsForDay');
    expect(source).toContain('reused: true');
    expect(source).not.toContain('/log-instance');
  });
});
