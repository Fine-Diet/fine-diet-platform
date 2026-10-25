/** @jest-environment jsdom */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { JournalEntry } from '@/lib/journal/types';

type TestPayload = Record<string, unknown> & {
  macros?: Record<string, unknown>;
  nutrition_basis?: string;
  foodObjectId?: string;
  consumed_nutrition_evidence?: Record<string, unknown>;
};
type MockUpdateArgs = {
  payload: TestPayload;
  quantityG?: number;
  replacePayload?: boolean;
};
type SavedRow = Omit<JournalEntry, 'payload'> & { payload: TestPayload };

const mockSearch = jest.fn<(
  query: string,
  options: Record<string, unknown>,
) => Promise<{ results: LogSearchResult[] }>>();
const mockListEntries = jest.fn<() => Promise<JournalEntry[]>>();
const mockUpdateEntry = jest.fn<
  (id: string, args: MockUpdateArgs) => Promise<JournalEntry | null>
>();
const mockEntry: { current: JournalEntry | null } = { current: null };
const mockSavedRow: { current: SavedRow | null } = { current: null };
const mockRouter = { isReady: true, query: {} as Record<string, unknown> };

jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('@/components/layout/SignedInPageShell', () => ({
  SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS: '',
}));
jest.mock('@/components/journal/log/PlannedMealContextCard', () => ({
  PlannedMealContextCard: () => null,
}));
jest.mock('@/components/journal/log/AddToLogPanel', () => ({
  isSupportedMealResult: () => true,
}));
jest.mock('@/lib/food', () => ({
  foodService: { createCustomFood: jest.fn(), lookupUpc: jest.fn() },
}));
jest.mock('@/lib/journal', () => ({
  journalService: {
    listEntriesByDay: () => mockListEntries(),
    updateEntry: (id: string, args: MockUpdateArgs) => mockUpdateEntry(id, args),
    deleteEntry: jest.fn(),
    updateGroupedMealInstance: jest.fn(),
    commitNutritionDraft: jest.fn(),
  },
  formatTime: () => '6:00 PM',
  parseLocalDate: () => new Date('2026-10-19T00:00:00.000Z'),
  setTimeOnDate: (date: Date) => date,
  toDateKey: () => '2026-10-19',
}));
jest.mock('@/lib/journal/committedNutritionContext', () => ({
  selectCommittedNutritionEntries: () => mockEntry.current ? [mockEntry.current] : [],
}));
jest.mock('@/lib/journal/mealScheduleAssignment', () => ({
  buildMealScheduleContext: () => null,
  getEnabledMealSlots: () => [],
  getMealSlotForEntry: () => null,
  isMealSlotKey: () => false,
  resolveMealSlotQueryParam: () => null,
}));
jest.mock('@/lib/logSearch/logSearchService', () => ({
  logSearchService: {
    search: (query: string, options: Record<string, unknown>) =>
      mockSearch(query, options),
  },
}));
jest.mock('@/lib/plans/scheduleResolver', () => ({
  defaultMealSchedule: () => ({ slots: [] }),
  normalizeMealSchedule: () => ({ slots: [] }),
}));
jest.mock('@/lib/plans/plannedMealLogRoute', () => ({
  buildOrdinaryLogHref: () => '/app/log/new',
  isPlannedMealAdjustLogContext: () => false,
  parsePlannedMealLogQuery: () => ({}),
}));
jest.mock('@/lib/logDraft/plannedMealDraftStaging', () => ({
  exactPendingPlannedMealDraftEntry: () => null,
  retireConsumedPlannedMealDraftContext: jest.fn(),
}));
jest.mock('@/lib/meals/loggedMealGroup', () => ({
  buildGroupedMealView: () => null,
  hasMealGroupPayload: () => false,
}));
jest.mock('@/lib/meals/loggedMealGroupDocument', () => ({
  mealDocumentFromLoggedGroup: jest.fn(),
}));
jest.mock('@/lib/meals/recompute', () => ({
  scaleTopLevelMealNutrition: () => null,
}));
jest.mock('@/lib/meals/composer/submission', () => ({
  buildStructuralEditPatch: () => ({}),
}));
jest.mock('@/components/meals/composer/MealComposer', () => ({ MealComposer: () => null }));
jest.mock('@/components/meals/composer/useMealComposer', () => ({
  useMealComposer: () => ({
    state: { document: {}, consumedServingsInput: '1', instanceNote: '' },
    dispatch: jest.fn(),
  }),
}));
jest.mock('@/lib/routes/appRoutes', () => ({ APP_ROUTES: { logNew: '/app/log/new' } }));

import LogNutritionDraftPage from '../LogNutritionDraftPage';
import { normalizeConsumedEntry } from '@/lib/nds/consumedInputs/normalizeConsumedEntry';
import type { LogSearchResult } from '@/lib/logSearch/types';

function foodResult(fiberG: number | null = 3): LogSearchResult {
  const food = {
    id: 'lentils-new',
    canonicalName: 'Lentils, Cooked',
    brandName: null,
    aliases: [],
    sourceType: 'usda_common',
    sourceProvider: 'usda',
    sourceId: 'lentils-new',
    sourceDataset: 'sr_legacy',
    upc: null,
    servingSizeG: 100,
    servingUnit: 'serving',
    servingDescription: null,
    householdServingText: null,
    measures: [{ unit: 'g', grams: 1 }],
    calories: 200,
    proteinG: 10,
    carbsG: 30,
    fatG: 2,
    fiberG,
    sugarG: 14,
    sodiumMg: null,
    nutrientsExtended: {},
    nutrientProvenance: 'usda',
    nutrientConfidence: 'high',
    personId: null,
    isVerified: true,
    imageUrl: null,
    category: null,
    tags: [],
  };
  return {
    kind: 'food',
    id: 'lentils-new',
    title: 'Lentils, Cooked',
    sourceSection: 'common',
    badges: [],
    loggableShape: 'single_item',
    food: {
      food,
      group: 'common',
      score: 1,
      isFavorite: false,
      logCount: 0,
      rankingSignals: { nutritionBasis: 'per_serving' },
    },
  } as unknown as LogSearchResult;
}

describe('/app/log/new mounted correction flow', () => {
  let container: HTMLDivElement;
  let root: Root;
  async function searchFor(input: HTMLInputElement, query: string) {
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setValue?.call(input, query);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 275));
      await Promise.resolve();
    });
  }

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 0);
    jest.clearAllMocks();
    mockSavedRow.current = null;
    mockRouter.isReady = true;
    mockRouter.query = {};
    mockEntry.current = {
      id: 'entry-1',
      type: 'intake',
      timestamp: new Date('2026-10-19T18:00:00.000Z'),
      block: 'evening',
      payload: {
        name: 'Broccoli',
        quantity: 0.5,
        unit: 'g',
        calories: 30,
        macros: {
          protein: 2,
          carbs: 6,
          fat: 0.3,
          fiber_g: 2,
          added_sugar_g: 5,
          added_sugar_provenance: 'authored',
        },
        added_sugar_provenance: 'authored',
        foodObjectId: 'broccoli-old',
        servingSizeG: 100,
        measures: [{ unit: 'g', grams: 1 }],
        nutrition_basis: 'per_serving',
        consumed_nutrition_evidence: {
          schema_version: 'nds_consumed_evidence_2026-09-13.v1',
          lineage: 'write_time_capture',
          food_object_id: 'broccoli-old',
          catalog_version: null,
          quantity: 0.5,
          unit: 'g',
          quantity_g: 50,
          quantity_conversion: 'exact',
          calories: 30,
          protein_g: 2,
          fiber_g: 1,
          added_sugar_g: null,
          added_sugar_provenance: 'unknown',
          nutrient_basis: 'per_serving',
        },
      },
      quantityG: 50,
      created_at: new Date('2026-10-19T18:00:00.000Z'),
      updated_at: new Date('2026-10-19T18:00:00.000Z'),
    };
    const current = mockEntry.current;
    if (!current) throw new Error('Missing mock journal entry.');
    mockListEntries.mockResolvedValue([current]);
    mockSearch.mockResolvedValue({ results: [foodResult()] });
    mockUpdateEntry.mockImplementation(async (_id, args) => {
      const current = mockEntry.current;
      if (!current) throw new Error('Missing mock journal entry.');
      const payload = {
        ...args.payload,
        quantity: 0.5,
        consumed_nutrition_evidence: {
          schema_version: 'nds_consumed_evidence_2026-09-13.v1',
          lineage: 'write_time_capture',
          food_object_id: args.payload.foodObjectId ?? null,
          catalog_version: null,
          quantity: 0.5,
          unit: 'g',
          quantity_g: 50,
          quantity_conversion: 'exact',
          calories: args.payload.calories,
          protein_g: args.payload.macros?.protein ?? null,
          fiber_g: args.payload.macros?.fiber_g ?? null,
          added_sugar_g: args.payload.macros?.added_sugar_g ?? null,
          added_sugar_provenance:
            args.payload.macros?.added_sugar_provenance ??
            args.payload.added_sugar_provenance ??
            'unknown',
          nutrient_basis: args.payload.nutrition_basis ?? null,
        },
      };
      const savedRow: SavedRow = {
        ...current,
        payload,
        quantityG: 50,
        updated_at: new Date('2026-10-19T18:05:00.000Z'),
      };
      mockSavedRow.current = savedRow;
      mockEntry.current = savedRow;
      return savedRow;
    });
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: { person_id: 'person-1' } }),
    } as Response);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<LogNutritionDraftPage />));
    await act(async () => Promise.resolve());
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    global.fetch = originalFetch;
  });

  const originalFetch = global.fetch;

  function savedRow(): SavedRow {
    const current = mockSavedRow.current;
    if (!current) throw new Error('Mock journal row has not been saved.');
    return current;
  }

  it('mounts Log Replace → select → save, preserves 50 g, replaces identity and normalizes the saved row', async () => {
    const edit = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Broccoli'),
    );
    expect(edit).toBeTruthy();
    await act(async () => edit!.click());

    const replace = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Replace item'),
    );
    await act(async () => replace!.click());
    const search = container.querySelector<HTMLInputElement>('input[placeholder="Search foods"]')!;
    await searchFor(search, 'lentils');
    const result = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Lentils, Cooked'),
    );
    expect(result).toBeTruthy();
    await act(async () => result!.click());

    const quantity = container.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(quantity.value).toBe('50');
    expect(document.activeElement).toBe(quantity);
    const save = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save changes'),
    );
    await act(async () => save!.click());

    expect(mockUpdateEntry).toHaveBeenCalledWith('entry-1', expect.objectContaining({
      replacePayload: true,
      quantityG: 50,
      payload: expect.objectContaining({
        name: 'Lentils, Cooked',
        foodObjectId: 'lentils-new',
        quantity: 50,
        unit: 'g',
        nutrition_basis: 'per_serving',
        macros: expect.objectContaining({ fiber_g: 3 }),
      }),
    }));
    const savedMacros = mockUpdateEntry.mock.calls[0][1].payload.macros;
    expect(savedMacros).not.toHaveProperty('added_sugar_g');
    expect(savedMacros).not.toHaveProperty('added_sugar_provenance');
    expect(savedRow().payload.consumed_nutrition_evidence?.food_object_id).toBe('lentils-new');
    expect(savedRow().payload.consumed_nutrition_evidence?.food_object_id).not.toBe('broccoli-old');

    const normalized = normalizeConsumedEntry({
      id: savedRow().id,
      person_id: 'person-1',
      entry_type: 'intake',
      occurred_at: savedRow().timestamp.toISOString(),
      payload: savedRow().payload,
      quantity_g: savedRow().quantityG,
    });
    expect(normalized?.quantityBasis.consumedGrams).toBe(50);
    expect(normalized?.calories.value).toBe(100);
    expect(normalized?.protein_g.value).toBe(5);
    expect(normalized?.fiber_g.availability).toBe('known');
    expect(normalized?.fiber_g.value).toBe(1.5);
    expect(normalized?.added_sugar_g.availability).toBe('unknown');
    expect(normalized?.components[0]?.foodObjectId).toBe('lentils-new');
  });

  it('keeps replacement fiber unknown when the selected catalog food has no fiber value', async () => {
    const edit = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Broccoli'),
    );
    await act(async () => edit!.click());
    const replace = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Replace item'),
    );
    await act(async () => replace!.click());
    mockSearch.mockResolvedValueOnce({ results: [foodResult(null)] });
    const search = container.querySelector<HTMLInputElement>('input[placeholder="Search foods"]')!;
    await searchFor(search, 'lentils unknown fiber');
    const result = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Lentils, Cooked'),
    );
    expect(result).toBeTruthy();
    await act(async () => result!.click());

    const save = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save changes'),
    );
    await act(async () => save!.click());

    const payload = mockUpdateEntry.mock.calls[0][1].payload;
    expect(payload.macros).not.toHaveProperty('fiber_g');
    expect(payload.macros).not.toHaveProperty('added_sugar_g');
    expect(payload.macros).not.toHaveProperty('added_sugar_provenance');
    const normalized = normalizeConsumedEntry({
      id: savedRow().id,
      person_id: 'person-1',
      entry_type: 'intake',
      occurred_at: savedRow().timestamp.toISOString(),
      payload: savedRow().payload,
      quantity_g: savedRow().quantityG,
    });
    expect(normalized?.fiber_g.availability).toBe('unknown');
    expect(normalized?.added_sugar_g.availability).toBe('unknown');
  });

  it('shows an existing save error after selecting a replacement', async () => {
    const edit = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Broccoli'),
    );
    await act(async () => edit!.click());
    const replace = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Replace item'),
    );
    await act(async () => replace!.click());
    const input = container.querySelector<HTMLInputElement>('input[placeholder="Search foods"]')!;

    mockSearch.mockResolvedValueOnce({ results: [foodResult()] });
    await searchFor(input, 'lentils');
    const result = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Lentils, Cooked'),
    );
    await act(async () => result!.click());

    mockUpdateEntry.mockRejectedValueOnce(new Error('save failed after selection'));
    const save = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Save changes'),
    );
    await act(async () => save!.click());
    expect(container.textContent).toContain('save failed after selection');
  });

});
