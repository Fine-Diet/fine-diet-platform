import {
  classifyRepeatOccupancy,
  remainingMealsAfterRepeatRaces,
  resolveRepeatInsertRace,
  summarizeRepeatDestinations,
  type PlanRepeatDestinationResult,
  type RepeatRaceRow,
} from '../policy';

function row(args: {
  id: string;
  created_at: string;
  documentId?: string | null;
}): RepeatRaceRow {
  return {
    id: args.id,
    created_at: args.created_at,
    payload: args.documentId ? { source_meal_document_id: args.documentId } : {},
  };
}

function dest(
  status: PlanRepeatDestinationResult['status'],
  slotKey: PlanRepeatDestinationResult['slotKey'] = 'lunch',
): PlanRepeatDestinationResult {
  return {
    dateLocal: '2026-08-17',
    slotKey,
    status,
    planDayId: 'day-1',
    planSlotId: 'slot-1',
    plannedMealId: status === 'attached' || status === 'reused' ? 'meal-out' : null,
  };
}

describe('Packet 8 destination race convergence', () => {
  it('keeps exactly one attachment when two same-source inserts land together', () => {
    const occupying = [
      row({ id: 'insert-a', created_at: '2026-08-17T03:00:00.000Z', documentId: 'doc-1' }),
      row({ id: 'insert-b', created_at: '2026-08-17T03:00:00.100Z', documentId: 'doc-1' }),
    ];
    const converged = remainingMealsAfterRepeatRaces({
      occupyingMeals: occupying,
      inserts: [
        { insertedMealId: 'insert-a', sourceMealDocumentId: 'doc-1' },
        { insertedMealId: 'insert-b', sourceMealDocumentId: 'doc-1' },
      ],
    });
    expect(converged.remainingIds).toEqual(['insert-a']);
    expect(converged.deletedIds).toEqual(['insert-b']);
    expect(converged.outcomes[0]?.resolution).toEqual({
      action: 'keep_attached',
      winnerMealId: 'insert-a',
      deleteMealId: null,
    });
    expect(converged.outcomes[1]?.resolution).toEqual({
      action: 'delete_inserted_and_reuse',
      winnerMealId: 'insert-a',
      deleteMealId: 'insert-b',
    });
  });

  it('does not let two different-source inserts both delete themselves', () => {
    const occupying = [
      row({ id: 'insert-a', created_at: '2026-08-17T03:00:00.000Z', documentId: 'doc-a' }),
      row({ id: 'insert-b', created_at: '2026-08-17T03:00:00.100Z', documentId: 'doc-b' }),
    ];
    const converged = remainingMealsAfterRepeatRaces({
      occupyingMeals: occupying,
      inserts: [
        { insertedMealId: 'insert-a', sourceMealDocumentId: 'doc-a' },
        { insertedMealId: 'insert-b', sourceMealDocumentId: 'doc-b' },
      ],
    });
    expect(converged.remainingIds).toEqual(['insert-a']);
    expect(converged.deletedIds).toEqual(['insert-b']);
    expect(converged.outcomes[1]?.resolution.action).toBe('delete_inserted_and_skip');
    expect(converged.outcomes[0]?.resolution.deleteMealId).toBeNull();
  });

  it('leaves a pre-existing different occupant untouched', () => {
    const occupying = [
      row({ id: 'preexisting', created_at: '2026-08-16T12:00:00.000Z', documentId: 'doc-other' }),
      row({ id: 'insert-a', created_at: '2026-08-17T03:00:00.000Z', documentId: 'doc-1' }),
    ];
    const race = resolveRepeatInsertRace({
      insertedMealId: 'insert-a',
      occupyingMeals: occupying,
      sourceMealDocumentId: 'doc-1',
    });
    expect(race).toEqual({
      action: 'delete_inserted_and_skip',
      winnerMealId: 'preexisting',
      deleteMealId: 'insert-a',
    });
    const converged = remainingMealsAfterRepeatRaces({
      occupyingMeals: occupying,
      inserts: [{ insertedMealId: 'insert-a', sourceMealDocumentId: 'doc-1' }],
    });
    expect(converged.remainingIds).toEqual(['preexisting']);
    expect(converged.deletedIds).not.toContain('preexisting');
  });

  it('reports reused on retry after a prior successful same-source attach', () => {
    const existing = [{ id: 'planned-1', payload: { source_meal_document_id: 'doc-1' } }];
    expect(
      classifyRepeatOccupancy({
        occupyingMeals: existing,
        sourceMealDocumentId: 'doc-1',
      }),
    ).toBe('reused');
    const duplicateRace = remainingMealsAfterRepeatRaces({
      occupyingMeals: [
        row({ id: 'planned-1', created_at: '2026-08-17T02:00:00.000Z', documentId: 'doc-1' }),
        row({ id: 'retry-insert', created_at: '2026-08-17T03:00:00.000Z', documentId: 'doc-1' }),
      ],
      inserts: [{ insertedMealId: 'retry-insert', sourceMealDocumentId: 'doc-1' }],
    });
    expect(duplicateRace.remainingIds).toEqual(['planned-1']);
    expect(duplicateRace.outcomes[0]?.resolution.action).toBe('delete_inserted_and_reuse');
  });

  it('keeps partial-success reporting truthful after a mixed race and skip', () => {
    const summary = summarizeRepeatDestinations([
      dest('attached', 'lunch'),
      dest('occupied_skipped', 'dinner'),
      dest('reused', 'breakfast'),
    ]);
    expect(summary).toEqual({
      attachedCount: 1,
      reusedCount: 1,
      occupiedSkippedCount: 1,
      invalidCount: 0,
      failedCount: 0,
      partial: true,
    });
  });

  it('breaks created_at ties with meal id so one winner remains', () => {
    const occupying = [
      row({ id: 'meal-z', created_at: '2026-08-17T03:00:00.000Z', documentId: 'doc-1' }),
      row({ id: 'meal-a', created_at: '2026-08-17T03:00:00.000Z', documentId: 'doc-1' }),
    ];
    const converged = remainingMealsAfterRepeatRaces({
      occupyingMeals: occupying,
      inserts: [
        { insertedMealId: 'meal-z', sourceMealDocumentId: 'doc-1' },
        { insertedMealId: 'meal-a', sourceMealDocumentId: 'doc-1' },
      ],
    });
    expect(converged.remainingIds).toEqual(['meal-a']);
    expect(converged.deletedIds).toEqual(['meal-z']);
  });
});
