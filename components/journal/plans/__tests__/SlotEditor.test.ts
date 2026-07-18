/**
 * Focused tests for SlotEditor's pure template → planned-meal payload
 * conversion (Phase 3 corrective packet: planned-meal component macro
 * compatibility). templateToPayload is a pure function, so it's exercised
 * directly rather than through the picker UI.
 */
import type { MealTemplate } from '@/lib/journal';
import { templateToPayload } from '@/components/journal/plans/SlotEditor';

function template(overrides?: Partial<MealTemplate>): MealTemplate {
  return {
    id: 'tmpl-1',
    name: 'Chicken and rice',
    items: [
      {
        id: 'item-1',
        name: 'Chicken breast',
        quantity: 1,
        unit: 'serving',
        calories: 165,
        macros: { protein: 31, carbs: 0, fat: 4 },
      },
    ],
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('SlotEditor.templateToPayload — item macro shape (Phase 3 corrective packet)', () => {
  it('writes the canonical camelCase item macro shape ({protein, carbs, fat}), not legacy snake `_g`', () => {
    const payload = templateToPayload(template()) as {
      items: Array<{ macros?: Record<string, number | null> }>;
    };
    expect(payload.items[0].macros).toEqual({ protein: 31, carbs: 0, fat: 4 });
    expect(payload.items[0].macros).not.toHaveProperty('protein_g');
    expect(payload.items[0].macros).not.toHaveProperty('carbs_g');
    expect(payload.items[0].macros).not.toHaveProperty('fat_g');
  });

  it('writes null item macros when the template item has none, rather than omitting the key', () => {
    const payload = templateToPayload(
      template({
        items: [{ id: 'item-2', name: 'Mystery side', quantity: 1, unit: 'cup', calories: 50 }],
      })
    ) as { items: Array<{ macros: unknown }> };
    expect(payload.items[0].macros).toBeNull();
  });

  it('still sums totals in the existing snake `_g` totals shape (totals shape is unaffected by this correction)', () => {
    const payload = templateToPayload(template()) as {
      totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
    };
    expect(payload.totals).toEqual({ calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 });
  });

  it('stamps source_template_id for provenance', () => {
    const payload = templateToPayload(template()) as { source_template_id: string };
    expect(payload.source_template_id).toBe('tmpl-1');
  });
});
