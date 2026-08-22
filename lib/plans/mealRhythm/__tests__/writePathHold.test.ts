import fs from 'fs';
import path from 'path';

describe('meal rhythm write-path holds', () => {
  it('saves through caller-scoped Profile meal_schedule, not a new table', () => {
    const profileApi = fs.readFileSync(
      path.join(process.cwd(), 'pages/api/journal/profile.ts'),
      'utf8',
    );
    expect(profileApi).toContain('requireCallerJournalAccess');
    expect(profileApi).toContain("const { personId } = ctx");
    expect(profileApi).toContain(".eq('id', personId)");
    expect(profileApi).toContain("'meal_schedule'");
    expect(profileApi).not.toMatch(/body\.person_id/);

    const saveHelper = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/mealRhythm/save.ts'),
      'utf8',
    );
    expect(saveHelper).toContain('/api/journal/profile');
    expect(saveHelper).toContain('meal_schedule');
    expect(saveHelper).not.toContain('person_id');
  });

  it('does not emit meal_rhythm_edited from merely entering edit mode', () => {
    const controller = fs.readFileSync(
      path.join(process.cwd(), 'components/plans/rhythm/useMealRhythmController.ts'),
      'utf8',
    );
    expect(controller).toContain('classifyMealRhythmSaveEvent');
    expect(controller).toContain("event: 'meal_rhythm_edit_started'");
    expect(controller).not.toMatch(/persist\(editing/);
    expect(controller).not.toMatch(/didEdit \? 'meal_rhythm_edited'/);
  });

  it('keeps weekend note out of the primary prototype flow', () => {
    const view = fs.readFileSync(
      path.join(process.cwd(), 'components/plans/rhythm/MealRhythmView.tsx'),
      'utf8',
    );
    const summary = fs.readFileSync(
      path.join(process.cwd(), 'components/plans/rhythm/MealRhythmSummary.tsx'),
      'utf8',
    );
    expect(view).not.toContain('A separate weekend rhythm is not being saved yet');
    expect(summary).not.toContain('A separate weekend rhythm is not being saved yet');
    expect(summary).toContain('Here is your assumed rhythm');
    expect(summary).toContain('Looks Good');
  });
});
