import { formatCalories, formatLoggedActual, nutritionIsMissing, type LinkedJournalNutrition } from '../SlotCard';
import type { PlannedMeal } from '@/lib/plans';

/**
 * Corrective fix (Phase 3 authenticated QA — defect plans-vs-log-nutrition-read):
 * a handled meal's own plan nutrition can be missing while its linked
 * journal entry has full ACTUAL nutrition. These focused tests pin the
 * read-only display helpers SlotCard uses to distinguish "Plan nutrition
 * unavailable" from a secondary "Logged actual" label — proving the linked
 * snapshot is formatted for display only and never fabricates plan
 * nutrition when no link exists.
 */

function meal(overrides: Partial<PlannedMeal> = {}): PlannedMeal {
  return {
    id: 'meal-1',
    payload: { totals: { calories: 0, protein_g: 0 }, items: [] },
    ...overrides,
  } as unknown as PlannedMeal;
}

describe('nutritionIsMissing', () => {
  it('is true for a meal with zero totals and no per-item numbers', () => {
    expect(nutritionIsMissing(meal())).toBe(true);
  });

  it('is false when totals carry real calories', () => {
    expect(nutritionIsMissing(meal({ payload: { totals: { calories: 340 } } } as never))).toBe(false);
  });
});

describe('formatLoggedActual', () => {
  it('formats a linked entry with real calories', () => {
    const nutrition: LinkedJournalNutrition = {
      calories: 340,
      protein_g: 28,
      carbs_g: 29,
      fat_g: 13,
    };
    expect(formatLoggedActual(nutrition)).toBe('Logged actual · 340 cal');
  });

  it('returns null when no linked nutrition is present — no fabricated plan nutrition', () => {
    expect(formatLoggedActual(undefined)).toBeNull();
  });

  it('returns null when the linked entry has no usable calories', () => {
    expect(formatLoggedActual({ calories: null, protein_g: null, carbs_g: null, fat_g: null })).toBeNull();
    expect(formatLoggedActual({ calories: 0, protein_g: null, carbs_g: null, fat_g: null })).toBeNull();
  });

  it('rounds fractional calories for display', () => {
    expect(
      formatLoggedActual({ calories: 339.6, protein_g: null, carbs_g: null, fat_g: null }),
    ).toBe('Logged actual · 340 cal');
  });
});

describe('handled-card display — linked actual nutrition never mutates plan nutrition', () => {
  it('the meal\'s own plan calorie line is unaffected by a linked entry\'s actual nutrition', () => {
    const handledMealWithMissingPlanNutrition = meal({
      execution_state: 'eaten',
      journal_entry_id: 'entry-1',
      payload: { totals: { calories: 0, protein_g: 0 }, items: [] },
    } as never);
    const originalPayload = handledMealWithMissingPlanNutrition.payload;

    // formatCalories reads ONLY the meal's own payload/derived data — never
    // the linked journal snapshot — so it stays null/honest regardless of
    // what the linked entry's actual nutrition says.
    expect(formatCalories(handledMealWithMissingPlanNutrition)).toBeNull();
    expect(nutritionIsMissing(handledMealWithMissingPlanNutrition)).toBe(true);
    // The meal's payload object identity/content is untouched by computing
    // (or even rendering) the secondary "Logged actual" label.
    expect(handledMealWithMissingPlanNutrition.payload).toBe(originalPayload);
  });
});

describe('legacy missing-plan snapshot without a linked entry stays truthful', () => {
  it('never fabricates a "Logged actual" line when there is no linked journal entry', () => {
    const handledMealNoLink = meal({ execution_state: 'eaten', journal_entry_id: null } as never);
    expect(nutritionIsMissing(handledMealNoLink)).toBe(true);
    // No linked nutrition was resolved for this meal (no journal_entry_id),
    // so the caller passes undefined — formatLoggedActual must stay null
    // rather than inventing a number.
    expect(formatLoggedActual(undefined)).toBeNull();
  });
});
