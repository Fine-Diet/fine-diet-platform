import { selectCommittedNutritionEntries } from '../committedNutritionContext';
import type { JournalEntry } from '../types';
import type { ResolvedScheduleSlot } from '@/lib/plans/types';

const slots = [
  {
    key: 'occasion_2',
    label: 'Mini Meal',
    target_time: '06:30',
    enabled: true,
    slot_block: 'morning',
  },
  {
    key: 'occasion_5',
    label: 'Mini Meal',
    target_time: '14:00',
    enabled: true,
    slot_block: 'midday',
  },
] as ResolvedScheduleSlot[];

function entry(
  id: string,
  timestamp: string,
  slotKey?: 'occasion_2' | 'occasion_5',
  mealGroup = false,
): JournalEntry {
  const slot = slots.find((candidate) => candidate.key === slotKey);
  return {
    id,
    type: 'intake',
    timestamp: new Date(timestamp),
    block: new Date(timestamp).getHours() < 12 ? 'morning' : 'midday',
    payload: {
      name: mealGroup ? 'Grouped Meal' : 'Food',
      ...(slot
        ? {
            meal_schedule_context: {
              slot_key: slot.key,
              slot_label: slot.label,
              slot_target_time: slot.target_time,
              assignment_source: 'manual',
              meal_schedule_updated_at: null,
            },
          }
        : {}),
      ...(mealGroup
        ? {
            meal_group: {
              schema_version: 1,
              name: 'Grouped Meal',
              source_meal_document_id: null,
              source_imported_meal_id: null,
              source_planned_meal_id: null,
              source_template_id: null,
              components: [],
              totals: {
                calories: null,
                macros: { protein_g: null, carbs_g: null, fat_g: null },
              },
              planned_servings: null,
              consumed_servings: 1,
              detached_from_source: false,
              needs_review: true,
            },
          }
        : {}),
    },
    created_at: new Date(timestamp),
    updated_at: new Date(timestamp),
  };
}

describe('Packet 15 committed nutrition context hydration', () => {
  it('returns one row per canonical top-level entry, including grouped Meals', () => {
    const values = [
      entry('meal', '2026-09-09T06:30:00', 'occasion_2', true),
      entry('single', '2026-09-09T06:35:00', 'occasion_2'),
    ];
    expect(
      selectCommittedNutritionEntries(
        values,
        { dateKey: '2026-09-09', mealSlotKey: 'occasion_2' },
        slots,
      ).map((value) => value.id),
    ).toEqual(['meal', 'single']);
  });

  it('isolates repeated same-label Mini Meals by structural occasion', () => {
    const values = [
      entry('early', '2026-09-09T06:30:00', 'occasion_2'),
      entry('late', '2026-09-09T14:00:00', 'occasion_5'),
    ];
    expect(
      selectCommittedNutritionEntries(
        values,
        { dateKey: '2026-09-09', mealSlotKey: 'occasion_2' },
        slots,
      ).map((value) => value.id),
    ).toEqual(['early']);
    expect(
      selectCommittedNutritionEntries(
        values,
        { dateKey: '2026-09-09', mealSlotKey: 'occasion_5' },
        slots,
      ).map((value) => value.id),
    ).toEqual(['late']);
  });

  it('uses only the supplied block for an ambiguous legacy URL', () => {
    const values = [
      entry('early', '2026-09-09T06:30:00', 'occasion_2'),
      entry('late', '2026-09-09T14:00:00', 'occasion_5'),
    ];
    expect(
      selectCommittedNutritionEntries(
        values,
        { dateKey: '2026-09-09', block: 'morning' },
        slots,
      ).map((value) => value.id),
    ).toEqual(['early']);
  });

  it('never leaks entries across dates or an unknown explicit occasion', () => {
    const values = [
      entry('today', '2026-09-09T06:30:00', 'occasion_2'),
      entry('tomorrow', '2026-09-10T06:30:00', 'occasion_2'),
    ];
    expect(
      selectCommittedNutritionEntries(
        values,
        { dateKey: '2026-09-09', mealSlotKey: 'occasion_8' },
        slots,
      ),
    ).toEqual([]);
  });
});
