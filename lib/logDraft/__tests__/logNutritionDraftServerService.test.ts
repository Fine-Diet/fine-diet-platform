const mockGetEntriesByIds = jest.fn();
const mockInsertPrepared = jest.fn();
const mockPrepare = jest.fn();
const mockDeleteEntries = jest.fn();
const mockGetPlannedMeal = jest.fn();
const mockClaimPlannedMealJournalLink = jest.fn();

jest.mock('@/lib/journal/journalServerService', () => ({
  getEntriesByIds: (...args: unknown[]) => mockGetEntriesByIds(...args),
  insertPreparedJournalEntries: (...args: unknown[]) => mockInsertPrepared(...args),
  prepareJournalEntryInsert: (...args: unknown[]) => mockPrepare(...args),
  deleteEntries: (...args: unknown[]) => mockDeleteEntries(...args),
}));

jest.mock('@/lib/plans/planServerService', () => ({
  getPlannedMeal: (...args: unknown[]) => mockGetPlannedMeal(...args),
  claimPlannedMealJournalLink: (...args: unknown[]) =>
    mockClaimPlannedMealJournalLink(...args),
}));

import {
  commitLogNutritionDraft,
  LogNutritionDraftCommitValidationError,
  type LogNutritionDraftCommitInput,
} from '@/lib/logDraft/logNutritionDraftServerService';

const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENTRY_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ENTRY_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function input(entries = [ENTRY_A, ENTRY_B]): LogNutritionDraftCommitInput {
  return {
    sessionId: SESSION_ID,
    occurredAt: '2026-09-09T13:00:00.000Z',
    entries: entries.map((draftEntryId, index) => ({
      draftEntryId,
      payload: {
        name: `Food ${index + 1}`,
        quantity: 1,
        unit: 'serving',
        calories: 100,
      },
    })),
  };
}

function entryFromPrepared(prepared: Record<string, unknown>) {
  return {
    id: prepared.id,
    type: 'intake',
    timestamp: new Date(prepared.occurred_at as string),
    block: 'morning',
    payload: prepared.payload,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

describe('commitLogNutritionDraft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEntriesByIds.mockResolvedValue([]);
    mockPrepare.mockImplementation(async (args: Record<string, unknown>) => ({
      id: args.id,
      person_id: args.personId,
      entry_type: 'intake',
      occurred_at: (args.occurredAt as Date).toISOString(),
      payload: args.payload,
      quantity_g: null,
      protein_score_10: null,
      is_main_meal: false,
      meal_derived_data: null,
    }));
    mockInsertPrepared.mockImplementation(async (prepared: Record<string, unknown>[]) =>
      prepared.map(entryFromPrepared),
    );
    mockDeleteEntries.mockResolvedValue(undefined);
  });

  it('prepares every row before one batch insert and creates N canonical entries', async () => {
    const result = await commitLogNutritionDraft('person-a', input());
    expect(mockPrepare).toHaveBeenCalledTimes(2);
    expect(mockInsertPrepared).toHaveBeenCalledTimes(1);
    expect(mockInsertPrepared.mock.calls[0][0]).toHaveLength(2);
    expect(result.entries).toHaveLength(2);
    expect(
      result.entries.every(
        (entry) => entry.payload.log_draft_session_id === SESSION_ID,
      ),
    ).toBe(true);
  });

  it('rejects the complete request before any write when request validation fails', async () => {
    await expect(
      commitLogNutritionDraft('person-a', { ...input(), sessionId: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(LogNutritionDraftCommitValidationError);
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(mockInsertPrepared).not.toHaveBeenCalled();
  });

  it('creates zero rows when any entry payload fails shared preparation', async () => {
    mockPrepare
      .mockResolvedValueOnce({
        id: 'prepared-first',
        person_id: 'person-a',
        entry_type: 'intake',
        occurred_at: '2026-09-09T13:00:00.000Z',
        payload: {},
      })
      .mockRejectedValueOnce(new Error('quantity: invalid'));
    await expect(commitLogNutritionDraft('person-a', input())).rejects.toBeInstanceOf(
      LogNutritionDraftCommitValidationError,
    );
    expect(mockInsertPrepared).not.toHaveBeenCalled();
  });

  it('returns an existing deterministic batch on retry instead of duplicating it', async () => {
    mockGetEntriesByIds.mockImplementation(
      async (_personId: string, ids: string[]) =>
        ids.map((id, index) => ({
          id,
          type: 'intake',
          timestamp: new Date(),
          block: 'morning',
          payload: {
            name: `Food ${index + 1}`,
            log_draft_session_id: SESSION_ID,
          },
          created_at: new Date(),
          updated_at: new Date(),
        })),
    );
    const result = await commitLogNutritionDraft('person-a', input());
    expect(result.alreadyCommitted).toBe(true);
    expect(result.entries).toHaveLength(2);
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(mockInsertPrepared).not.toHaveBeenCalled();
  });

  it('compensates the whole inserted batch if planned execution cannot link', async () => {
    const plannedMealId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const pendingMeal = {
      id: plannedMealId,
      execution_state: 'pending',
      journal_entry_id: null,
      name: 'Plan meal',
      payload: {},
    };
    mockGetPlannedMeal.mockResolvedValue(pendingMeal);
    mockClaimPlannedMealJournalLink.mockResolvedValue(null);
    const plannedInput = input([ENTRY_A]);
    plannedInput.entries[0] = {
      draftEntryId: ENTRY_A,
      plannedMealId,
      plannedMode: 'exact',
      payload: {
        name: 'Plan meal',
        quantity: 1,
        unit: 'serving',
        meal_schedule_context: {
          slot_key: 'occasion_1',
          slot_label: 'Breakfast',
          slot_target_time: '08:00',
          assignment_source: 'auto',
          meal_schedule_updated_at: null,
        },
      },
    };

    await expect(commitLogNutritionDraft('person-a', plannedInput)).rejects.toThrow(
      'Failed to link planned meal',
    );
    expect(mockDeleteEntries).toHaveBeenCalledTimes(1);
    expect(mockDeleteEntries.mock.calls[0][1]).toHaveLength(1);
  });

  it('links only the staged planned Meal while extra Single Items remain actual-only', async () => {
    const plannedMealId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const pendingMeal = {
      id: plannedMealId,
      execution_state: 'pending',
      journal_entry_id: null,
      name: 'Plan meal',
      meal_type: 'breakfast',
      payload: {},
      source_template_id: null,
      source_imported_meal_id: null,
      protein_score_10: null,
      is_main_meal: false,
      psq_multiplier: 1,
      meal_derived_data: {},
      nds_confidence: 'low',
      nds_version: 'test',
      classifier_version: 'test',
      created_at: '',
      updated_at: '',
    };
    mockGetPlannedMeal.mockResolvedValue(pendingMeal);
    mockClaimPlannedMealJournalLink.mockResolvedValue({
      ...pendingMeal,
      execution_state: 'eaten',
    });
    const plannedInput = input();
    plannedInput.entries[0] = {
      draftEntryId: ENTRY_A,
      plannedMealId,
      plannedMode: 'exact',
      payload: { name: 'Plan meal', quantity: 1, unit: 'serving' },
    };

    const result = await commitLogNutritionDraft('person-a', plannedInput);
    expect(result.entries).toHaveLength(2);
    expect(mockClaimPlannedMealJournalLink).toHaveBeenCalledTimes(1);
    expect(mockClaimPlannedMealJournalLink.mock.calls[0][1]).toBe(plannedMealId);
    const prepared = mockInsertPrepared.mock.calls[0][0] as Array<{
      payload: Record<string, unknown>;
    }>;
    expect(prepared[0].payload.source_planned_meal_id).toBe(plannedMealId);
    expect(prepared[1].payload.source_planned_meal_id).toBeUndefined();
  });
});
