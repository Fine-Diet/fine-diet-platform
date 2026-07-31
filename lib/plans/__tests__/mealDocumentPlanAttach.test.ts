import {
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
import { preparePlannedMealPayloadForAttach } from '../mealDocumentPlanAttach';

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
});
