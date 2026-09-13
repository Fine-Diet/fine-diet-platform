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
    expect(page).toContain('Day Plans Library');
    expect(page).toContain('Make a copy');
    expect(page).toContain('Apply to a date');
    expect(page).toContain("window.confirm('Replace the current unsaved Day Plan draft?')");
    expect(page).toContain('disabled={!dirty || busy}');
    expect(page).toContain('duplicatePlanDayTemplate');
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
