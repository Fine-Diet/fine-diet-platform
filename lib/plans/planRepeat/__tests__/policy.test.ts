import {
  PLAN_REPEAT_MAX_DESTINATIONS,
  PLAN_REPEAT_POLICY_ID,
  PLAN_REPEAT_POLICY_VERSION,
  canSelectRepeatDestination,
  classifyRepeatOccupancy,
  collectOccupyingMeals,
  destinationKey,
  formatRepeatResultCopy,
  parseRepeatSelectedOpenCommand,
  summarizeRepeatDestinations,
  type PlanRepeatDestinationResult,
} from '../policy';
import type { PlannedMeal, PlanSlot, ResolvedScheduleSlot } from '@/lib/plans/types';

function occasion(key: ResolvedScheduleSlot['key']): ResolvedScheduleSlot {
  return {
    key,
    enabled: true,
    target_time: '12:00',
    label: key === 'lunch' ? 'Lunch' : 'Breakfast',
    slot_block: key === 'lunch' ? 'midday' : 'morning',
    source: 'profile',
  };
}

function meal(args: {
  id: string;
  slotId: string;
  mealType: PlannedMeal['meal_type'];
  documentId?: string | null;
}): PlannedMeal {
  return {
    id: args.id,
    plan_id: 'plan-1',
    plan_day_id: 'day-1',
    plan_slot_id: args.slotId,
    person_id: 'person-1',
    name: 'Bowl',
    meal_type: args.mealType,
    payload: args.documentId ? { source_meal_document_id: args.documentId } : {},
    source_template_id: null,
    source_imported_meal_id: null,
    reusable_provenance: null,
    execution_state: 'pending',
    journal_entry_id: null,
    protein_score_10: null,
    is_main_meal: true,
    psq_multiplier: 1,
    meal_derived_data: {
      protein_score_10: null,
      is_main_meal: true,
      meal_calories: 0,
      meal_protein_g: 0,
      psq_multiplier: 1,
    },
    nds_confidence: 'low',
    nds_version: 'v1',
    classifier_version: 'v1',
    created_at: '2026-08-16T00:00:00.000Z',
    updated_at: '2026-08-16T00:00:00.000Z',
  };
}

function slot(id: string, label: string, time: string): PlanSlot {
  return {
    id,
    plan_day_id: 'day-1',
    person_id: 'person-1',
    slot_ordinal: 1,
    slot_block: 'midday',
    slot_label: label,
    target_time: time,
    created_at: '2026-08-16T00:00:00.000Z',
    updated_at: '2026-08-16T00:00:00.000Z',
  };
}

describe('parseRepeatSelectedOpenCommand', () => {
  it('accepts explicit destinations and dedupes without inventing extras', () => {
    expect(
      parseRepeatSelectedOpenCommand({
        planId: 'plan-1',
        sourcePlannedMealId: 'meal-1',
        destinations: [
          { dateLocal: '2026-08-17', slotKey: 'lunch' },
          { dateLocal: '2026-08-17', slotKey: 'lunch' },
          { dateLocal: '2026-08-18', slotKey: 'dinner' },
        ],
      }),
    ).toEqual({
      planId: 'plan-1',
      sourcePlannedMealId: 'meal-1',
      destinations: [
        { dateLocal: '2026-08-17', slotKey: 'lunch' },
        { dateLocal: '2026-08-18', slotKey: 'dinner' },
      ],
    });
  });

  it('rejects missing source, empty destinations, invalid dates, and unknown keys', () => {
    expect(
      parseRepeatSelectedOpenCommand({
        planId: 'plan-1',
        destinations: [{ dateLocal: '2026-08-17', slotKey: 'lunch' }],
      }),
    ).toBeNull();
    expect(
      parseRepeatSelectedOpenCommand({
        planId: 'plan-1',
        sourcePlannedMealId: 'meal-1',
        destinations: [],
      }),
    ).toBeNull();
    expect(
      parseRepeatSelectedOpenCommand({
        planId: 'plan-1',
        sourcePlannedMealId: 'meal-1',
        destinations: [{ dateLocal: '2026-02-30', slotKey: 'lunch' }],
      }),
    ).toBeNull();
    expect(
      parseRepeatSelectedOpenCommand({
        planId: 'plan-1',
        sourcePlannedMealId: 'meal-1',
        destinations: [{ dateLocal: '2026-08-17', slotKey: 'brunch' }],
      }),
    ).toBeNull();
  });

  it('does not accept more destinations than the week-sized cap', () => {
    const destinations = Array.from({ length: PLAN_REPEAT_MAX_DESTINATIONS + 1 }, (_, index) => ({
      dateLocal: '2026-08-17',
      slotKey: 'lunch',
    }));
    destinations[0] = { dateLocal: '2026-08-17', slotKey: 'lunch' };
    expect(
      parseRepeatSelectedOpenCommand({
        planId: 'plan-1',
        sourcePlannedMealId: 'meal-1',
        destinations,
      }),
    ).toBeNull();
  });
});

describe('canSelectRepeatDestination', () => {
  it('allows only open attachable or ensurable occasions', () => {
    expect(
      canSelectRepeatDestination({ status: 'open', canAttach: true, canEnsure: false }),
    ).toBe(true);
    expect(
      canSelectRepeatDestination({ status: 'open', canAttach: false, canEnsure: true }),
    ).toBe(true);
    expect(
      canSelectRepeatDestination({ status: 'open', canAttach: false, canEnsure: false }),
    ).toBe(false);
    expect(
      canSelectRepeatDestination({ status: 'planned', canAttach: false, canEnsure: false }),
    ).toBe(false);
  });
});

describe('classifyRepeatOccupancy', () => {
  it('treats the same canonical document as reuse and any other planned truth as occupied', () => {
    expect(classifyRepeatOccupancy({ occupyingMeals: [], sourceMealDocumentId: 'doc-1' })).toBe(
      'open',
    );
    expect(
      classifyRepeatOccupancy({
        occupyingMeals: [{ id: 'm1', payload: { source_meal_document_id: 'doc-1' } }],
        sourceMealDocumentId: 'doc-1',
      }),
    ).toBe('reused');
    expect(
      classifyRepeatOccupancy({
        occupyingMeals: [{ id: 'm1', payload: { source_meal_document_id: 'doc-other' } }],
        sourceMealDocumentId: 'doc-1',
      }),
    ).toBe('occupied');
    expect(
      classifyRepeatOccupancy({
        occupyingMeals: [{ id: 'm1', payload: {} }],
        sourceMealDocumentId: 'doc-1',
      }),
    ).toBe('occupied');
  });

  it('lets a foreign meal win over a same-document row on the same occasion', () => {
    expect(
      classifyRepeatOccupancy({
        occupyingMeals: [
          { id: 'm1', payload: { source_meal_document_id: 'doc-1' } },
          { id: 'm2', payload: { source_meal_document_id: 'doc-other' } },
        ],
        sourceMealDocumentId: 'doc-1',
      }),
    ).toBe('occupied');
  });
});

describe('collectOccupyingMeals', () => {
  it('includes schedule-matched meals and any meal already on the destination slot', () => {
    const lunch = occasion('lunch');
    const daySlots = [slot('slot-lunch', 'Lunch', '12:00'), slot('slot-other', 'Dinner', '18:00')];
    const dayMeals = [
      meal({ id: 'matched', slotId: 'slot-lunch', mealType: 'lunch', documentId: 'doc-a' }),
      meal({ id: 'on-slot', slotId: 'slot-lunch', mealType: 'other', documentId: 'doc-b' }),
    ];
    const occupying = collectOccupyingMeals({
      occasion: lunch,
      dayMeals,
      daySlots,
      planSlotId: 'slot-lunch',
    });
    expect(occupying.map((item) => item.id).sort()).toEqual(['matched', 'on-slot']);
  });
});

describe('summarizeRepeatDestinations / formatRepeatResultCopy', () => {
  function dest(
    status: PlanRepeatDestinationResult['status'],
    slotKey: PlanRepeatDestinationResult['slotKey'] = 'lunch',
  ): PlanRepeatDestinationResult {
    return {
      dateLocal: '2026-08-17',
      slotKey,
      status,
      planDayId: null,
      planSlotId: null,
      plannedMealId: null,
    };
  }

  it('marks mixed success as partial and describes skipped occupied destinations', () => {
    const mixed = summarizeRepeatDestinations([
      dest('attached', 'lunch'),
      dest('occupied_skipped', 'dinner'),
    ]);
    expect(mixed).toEqual({
      attachedCount: 1,
      reusedCount: 0,
      occupiedSkippedCount: 1,
      invalidCount: 0,
      failedCount: 0,
      partial: true,
    });
    expect(
      formatRepeatResultCopy({
        planId: 'plan-1',
        sourcePlannedMealId: 'meal-1',
        sourceMealDocumentId: 'doc-1',
        destinations: [dest('attached'), dest('occupied_skipped', 'dinner')],
        ...mixed,
      }),
    ).toBe('Repeated to 1 occasion. Skipped 1 already planned.');
    expect(PLAN_REPEAT_POLICY_ID).toBe('plan-repeat.selected-open');
    expect(PLAN_REPEAT_POLICY_VERSION).toBe('v1');
    expect(destinationKey('2026-08-17', 'lunch')).toBe('2026-08-17:lunch');
  });

  it('does not call all-or-nothing success when every destination is occupied', () => {
    const skipped = summarizeRepeatDestinations([
      dest('occupied_skipped', 'lunch'),
      dest('occupied_skipped', 'dinner'),
    ]);
    expect(skipped.partial).toBe(false);
    expect(skipped.attachedCount).toBe(0);
    expect(
      formatRepeatResultCopy({
        planId: 'plan-1',
        sourcePlannedMealId: 'meal-1',
        sourceMealDocumentId: 'doc-1',
        destinations: [dest('occupied_skipped'), dest('occupied_skipped', 'dinner')],
        ...skipped,
      }),
    ).toBe('Those occasions were already planned. Nothing was overwritten.');
  });
});
