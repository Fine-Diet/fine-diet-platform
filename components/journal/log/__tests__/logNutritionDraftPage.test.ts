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
    expect(source).toContain('const visibleEntries = draft?.entries ?? []');
    expect(source).toContain('committedEntries.map((entry)');
    expect(source).toContain('pb-44');
    expect(source).toContain('fixed inset-x-0 bottom-0');
    expect(source).toContain('SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS');
    expect(source).toContain("? 'Logged'");
  });

  it('resolves Quick Log before staging and dedupes through the planned source key', () => {
    expect(source).toContain('resolvedPlannedContext');
    expect(source).toContain('exactPendingPlannedMealDraftEntry(');
    expect(source).toContain('addLogNutritionDraftEntry(current, entry)');
  });

  it('retires successful Quick Log intent before creating the continuation draft', () => {
    expect(source).toContain('retireConsumedPlannedMealDraftContext(');
    expect(source).toContain('buildOrdinaryLogHref({');
    expect(source).toContain('setResolvedPlannedContext(null)');
    expect(source).toContain('await router.replace(ordinaryHref');
    expect(source).toContain('setDraft(createLogNutritionDraft(nextContext))');
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

  it('hydrates committed history through a read-only state tree', () => {
    expect(source).toContain('journalService.listEntriesByDay(date)');
    expect(source).toContain('selectCommittedNutritionEntries(');
    expect(source).toContain('setCommittedEntries(');
    expect(source).toContain('const visibleEntries = draft?.entries ?? []');
    expect(source).not.toContain('addLogNutritionDraftEntry(current, committed');
  });

  it('refreshes committed history after logging only the new draft entries', () => {
    const commitStart = source.indexOf('const commitDraft = async');
    const saveStart = source.indexOf('const saveAsMeal = async');
    const body = source.slice(commitStart, saveStart);
    expect(body).toContain('entries: draft.entries.map');
    expect(body).not.toContain('committedEntries.map');
    expect(body).toContain('await refreshCommittedEntries()');
  });
});
