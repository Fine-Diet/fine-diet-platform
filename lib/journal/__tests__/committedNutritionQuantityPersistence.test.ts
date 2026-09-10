let currentRow: Record<string, unknown>;
let persistedUpdates: Record<string, unknown>;

function chainReturning(data: Record<string, unknown>) {
  const chain = {
    eq: jest.fn(),
    select: jest.fn(),
    single: jest.fn(async () => ({ data, error: null })),
  };
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
}

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: () => chainReturning(currentRow),
      update: (updates: Record<string, unknown>) => {
        persistedUpdates = updates;
        return chainReturning({ ...currentRow, ...updates });
      },
    })),
  },
}));

import { updateEntry } from '../journalServerService';

const BASE_ROW = {
  id: 'entry-1',
  person_id: 'person-1',
  entry_type: 'intake',
  occurred_at: '2026-09-10T12:00:00.000Z',
  payload: {
    name: 'Beans',
    quantity: 1,
    unit: 'serving',
    calories: 100,
    macros: { protein: 10, carbs: 20, fat: 2 },
    servingSizeG: 100,
    measures: [{ unit: 'cup', grams: 200 }],
  },
  quantity_g: 100,
  protein_score_10: null,
  is_main_meal: null,
  meal_derived_data: null,
  created_at: '2026-09-10T12:00:00.000Z',
  updated_at: '2026-09-10T12:00:00.000Z',
};

describe('Packet 15B committed quantity persistence', () => {
  beforeEach(() => {
    currentRow = structuredClone(BASE_ROW);
    persistedUpdates = {};
  });

  it('persists gram display input as canonical serving multiplier + quantity_g', async () => {
    const payload = {
      ...(currentRow.payload as Record<string, unknown>),
      quantity: 200,
      unit: 'g',
    };
    const entry = await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload,
      replacePayload: true,
      quantityG: 200,
    });
    const persistedPayload = persistedUpdates.payload as Record<string, unknown>;
    expect(persistedPayload.quantity).toBe(2);
    expect(persistedPayload.unit).toBe('g');
    expect(persistedUpdates.quantity_g).toBe(200);
    expect(entry?.quantityG).toBe(200);
    expect(entry?.payload.calories).toBe(100);
  });

  it('persists an equivalent household amount without changing nutrition', async () => {
    const payload = {
      ...(currentRow.payload as Record<string, unknown>),
      quantity: 0.5,
      unit: 'cup',
    };
    const entry = await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload,
      replacePayload: true,
    });
    const persistedPayload = persistedUpdates.payload as Record<string, unknown>;
    expect(persistedPayload.quantity).toBe(1);
    expect(persistedPayload.unit).toBe('cup');
    expect(persistedUpdates.quantity_g).toBe(100);
    expect(entry?.quantityG).toBe(100);
    expect(entry?.payload.calories).toBe(100);
  });

  it('persists a changed serving amount with coherent canonical grams', async () => {
    const payload = {
      ...(currentRow.payload as Record<string, unknown>),
      quantity: 2,
      unit: 'serving',
    };
    const entry = await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload,
      replacePayload: true,
    });
    const persistedPayload = persistedUpdates.payload as Record<string, unknown>;
    expect(persistedPayload.quantity).toBe(2);
    expect(persistedUpdates.quantity_g).toBe(200);
    expect(entry?.quantityG).toBe(200);
    expect((entry?.payload.calories ?? 0) * (entry?.payload.quantity ?? 0)).toBe(200);
  });
});
