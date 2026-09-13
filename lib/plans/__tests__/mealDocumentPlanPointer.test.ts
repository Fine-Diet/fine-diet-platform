import {
  shouldStampPlannedMealDocumentPointer,
  stampPlannedMealDocumentPointer,
} from '../mealDocumentPlanPointer';
import type { MealDocument } from '@/lib/meals/types';

describe('planned meal document pointer provenance', () => {
  it('keeps a legacy Saved Meal template as template provenance, not a false canonical pointer', () => {
    const savedTemplate = {
      id: 'template-1',
      source: {
        source_type: 'saved_meal',
        source_template_id: 'template-1',
      },
    } as Pick<MealDocument, 'id' | 'source'>;

    expect(shouldStampPlannedMealDocumentPointer(savedTemplate)).toBe(false);
  });

  it('still stamps a real canonical MealDocument pointer', () => {
    const canonical = {
      id: 'document-1',
      source: { source_type: 'manual' },
    } as Pick<MealDocument, 'id' | 'source'>;

    expect(shouldStampPlannedMealDocumentPointer(canonical)).toBe(true);
    expect(
      stampPlannedMealDocumentPointer({}, {
        id: 'document-1',
        yield: null,
        recipe_yield_servings: null,
      }),
    ).toEqual(
      expect.objectContaining({
        source_meal_document_id: 'document-1',
        meal_document_snapshot: true,
      }),
    );
  });
});
