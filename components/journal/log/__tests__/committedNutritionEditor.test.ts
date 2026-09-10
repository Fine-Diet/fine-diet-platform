import fs from 'fs';
import path from 'path';

const editor = fs.readFileSync(
  path.join(process.cwd(), 'components/journal/log/CommittedNutritionEditor.tsx'),
  'utf8',
);
const draftPage = fs.readFileSync(
  path.join(process.cwd(), 'components/journal/log/LogNutritionDraftPage.tsx'),
  'utf8',
);
const directPage = fs.readFileSync(
  path.join(process.cwd(), 'components/journal/log/CommittedNutritionEntryPage.tsx'),
  'utf8',
);
const mealComposer = fs.readFileSync(
  path.join(process.cwd(), 'components/meals/composer/MealComposer.tsx'),
  'utf8',
);
const componentList = fs.readFileSync(
  path.join(process.cwd(), 'components/meals/composer/MealComposerComponentList.tsx'),
  'utf8',
);

describe('Packet 15 shared committed nutrition editor boundary', () => {
  it('is reused by both Add/Edit context and the committed permalink route', () => {
    expect(draftPage).toContain('<CommittedNutritionEditor');
    expect(directPage).toContain('<CommittedNutritionEditor');
    expect(directPage).toContain('<LegacyJournalEntryPage');
  });

  it('uses explicit save and confirmation boundaries', () => {
    expect(editor).toContain("'Save changes'");
    expect(editor).toContain("window.confirm('Discard unsaved changes?')");
    expect(editor).toContain("window.confirm('Delete this logged entry?");
    expect(editor).not.toContain('onBlur=');
  });

  it('uses exact payload replacement for coherent Single Item replacement', () => {
    expect(editor).toContain('buildCommittedSingleItemPayload');
    expect(editor).toContain('replacePayload: true');
    expect(editor).toContain('Replace item');
    expect(editor).not.toContain('Rename item');
  });

  it('converts Single Item display quantity atomically and previews local nutrition', () => {
    expect(editor).toContain('convertCommittedSingleItemQuantity({');
    expect(editor).toContain('setQuantity(String(converted.quantity))');
    expect(editor).toContain('setUnit(converted.unit)');
    expect(editor).toContain('{nutritionPreview}</p>');
  });

  it('uses shared composer logged-instance mode and the existing grouped endpoint', () => {
    expect(editor).toContain("useMealComposer('log-edit'");
    expect(editor).toContain('buildStructuralEditPatch');
    expect(editor).toContain('journalService.updateGroupedMealInstance');
  });

  it('exposes conservative review confirmation in log-edit without document-only fields', () => {
    expect(mealComposer).toContain(
      "const showReviewConfirmation = isDocumentMode || mode === 'log-edit';",
    );
    expect(mealComposer).toContain('{showReviewConfirmation && (');
    expect(mealComposer).toContain(
      'showDocumentOnlyFields = isDocumentMode',
    );
    expect(mealComposer).toContain(
      "dispatch({ type: 'SET_REVIEW_CONFIRMED', confirmed: e.target.checked })",
    );
  });

  it('uses the shared conversion-aware component Unit control', () => {
    expect(componentList).toContain('getMealComponentValidUnits(component)');
    expect(componentList).toContain('convertMealComponentDisplayUnit(');
    expect(componentList).toContain('converted.quantity');
    expect(componentList).toContain('converted.unit');
    expect(componentList).toContain('Match this component to a food before changing units.');
  });
});
