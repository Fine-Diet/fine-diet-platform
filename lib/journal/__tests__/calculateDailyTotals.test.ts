/**
 * Daily totals semantics — grouped meal vs flat food.
 *
 * Proves the P10 write-path-semantics correction:
 *   - Flat food entries are per-serving and scale by payload.quantity.
 *   - Grouped meal entries (payload.meal_group present) carry ALREADY-CONSUMED
 *     absolute top-level nutrition and must NOT be multiplied by quantity again
 *     (which would double-count as per_serving * consumed_servings^2).
 */

import { calculateDailyTotals } from '../types';
import type { JournalEntry } from '../types';

function entry(overrides: Partial<JournalEntry> & { payload: JournalEntry['payload'] }): JournalEntry {
  const ts = new Date('2026-06-02T12:00:00');
  return {
    id: overrides.id ?? 'e1',
    type: overrides.type ?? 'intake',
    timestamp: ts,
    block: 'midday',
    payload: overrides.payload,
    created_at: ts,
    updated_at: ts,
  };
}

describe('calculateDailyTotals — flat food entries (per-serving, scaled by quantity)', () => {
  it('multiplies flat food calories and macros by quantity', () => {
    const totals = calculateDailyTotals([
      entry({
        payload: {
          name: 'Greek yogurt',
          quantity: 2,
          calories: 100,
          macros: { protein: 10, carbs: 5, fat: 0 },
        },
      }),
    ]);

    expect(totals.caloriesConsumed).toBe(200);
    expect(totals.macrosConsumed).toEqual({ protein: 20, carbs: 10, fat: 0 });
  });

  it('defaults quantity to 1 when absent', () => {
    const totals = calculateDailyTotals([
      entry({
        payload: {
          name: 'Apple',
          calories: 95,
          macros: { protein: 0.5, carbs: 25, fat: 0.3 },
        },
      }),
    ]);

    expect(totals.caloriesConsumed).toBe(95);
    expect(totals.macrosConsumed).toEqual({ protein: 0.5, carbs: 25, fat: 0.3 });
  });
});

describe('calculateDailyTotals — grouped meal entries (absolute consumed totals)', () => {
  it('does NOT multiply grouped top-level nutrition by quantity at 2 servings', () => {
    const totals = calculateDailyTotals([
      entry({
        payload: {
          name: 'Turkey chili',
          quantity: 2,
          calories: 600,
          macros: { protein: 40, carbs: 50, fat: 20 },
          meal_group: {
            schema_version: 1,
            consumed_servings: 2,
          },
        },
      }),
    ]);

    // 600, not 1200 (which would be per_serving * consumed_servings^2).
    expect(totals.caloriesConsumed).toBe(600);
    expect(totals.macrosConsumed).toEqual({ protein: 40, carbs: 50, fat: 20 });
  });

  it('counts grouped nutrition as-is at consumed_servings = 1', () => {
    const totals = calculateDailyTotals([
      entry({
        payload: {
          name: 'Single-serve bowl',
          quantity: 1,
          calories: 300,
          macros: { protein: 20, carbs: 25, fat: 10 },
          meal_group: { schema_version: 1, consumed_servings: 1 },
        },
      }),
    ]);

    expect(totals.caloriesConsumed).toBe(300);
    expect(totals.macrosConsumed).toEqual({ protein: 20, carbs: 25, fat: 10 });
  });

  it('treats a malformed/empty meal_group object as grouped (no quantity scaling)', () => {
    const totals = calculateDailyTotals([
      entry({
        payload: {
          name: 'Imported meal',
          quantity: 3,
          calories: 500,
          macros: { protein: 30, carbs: 45, fat: 18 },
          meal_group: {},
        },
      }),
    ]);

    expect(totals.caloriesConsumed).toBe(500);
    expect(totals.macrosConsumed).toEqual({ protein: 30, carbs: 45, fat: 18 });
  });
});

describe('calculateDailyTotals — grouped vs flat parity', () => {
  it('a grouped meal at 2 servings equals equivalent flat consumed totals', () => {
    // Flat: 300 kcal per serving * 2 servings.
    const flat = calculateDailyTotals([
      entry({
        id: 'flat',
        payload: {
          name: 'Per-serving food',
          quantity: 2,
          calories: 300,
          macros: { protein: 20, carbs: 25, fat: 10 },
        },
      }),
    ]);

    // Grouped: write path already stored consumed totals (300 * 2).
    const grouped = calculateDailyTotals([
      entry({
        id: 'grouped',
        payload: {
          name: 'Grouped meal',
          quantity: 2,
          calories: 600,
          macros: { protein: 40, carbs: 50, fat: 20 },
          meal_group: { schema_version: 1, consumed_servings: 2 },
        },
      }),
    ]);

    expect(grouped.caloriesConsumed).toBe(flat.caloriesConsumed);
    expect(grouped.macrosConsumed).toEqual(flat.macrosConsumed);
  });
});

describe('calculateDailyTotals — mixed day and non-intake handling', () => {
  it('sums flat foods + grouped meals correctly on a mixed day', () => {
    const totals = calculateDailyTotals([
      entry({
        id: 'flat',
        payload: {
          name: 'Greek yogurt',
          quantity: 2,
          calories: 100,
          macros: { protein: 10, carbs: 5, fat: 0 },
        },
      }),
      entry({
        id: 'grouped',
        payload: {
          name: 'Turkey chili',
          quantity: 2,
          calories: 600,
          macros: { protein: 40, carbs: 50, fat: 20 },
          meal_group: { schema_version: 1, consumed_servings: 2 },
        },
      }),
    ]);

    // Flat: 200 kcal + Grouped: 600 kcal = 800.
    expect(totals.caloriesConsumed).toBe(800);
    // Protein: flat 20 + grouped 40 = 60; carbs: 10 + 50 = 60; fat: 0 + 20 = 20.
    expect(totals.macrosConsumed).toEqual({ protein: 60, carbs: 60, fat: 20 });
  });

  it('ignores non-intake entries', () => {
    const totals = calculateDailyTotals([
      entry({ id: 'water', type: 'water', payload: { amount: 16, unit: 'oz' } }),
      entry({
        id: 'food',
        payload: { name: 'Toast', quantity: 1, calories: 120, macros: { protein: 4, carbs: 22, fat: 2 } },
      }),
    ]);

    expect(totals.caloriesConsumed).toBe(120);
    expect(totals.macrosConsumed).toEqual({ protein: 4, carbs: 22, fat: 2 });
  });
});
