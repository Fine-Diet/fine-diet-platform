import { PlanRequestValidationError } from '../planRequestErrors';
import {
  assertAiPlanSlotIdentity,
  isPlanDayDateUniqueViolation,
  validateUniqueSlotOrdinals,
} from '../planSlotIdentity';
import type { AiPlanDay } from '../validators';

describe('validateUniqueSlotOrdinals', () => {
  it('accepts unique ordinals', () => {
    expect(
      validateUniqueSlotOrdinals([
        { slot_ordinal: 0 },
        { slot_ordinal: 1 },
        { slot_ordinal: 2 },
      ]),
    ).toEqual({ ok: true });
  });

  it('rejects duplicate ordinals', () => {
    const result = validateUniqueSlotOrdinals([
      { slot_ordinal: 1 },
      { slot_ordinal: 2 },
      { slot_ordinal: 1 },
    ]);
    expect(result).toEqual({
      ok: false,
      error: 'Duplicate slot_ordinal values on plan day: 1.',
      duplicateOrdinals: [1],
    });
  });

  it('rejects duplicate zero ordinals', () => {
    const result = validateUniqueSlotOrdinals([
      { slot_ordinal: 0 },
      { slot_ordinal: 0 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.duplicateOrdinals).toContain(0);
    }
  });
});

describe('assertAiPlanSlotIdentity', () => {
  it('throws before persistence when a day has duplicate ordinals', () => {
    const days = [
      {
        date_local: '2026-07-12',
        slots: [
          { slot_ordinal: 0, slot_block: 'morning', planned_meals: [] },
          { slot_ordinal: 0, slot_block: 'midday', planned_meals: [] },
        ],
      },
    ] as unknown as AiPlanDay[];

    expect(() => assertAiPlanSlotIdentity(days)).toThrow(PlanRequestValidationError);
  });

  it('passes clean AI days', () => {
    const days = [
      {
        date_local: '2026-07-12',
        slots: [
          { slot_ordinal: 0, slot_block: 'morning', planned_meals: [] },
          { slot_ordinal: 1, slot_block: 'midday', planned_meals: [] },
        ],
      },
    ] as unknown as AiPlanDay[];
    expect(() => assertAiPlanSlotIdentity(days)).not.toThrow();
  });
});

describe('unique-index conflict mapping', () => {
  it('maps plan_days (plan_id, date_local) unique violations', () => {
    expect(
      isPlanDayDateUniqueViolation({
        code: '23505',
        message: 'duplicate key value violates unique constraint "idx_plan_days_plan_date"',
      }),
    ).toBe(true);
    expect(
      isPlanDayDateUniqueViolation({
        code: '23503',
        message: 'foreign key',
      }),
    ).toBe(false);
  });
});
