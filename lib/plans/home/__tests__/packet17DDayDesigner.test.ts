import fs from 'fs';
import path from 'path';

import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 17D date-agnostic Day Plan designer', () => {
  it('owns an unambiguous canonical route while dated Day remains compatible', () => {
    expect(APP_ROUTES.plansDay).toBe('/app/plans/day');
    expect(APP_ROUTE_BUILDERS.planDayDesigner()).toBe('/app/plans/day');
    expect(APP_ROUTE_BUILDERS.planDayDesigner('reusable-1')).toBe(
      '/app/plans/day?dayPlanId=reusable-1',
    );
    expect(APP_ROUTE_BUILDERS.planDay('2026-09-11')).toBe('/app/plans/day/2026-09-11');
    expect(read('pages/app/plans/day/index.tsx')).toContain(
      "export { default } from '../../../journal/plans/day'",
    );
  });

  it('projects saved Day Plans onto the current Meal Rhythm seed without persisting on open', () => {
    const page = read('pages/journal/plans/day/index.tsx');
    const editor = read('components/journal/plans/reusable/TemplateDayEditor.tsx');
    expect(page).toContain('planService.getPlanDayDraftSeed()');
    expect(page).toContain('setRhythmSlots(seed.slots)');
    expect(page).toContain('rhythmSlots={rhythmSlots}');
    expect(editor).toContain('projectTemplateOntoRhythm(templateSlots, rhythmSlots)');
    expect(editor).toContain('materializeRhythmSlot(templateSlots, projected)');
    expect(editor).toContain('displaySlots');
    expect(read('components/journal/plans/EmbeddedDayPlanner.tsx')).not.toContain('rhythmSlots');
    expect(read('pages/journal/plans/week-patterns/[patternId].tsx')).not.toContain('rhythmSlots');
  });

  it('loads a read-only Meal Rhythm seed and writes only at explicit Save', () => {
    const page = read('pages/journal/plans/day/index.tsx');
    const seed = read('pages/api/journal/plans/templates/seed.ts');
    const api = read('pages/api/journal/plans/templates/index.ts');
    expect(page).toContain('planService.getPlanDayDraftSeed()');
    expect(seed).toContain("req.method !== 'GET'");
    expect(seed).toContain('buildBlankTemplateSlotsFromSchedule');
    expect(seed).not.toContain('saveReusablePlanDayTemplate');
    expect(page).toContain("mode: 'draft'");
    expect(api).toContain("if (mode === 'draft')");
    expect(page.indexOf("mode: 'draft'")).toBeGreaterThan(page.indexOf('async function saveDraft'));
  });

  it('provides file actions, dirty guards, and the contextual Library modal', () => {
    const page = read('pages/journal/plans/day/index.tsx');
    expect(page).toContain('Plan For Consistency');
    expect(page).toContain('PlanContextModal');
    expect(page).toContain('PlanLibraryBrowser');
    expect(page).toContain('libraryTabLabel="Day Plans Library"');
    expect(page).toContain('Make a copy');
    expect(page).toContain('Apply to a date');
    expect(page).toContain("window.confirm('Replace the current unsaved Day Plan draft?')");
    expect(page).toContain('disabled={!dirty || busy}');
    expect(page).toContain('duplicatePlanDayTemplate');
    expect(page).toContain('aria-label="Day Plan description"');
  });

  it('keeps Apply explicit and resolves a manual dated target only after confirmation', () => {
    const page = read('pages/journal/plans/day/index.tsx');
    const endpoint = read('pages/api/journal/plans/templates/[templateId]/instantiate.ts');
    expect(page.indexOf('window.confirm(`Apply')).toBeLessThan(
      page.indexOf('planService.instantiatePlanDayTemplate'),
    );
    expect(endpoint).toContain('resolvePlansHomeTargetForPerson');
    expect(endpoint).toContain('target_date_local');
    expect(endpoint).toContain('allowDuplicateAppend');
  });

  it('uses one shared Plans Search/Scan/+ presentation and retires the old picker', () => {
    const editor = read('components/journal/plans/reusable/TemplateDayEditor.tsx');
    const reusableComposer = read(
      'components/journal/plans/reusable/TemplateMealComposerPanel.tsx',
    );
    const datedComposer = read('components/journal/plans/PlanMealComposerPanel.tsx');
    expect(editor).not.toContain('TemplateSavedMealPicker');
    expect(reusableComposer).toContain('<NutritionCaptureDraft');
    expect(datedComposer).toContain('<NutritionCaptureDraft');
    expect(editor).toContain('presentation="capture-draft"');
  });

  it('forwards old template deep links into the canonical designer', () => {
    expect(read('pages/journal/plans/day-templates/index.tsx')).toContain(
      'export default DayPlanDesignerPage',
    );
    expect(read('pages/journal/plans/day-templates/[templateId].tsx')).toContain(
      'export default DayPlanDesignerPage',
    );
  });
});

describe('Day Plan accordion capture editor', () => {
  const editor = () => read('components/journal/plans/reusable/TemplateDayEditor.tsx');

  it('uses one-open-slot state keyed by source_plan_slot_id', () => {
    const source = editor();
    expect(source).toContain('openSlotId');
    expect(source).toContain('setOpenSlotId');
    expect(source).toContain('slot.source_plan_slot_id');
    expect(source).toContain('openSlotId === slotId');
    expect(source).not.toContain('slotAddIndex');
    expect(source).not.toContain('Plan this occasion');
  });

  it('uses the Plans Home triangle and aria-expanded toggle', () => {
    const source = editor();
    expect(source).toContain('polygon points="12,18 2,6 22,6"');
    expect(source).toContain('aria-expanded={active}');
    expect(source).toContain("active ? 'rotate-180' : ''");
    expect(source).toContain("closest('button, input, select, textarea')");
    expect(source).not.toContain('DisclosureTriangle');
  });

  it('uses MealStateMarker for planning state instead of Planned/Not planned copy', () => {
    const source = editor();
    expect(source).toContain('<MealStateMarker');
    expect(source).toContain('planned={slotMeals.length > 0}');
    expect(source).not.toMatch(/>\s*Planned\s*</);
    expect(source).not.toMatch(/>\s*Not planned\s*</);
    expect(source).toContain('polygon points="12,18 2,6 22,6"');
  });

  it('mounts capture-draft create for empty open slots and edit for single meals', () => {
    const source = editor();
    expect(source).toContain('slotMeals.length === 0');
    expect(source).toContain('mode="create"');
    expect(source).toContain('slotMeals.length === 1');
    expect(source).toContain('mode="edit"');
    expect(source).toContain('presentation="capture-draft"');
    expect(source).not.toContain('No Meal planned for this occasion yet.');
  });

  it('closes the accordion after save and cancel without persisting on open', () => {
    const source = editor();
    expect(source).toContain('function closeSlot()');
    expect(source).toContain('onCancel={closeSlot}');
    expect(source).toContain('closeSlot()');
    expect(source).not.toContain('planService');
    expect(source).not.toContain('saveDayPlanDraft');
  });

  it('preserves legacy multi-meal review with explicit edit selection', () => {
    const source = editor();
    expect(source).toContain('slotMeals.length > 1');
    expect(source).toContain('legacyEditTarget');
    expect(source).toContain('multiple Meal containers in one occasion');
    expect(source).toContain('setLegacyEditTarget');
    expect(source.indexOf('legacyEditingThisSlot')).toBeGreaterThan(-1);
  });

  it('resolves storage mutations with findIndex on source_plan_slot_id', () => {
    const source = editor();
    expect(source).toContain(
      'candidate.source_plan_slot_id === persistId',
    );
    expect(source).not.toContain('moveArrayItem');
    expect(source).not.toContain('handleMoveSlot');
    expect(source).not.toContain('Move up');
    expect(source).not.toContain('Move down');
  });

  it('clears accordion state when template identity changes', () => {
    const source = editor();
    expect(source).toContain('useEffect(() => {');
    expect(source).toContain('[template.id]');
    expect(source).toContain('setOpenSlotId(null)');
    expect(source).toContain('setLegacyEditTarget(null)');
  });

  it('keeps NutritionCaptureDraft as the shared capture surface', () => {
    const panel = read('components/journal/plans/reusable/TemplateMealComposerPanel.tsx');
    expect(panel).toContain('<NutritionCaptureDraft');
    expect(editor()).not.toContain('<NutritionCaptureDraft');
  });
});
