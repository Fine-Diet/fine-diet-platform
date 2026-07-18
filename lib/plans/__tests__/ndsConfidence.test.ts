import {
  confidenceForCoverage,
  confidenceForDay,
  confidenceForMealItems,
  coverageForMealItems,
  projectionConfidenceForPlannedMeals,
} from '../ndsConfidence';

// ============================================================================
// Phase 3 corrective packet — macro shape compatibility
//
// coverageForMealItems (via itemHasMacros) must classify an item with
// legacy snake `_g` macros ({protein_g, carbs_g, fat_g}, written by the
// pre-correction SlotEditor.templateToPayload) and an item with canonical
// camelCase macros ({protein, carbs, fat}, written by
// componentToPlannedMealItem / the corrected SlotEditor.templateToPayload)
// identically — via the single shared macrosFromCompat normalization in
// lib/meals/adapters.ts, not a second, possibly-conflicting interpretation.
// ============================================================================

describe('coverageForMealItems — macro shape compatibility', () => {
  it('classifies a legacy snake-case macro item as an "estimate" (has macros, no food_object_id)', () => {
    const coverage = coverageForMealItems([
      { food_object_id: null, calories: 0, macros: { protein_g: 31, carbs_g: 0, fat_g: 4 } },
    ]);
    expect(coverage).toEqual({
      resolved_items: 0,
      estimate_items: 1,
      ai_or_text_items: 0,
      total_items: 1,
    });
  });

  it('classifies a canonical camelCase macro item as an "estimate" identically to the legacy shape', () => {
    const coverage = coverageForMealItems([
      { food_object_id: null, calories: 0, macros: { protein: 31, carbs: 0, fat: 4 } },
    ]);
    expect(coverage).toEqual({
      resolved_items: 0,
      estimate_items: 1,
      ai_or_text_items: 0,
      total_items: 1,
    });
  });

  it('a resolved item (has food_object_id) is "resolved" regardless of which macro shape it also carries', () => {
    const camel = coverageForMealItems([
      { food_object_id: 'food-1', macros: { protein: 31, carbs: 0, fat: 4 } },
    ]);
    const snake = coverageForMealItems([
      { food_object_id: 'food-1', macros: { protein_g: 31, carbs_g: 0, fat_g: 4 } },
    ]);
    expect(camel).toEqual(snake);
    expect(camel.resolved_items).toBe(1);
  });

  it('an item with no macros in EITHER shape and no food_object_id is "ai_or_text"', () => {
    const coverage = coverageForMealItems([{ food_object_id: null, calories: 0, macros: null }]);
    expect(coverage.ai_or_text_items).toBe(1);
    expect(coverage.estimate_items).toBe(0);
  });

  it('confidenceForMealItems maps a mixed-shape meal to the same bucket regardless of shape', () => {
    const camel = confidenceForMealItems([
      { food_object_id: null, macros: { protein: 10, carbs: 20, fat: 5 } },
    ]);
    const snake = confidenceForMealItems([
      { food_object_id: null, macros: { protein_g: 10, carbs_g: 20, fat_g: 5 } },
    ]);
    expect(camel).toBe('medium');
    expect(snake).toBe('medium');
  });
});

describe('confidenceForCoverage / confidenceForDay (unchanged Phase 2 rules — regression guard)', () => {
  it('all resolved → high', () => {
    expect(
      confidenceForCoverage({ resolved_items: 2, estimate_items: 0, ai_or_text_items: 0, total_items: 2 })
    ).toBe('high');
  });

  it('any ai_or_text → low, overriding resolved/estimate items', () => {
    expect(
      confidenceForCoverage({ resolved_items: 1, estimate_items: 1, ai_or_text_items: 1, total_items: 3 })
    ).toBe('low');
  });

  it('day confidence is the weakest meal', () => {
    expect(confidenceForDay(['high', 'medium', 'high'])).toBe('medium');
    expect(confidenceForDay(['high', 'low'])).toBe('low');
    expect(confidenceForDay(['high', 'high'])).toBe('high');
  });

  it('projectionConfidenceForPlannedMeals delegates to confidenceForDay', () => {
    expect(
      projectionConfidenceForPlannedMeals([{ nds_confidence: 'high' }, { nds_confidence: 'low' }])
    ).toBe('low');
  });
});
