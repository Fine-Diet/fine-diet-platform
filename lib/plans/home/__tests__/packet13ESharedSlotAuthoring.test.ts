import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 13E shared Plans slot authoring contracts', () => {
  it('uses the same canonical panel inline on Home and Day', () => {
    const home = read('components/plans/home/MealGuidanceModule.tsx');
    const day = read('pages/journal/plans/day/[date].tsx');
    const daySlots = read('components/journal/plans/DayView.tsx');
    const slotCard = read('components/journal/plans/SlotCard.tsx');

    expect(home).toContain('<PlanMealComposerPanel');
    expect(home).toContain('presentation="capture-draft"');
    expect(home).toContain('density="compact"');
    expect(day).toContain('renderSlotAuthoring');
    expect(day).toContain('<PlanMealComposerPanel');
    expect(day).toContain('presentation="capture-draft"');
    expect(day).toContain('createContext="plans_slot"');
    expect(day).not.toContain('<SlotEditor');
    expect(daySlots).toContain('onToggleAuthoring');
    expect(slotCard).toContain('aria-expanded={expanded}');
  });

  it('keeps additions and edits local until a dirty Save', () => {
    const panel = read('components/journal/plans/PlanMealComposerPanel.tsx');
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');

    expect(panel).toContain('const dirty =');
    expect(panel).toContain('if (!dirty) return');
    expect(capture).toContain('{dirty && (');
    expect(capture).toContain('>Draft</span>');
    expect(capture).toContain('commit.onCommit()');
    expect(capture).not.toMatch(/planService|journalService|journal_entries/);
  });

  it('confirms component removal and makes final-component Save unplan the slot', () => {
    const panel = read('components/journal/plans/PlanMealComposerPanel.tsx');
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');

    expect(capture).toContain('pendingRemovalId');
    expect(capture).toContain('Cancel');
    expect(capture).toContain('Remove');
    expect(capture.indexOf("type: 'REMOVE_COMPONENT'")).toBeGreaterThan(
      capture.indexOf('pendingRemovalId === component.component_id'),
    );
    expect(panel).toContain('removingFinalComponent');
    expect(panel).toContain('await planService.deleteMeal(props.meal.id)');
  });

  it('keeps structural identity and duplicate-safe projection shared by both reads', () => {
    const homeProjection = read('lib/plans/home/buildGuidance.ts');
    const day = read('components/journal/plans/DayView.tsx');
    const serverProjection = read('lib/plans/planServerService.ts');

    expect(homeProjection).toContain('canonicalMealsByStructuralSlot');
    expect(homeProjection).toContain('resolveStructuralOccasionMeal');
    expect(homeProjection).toContain(
      'candidate.plan_slot_id === planSlot.id',
    );
    expect(homeProjection).toContain(
      'candidate.plan_slot_id == null',
    );
    expect(homeProjection).toContain('planSlot');
    expect(day).toContain('canonicalMealsByStructuralSlot(meals)');
    expect(serverProjection).toContain('canonicalMealsByStructuralSlot(persistedMeals)');
  });

  it('keeps Quick Log as a route handoff instead of plan execution', () => {
    const home = read('components/plans/home/PlansHomeView.tsx');
    expect(home).toContain('buildPlansHomeLogHref');
    expect(home).not.toContain('executeMeal(');
  });
});
