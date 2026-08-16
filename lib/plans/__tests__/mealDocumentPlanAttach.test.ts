import {
  findExistingCanonicalSlotAttach,
  isMealDocumentArchived,
  readSourceMealDocumentId,
  stampPlannedMealDocumentPointer,
} from '../mealDocumentPlanPointer';

describe('mealDocumentPlanPointer', () => {
  it('reads source_meal_document_id from payload', () => {
    expect(readSourceMealDocumentId({ source_meal_document_id: 'doc-1' })).toBe('doc-1');
    expect(readSourceMealDocumentId({ source_meal_document_id: '  ' })).toBeNull();
    expect(readSourceMealDocumentId({})).toBeNull();
  });

  it('reuses the same plan/slot/document attach and ignores other slots', () => {
    const meals = [
      {
        id: 'planned-1',
        plan_id: 'plan-1',
        plan_slot_id: 'slot-1',
        payload: { source_meal_document_id: 'doc-123' },
      },
      {
        id: 'planned-2',
        plan_id: 'plan-1',
        plan_slot_id: 'slot-2',
        payload: { source_meal_document_id: 'doc-123' },
      },
    ];
    expect(
      findExistingCanonicalSlotAttach({
        meals,
        planId: 'plan-1',
        planSlotId: 'slot-1',
        sourceMealDocumentId: 'doc-123',
      })?.id,
    ).toBe('planned-1');
    expect(
      findExistingCanonicalSlotAttach({
        meals,
        planId: 'plan-1',
        planSlotId: 'slot-1',
        sourceMealDocumentId: 'doc-other',
      }),
    ).toBeNull();
  });

  it('stamps pointer, planned servings, and snapshot label', () => {
    const stamped = stampPlannedMealDocumentPointer(
      { items: [], totals: { calories: 100 } },
      { id: 'doc-123', recipe_yield_servings: 2, yield: null },
    );
    expect(stamped).toMatchObject({
      source_meal_document_id: 'doc-123',
      planned_servings: 2,
      meal_document_snapshot: true,
    });
  });

  it('prefers explicit planned servings over document yield', () => {
    const stamped = stampPlannedMealDocumentPointer(
      {},
      { id: 'doc-123', recipe_yield_servings: 4, yield: null },
      1.5,
    );
    expect(stamped.planned_servings).toBe(1.5);
  });

  it('detects archived lifecycle', () => {
    expect(isMealDocumentArchived({ lifecycle_state: 'archived', archived_at: null })).toBe(true);
    expect(
      isMealDocumentArchived({
        lifecycle_state: 'active',
        archived_at: '2026-07-01T00:00:00.000Z',
      }),
    ).toBe(true);
    expect(isMealDocumentArchived({ lifecycle_state: 'active', archived_at: null })).toBe(false);
  });
});

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

jest.mock('@/lib/meals/mealDocumentServerService', () => ({
  getMealDocumentForPerson: jest.fn(),
}));

import { getMealDocumentForPerson } from '@/lib/meals/mealDocumentServerService';
import { PlanRequestValidationError } from '../planRequestErrors';
import {
  STALE_POINTER_COMPAT_NOTE,
  clearStaleSourceMealDocumentPointer,
  hasReusableEmbeddedMealSnapshot,
  preparePlannedMealPayloadForAttach,
  prepareReusableSnapshotPayloadForAttach,
} from '../mealDocumentPlanAttach';

const mockGet = getMealDocumentForPerson as jest.Mock;

describe('preparePlannedMealPayloadForAttach', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes through payloads without a MealDocument pointer', async () => {
    const payload = { items: [], totals: { calories: 10 } };
    await expect(
      preparePlannedMealPayloadForAttach({ personId: 'p1', payload }),
    ).resolves.toEqual(payload);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('rejects archived MealDocuments for new attachment', async () => {
    mockGet.mockResolvedValue({
      id: 'doc-archived',
      lifecycle_state: 'archived',
      archived_at: '2026-07-01T00:00:00.000Z',
      recipe_yield_servings: 2,
      yield: null,
    });
    await expect(
      preparePlannedMealPayloadForAttach({
        personId: 'p1',
        payload: { source_meal_document_id: 'doc-archived' },
      }),
    ).rejects.toBeInstanceOf(PlanRequestValidationError);
  });

  it('normalizes pointer fields for an active MealDocument', async () => {
    mockGet.mockResolvedValue({
      id: 'doc-active',
      lifecycle_state: 'active',
      archived_at: null,
      recipe_yield_servings: 3,
      yield: null,
    });
    const prepared = await preparePlannedMealPayloadForAttach({
      personId: 'p1',
      payload: { source_meal_document_id: 'doc-active', items: [] },
    });
    expect(prepared).toMatchObject({
      source_meal_document_id: 'doc-active',
      planned_servings: 3,
      meal_document_snapshot: true,
    });
  });

  it('rejects cross-person / missing documents', async () => {
    mockGet.mockResolvedValue(null);
    await expect(
      preparePlannedMealPayloadForAttach({
        personId: 'p1',
        payload: { source_meal_document_id: 'missing' },
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('strict attach still rejects missing pointer even when snapshot exists', async () => {
    mockGet.mockResolvedValue(null);
    await expect(
      preparePlannedMealPayloadForAttach({
        personId: 'p1',
        payload: {
          source_meal_document_id: '4519ebf7-533a-43f6-a44d-975ad6e7e83e',
          meal_document_snapshot: true,
          items: [{ name: 'Chicken sausage', quantity: 1 }],
        },
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('reusable snapshot attach compatibility (Package 5B correction)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires non-empty items or typed_components; marker-only is insufficient', () => {
    expect(hasReusableEmbeddedMealSnapshot({ meal_document_snapshot: true })).toBe(false);
    expect(
      hasReusableEmbeddedMealSnapshot({
        meal_document_snapshot: true,
        items: [],
        typed_components: [],
      }),
    ).toBe(false);
    expect(hasReusableEmbeddedMealSnapshot({ items: [{ name: 'Egg' }] })).toBe(true);
    expect(
      hasReusableEmbeddedMealSnapshot({
        typed_components: [{ component_id: 'c1', name: 'Egg' }],
      }),
    ).toBe(true);
    expect(
      hasReusableEmbeddedMealSnapshot({
        meal_document_snapshot: true,
        items: [{ name: 'Egg' }],
      }),
    ).toBe(true);
  });

  it('rejects marker-only stale snapshot and accepts items or typed_components-only', async () => {
    mockGet.mockResolvedValue(null);
    await expect(
      prepareReusableSnapshotPayloadForAttach({
        personId: 'p1',
        payload: {
          source_meal_document_id: 'missing',
          meal_document_snapshot: true,
        },
      }),
    ).rejects.toThrow(/not found/i);

    await expect(
      prepareReusableSnapshotPayloadForAttach({
        personId: 'p1',
        payload: {
          source_meal_document_id: 'missing',
          meal_document_snapshot: true,
          items: [{ name: 'Chicken sausage' }],
        },
      }),
    ).resolves.toMatchObject({
      cleared_stale_source_meal_document_id: 'missing',
    });

    await expect(
      prepareReusableSnapshotPayloadForAttach({
        personId: 'p1',
        payload: {
          source_meal_document_id: 'missing-typed',
          typed_components: [{ component_id: 'c1', name: 'Banana' }],
        },
      }),
    ).resolves.toMatchObject({
      cleared_stale_source_meal_document_id: 'missing-typed',
    });
  });

  it('clears only the invalid pointer and preserves embedded composition', () => {
    const cleared = clearStaleSourceMealDocumentPointer(
      {
        source_meal_document_id: '4519ebf7-533a-43f6-a44d-975ad6e7e83e',
        meal_document_snapshot: true,
        items: [{ name: 'Chicken sausage', food_object_id: 'food-sausage' }],
        typed_components: [
          {
            component_id: 'comp-smoothie',
            component_kind: 'recipe_document',
            recipe_meal_document_id: 'recipe-smoothie',
            name: 'Morning Smoothie',
          },
        ],
      },
      '4519ebf7-533a-43f6-a44d-975ad6e7e83e',
      '2026-08-02T00:00:00.000Z',
    );
    expect(cleared.source_meal_document_id).toBeUndefined();
    expect(cleared.cleared_stale_source_meal_document_id).toBe(
      '4519ebf7-533a-43f6-a44d-975ad6e7e83e',
    );
    expect(cleared.attach_compatibility_note).toBe(STALE_POINTER_COMPAT_NOTE);
    expect(cleared.items).toEqual([
      { name: 'Chicken sausage', food_object_id: 'food-sausage' },
    ]);
    expect(cleared.typed_components).toEqual([
      {
        component_id: 'comp-smoothie',
        component_kind: 'recipe_document',
        recipe_meal_document_id: 'recipe-smoothie',
        name: 'Morning Smoothie',
      },
    ]);
  });

  it('clears missing pointer when reusable snapshot payload is present', async () => {
    mockGet.mockResolvedValue(null);
    const prepared = await prepareReusableSnapshotPayloadForAttach({
      personId: '6546a966-c7e5-4f23-b115-22ec4eca1814',
      payload: {
        source_meal_document_id: '4519ebf7-533a-43f6-a44d-975ad6e7e83e',
        meal_document_snapshot: true,
        items: [{ name: 'Chicken sausage', quantity: 1, food_object_id: 'food-sausage' }],
      },
    });
    expect(prepared.source_meal_document_id).toBeUndefined();
    expect(prepared.cleared_stale_source_meal_document_id).toBe(
      '4519ebf7-533a-43f6-a44d-975ad6e7e83e',
    );
    expect(prepared.items).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledWith(
      '6546a966-c7e5-4f23-b115-22ec4eca1814',
      '4519ebf7-533a-43f6-a44d-975ad6e7e83e',
    );
  });

  it('clears cross-person pointer the same way as missing (loader returns null)', async () => {
    mockGet.mockResolvedValue(null);
    const prepared = await prepareReusableSnapshotPayloadForAttach({
      personId: 'person-a',
      payload: {
        source_meal_document_id: 'doc-other-person',
        items: [{ name: 'Oats', quantity: 50, unit: 'g' }],
      },
    });
    expect(prepared.source_meal_document_id).toBeUndefined();
    expect(prepared.cleared_stale_source_meal_document_id).toBe('doc-other-person');
  });

  it('keeps a valid same-person pointer and stamps servings', async () => {
    mockGet.mockResolvedValue({
      id: '738ced73-b79c-4e65-983b-2b8a9b3e4df5',
      lifecycle_state: 'active',
      archived_at: null,
      recipe_yield_servings: 1,
      yield: { servings: 1, confirmed: true },
    });
    const prepared = await prepareReusableSnapshotPayloadForAttach({
      personId: 'p1',
      payload: {
        source_meal_document_id: '738ced73-b79c-4e65-983b-2b8a9b3e4df5',
        meal_document_snapshot: true,
        items: [{ name: 'Banana' }],
        typed_components: [{ component_id: 'c1', name: 'Banana' }],
      },
    });
    expect(prepared).toMatchObject({
      source_meal_document_id: '738ced73-b79c-4e65-983b-2b8a9b3e4df5',
      planned_servings: 1,
      meal_document_snapshot: true,
    });
    expect(prepared.cleared_stale_source_meal_document_id).toBeUndefined();
    expect(prepared.typed_components).toEqual([{ component_id: 'c1', name: 'Banana' }]);
  });

  it('still rejects archived MealDocuments on reusable snapshot attach', async () => {
    mockGet.mockResolvedValue({
      id: 'doc-archived',
      lifecycle_state: 'archived',
      archived_at: '2026-07-01T00:00:00.000Z',
      recipe_yield_servings: 2,
      yield: null,
    });
    await expect(
      prepareReusableSnapshotPayloadForAttach({
        personId: 'p1',
        payload: {
          source_meal_document_id: 'doc-archived',
          meal_document_snapshot: true,
          items: [{ name: 'Egg' }],
        },
      }),
    ).rejects.toThrow(/Archived MealDocuments cannot be newly attached/i);
  });

  it('rejects missing pointer when no embedded composition exists', async () => {
    mockGet.mockResolvedValue(null);
    await expect(
      prepareReusableSnapshotPayloadForAttach({
        personId: 'p1',
        payload: { source_meal_document_id: 'missing-only' },
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('passes through blank / pointerless template meals unchanged', async () => {
    const payload = { items: [{ name: 'Manual oats', quantity: 40, unit: 'g' }] };
    await expect(
      prepareReusableSnapshotPayloadForAttach({ personId: 'p1', payload }),
    ).resolves.toEqual(payload);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
