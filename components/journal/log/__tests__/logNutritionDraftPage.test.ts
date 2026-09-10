import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    'components/journal/log/LogNutritionDraftPage.tsx',
  ),
  'utf8',
);

describe('Packet 14 Log Nutrition Draft page boundary', () => {
  it('does not use single-entry create/update/delete writes while building the draft', () => {
    expect(source).not.toContain('journalService.createEntry');
    expect(source).not.toContain('journalService.updateEntry');
    expect(source).not.toContain('journalService.deleteEntry');
    expect(source).toContain('journalService.commitNutritionDraft');
  });

  it('routes food, Meal, scan, and Quick Add selection through draft-only helpers', () => {
    expect(source).toContain('singleItemDraftEntryFromFoodResult');
    expect(source).toContain('mealDraftEntryFromSearchResult');
    expect(source).toContain('singleItemDraftEntryFromFood(result.food)');
    expect(source).toContain('Add to Draft');
  });

  it('uses one responsive state tree and compensates for the fixed footer', () => {
    expect(source).toContain("const visibleEntries = loggedPresentation ?? draft?.entries ?? []");
    expect(source).toContain('pb-44');
    expect(source).toContain('fixed inset-x-0 bottom-0');
    expect(source).toContain('SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS');
    expect(source).toContain("loggedPresentation ? 'Logged'");
  });

  it('resolves Quick Log before staging and dedupes through the planned source key', () => {
    expect(source).toContain('resolvedPlannedContext');
    expect(source).toContain("candidate.execution_state === 'pending'");
    expect(source).toContain('sourceKey: `planned:${meal.id}`');
    expect(source).toContain('addLogNutritionDraftEntry(current, entry)');
  });

  it('renders ordinary planned context without staging it', () => {
    expect(source).toContain('<PlannedMealContextCard');
    expect(source).toContain('contextOnly');
    expect(source).toContain('onResolved={handlePlannedResolved}');
    expect(source).toContain('if (');
    expect(source).toContain('!quickLogMode ||');
  });

  it('keeps Save as Meal separate from Log commit', () => {
    const saveStart = source.indexOf('const saveAsMeal = async');
    const scanStart = source.indexOf('const handleScan = async');
    const saveBody = source.slice(saveStart, scanStart);
    expect(saveBody).toContain('/api/journal/meals/documents');
    expect(saveBody).not.toContain('commitNutritionDraft');
    expect(saveBody).not.toContain('/api/journal/entries');
  });
});
