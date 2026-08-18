import { createBlankMealDocument } from '@/lib/meals/composer/state';
import { blankComponent } from '@/lib/meals/composer/componentOps';
import type { MealDocument } from '@/lib/meals/types';
import { attachBodyUsesCanonicalId, buildExistingMealAttachBody, resolveCanonicalSlotAttachAction } from '../attach';

function savedMeal(id: string): MealDocument {
  return {
    ...createBlankMealDocument(),
    id,
    title: 'Saved bowl',
    components: [blankComponent('c1', 'Rice')],
  };
}

describe('existing meal attach', () => {
  it('points at the canonical MealDocument id and does not invent a new library id', () => {
    const document = savedMeal('doc-123');
    const body = buildExistingMealAttachBody({
      planId: 'plan-1',
      planDayId: 'day-1',
      planSlotId: 'slot-1',
      mealType: 'lunch',
      document,
    });
    expect(attachBodyUsesCanonicalId(body, 'doc-123')).toBe(true);
    expect(body.payload.source_meal_document_id).toBe('doc-123');
    expect(body.plan_id).toBe('plan-1');
    expect(body.plan_slot_id).toBe('slot-1');
    expect(body.name).toBe('Saved bowl');
  });

  it('refuses to attach a document that has not been saved to the library', () => {
    expect(() =>
      buildExistingMealAttachBody({
        planId: 'plan-1',
        planDayId: 'day-1',
        planSlotId: 'slot-1',
        mealType: 'lunch',
        document: savedMeal(null as unknown as string),
      }),
    ).toThrow(/canonical MealDocument id/);
  });
});

describe('canonical slot attach idempotency', () => {
  const meals = [
    {
      id: 'planned-1',
      plan_id: 'plan-1',
      plan_slot_id: 'slot-1',
      payload: { source_meal_document_id: 'doc-123' },
    },
  ];

  it('reuses the existing planned-meal row for the same plan, slot, and document', () => {
    expect(
      resolveCanonicalSlotAttachAction({
        meals,
        planId: 'plan-1',
        planSlotId: 'slot-1',
        documentId: 'doc-123',
      }),
    ).toEqual({ action: 'reuse', mealId: 'planned-1' });
  });

  it('inserts when the slot or document is different', () => {
    expect(
      resolveCanonicalSlotAttachAction({
        meals,
        planId: 'plan-1',
        planSlotId: 'slot-2',
        documentId: 'doc-123',
      }),
    ).toEqual({ action: 'insert' });
    expect(
      resolveCanonicalSlotAttachAction({
        meals,
        planId: 'plan-1',
        planSlotId: 'slot-1',
        documentId: 'doc-other',
      }),
    ).toEqual({ action: 'insert' });
  });
});
