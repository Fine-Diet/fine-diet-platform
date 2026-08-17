import {
  PANTRY_IF_ABSENT_UPSERT,
  resolvePantryIfAbsentWrite,
} from '../pantryIfAbsent';
import type { PantryOnHandItem } from '../types';

const KEY = 'food-salt::item';

function pantryItem(overrides: Partial<PantryOnHandItem> = {}): PantryOnHandItem {
  return {
    key: KEY,
    food_object_id: '22222222-2222-4222-8222-222222222222',
    name: 'Salt',
    quantity: 1,
    unit: 'item',
    updated_at: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('PANTRY_IF_ABSENT_UPSERT', () => {
  it('reuses the existing person_id,key unique conflict and ignores duplicates', () => {
    expect(PANTRY_IF_ABSENT_UPSERT.onConflict).toBe('person_id,key');
    expect(PANTRY_IF_ABSENT_UPSERT.ignoreDuplicates).toBe(true);
  });
});

describe('resolvePantryIfAbsentWrite', () => {
  it('returns the inserted row as created on first insert', () => {
    const inserted = pantryItem({ quantity: 1, unit: 'item' });
    expect(
      resolvePantryIfAbsentWrite({
        attempted: { key: KEY, quantity: 1, unit: 'item' },
        inserted,
        existing: null,
      }),
    ).toEqual({ item: inserted, created: true });
  });

  it('preserves existing quantity and unit when a retry or concurrent save conflicts', () => {
    const existing = pantryItem({ quantity: 8, unit: 'cup' });
    const result = resolvePantryIfAbsentWrite({
      attempted: { key: KEY, quantity: 1, unit: 'item' },
      inserted: null,
      existing,
    });
    expect(result.created).toBe(false);
    expect(result.item.quantity).toBe(8);
    expect(result.item.unit).toBe('cup');
    expect(result.item).toEqual(existing);
  });

  it('throws when neither an insert nor an existing row is available', () => {
    expect(() =>
      resolvePantryIfAbsentWrite({
        attempted: { key: KEY, quantity: 1, unit: 'item' },
        inserted: null,
        existing: null,
      }),
    ).toThrow(/not created and no existing row/i);
  });
});
