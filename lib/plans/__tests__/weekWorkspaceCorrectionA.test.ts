import type { PlanSlot, PlannedMeal } from '@/lib/plans';
import {
  datedDayTemplate,
  defaultWeekPlanName,
  loadWeekNameDraft,
  saveWeekNameDraft,
  summarizeDayOccasions,
  weekNameDraftKey,
} from '@/lib/plans/weekWorkspace';

describe('Packet 18 Correction A Week workspace helpers', () => {
  it('derives the autosaved name from the selected week start', () => {
    expect(defaultWeekPlanName('2026-09-06')).toBe('(Autosaved) Week of Sep 6, 2026');
    expect(defaultWeekPlanName('2026-09-13')).toBe('(Autosaved) Week of Sep 13, 2026');
  });

  it('preserves edited names in a person and week scoped client draft', () => {
    const rows = new Map<string, string>();
    const storage = {
      getItem: (key: string) => rows.get(key) ?? null,
      setItem: (key: string, value: string) => rows.set(key, value),
    };
    saveWeekNameDraft(storage, 'person-1', '2026-09-06', 'Training Week');
    expect(loadWeekNameDraft(storage, 'person-1', '2026-09-06')).toBe('Training Week');
    expect(loadWeekNameDraft(storage, 'person-1', '2026-09-13')).toBeNull();
    expect(weekNameDraftKey('person-1', '2026-09-06')).not.toBe(
      weekNameDraftKey('person-2', '2026-09-06'),
    );
  });

  it('groups multiple composition entries inside one exact occasion', () => {
    const slot = {
      id: 'slot-breakfast',
      plan_day_id: 'day-1',
      person_id: 'person-1',
      slot_block: 'morning',
      slot_ordinal: 1,
      slot_label: 'Breakfast',
      target_time: '08:00',
      created_at: '',
      updated_at: '',
    } as PlanSlot;
    const meal = {
      id: 'meal-1',
      plan_id: 'plan-1',
      plan_day_id: 'day-1',
      plan_slot_id: slot.id,
      person_id: 'person-1',
      name: 'Yogurt bowl',
      meal_type: 'breakfast',
      payload: {
        items: [
          { name: 'Greek yogurt', quantity: 1, unit: 'cup', calories: 180 },
          { name: 'Blueberries', quantity: 0.5, unit: 'cup', calories: 40 },
        ],
        totals: { calories: 220 },
      },
      source_template_id: 'saved-meal-1',
      meal_derived_data: { meal_calories: 220 },
    } as PlannedMeal;

    const result = summarizeDayOccasions([slot], [meal]);
    expect(result).toHaveLength(1);
    expect(result[0]?.meals).toHaveLength(1);
    expect(result[0]?.meals[0]?.kind).toBe('Meal');
    expect(result[0]?.meals[0]?.components).toEqual([
      'Greek yogurt · 1 cup',
      'Blueberries · 0.5 cup',
    ]);
    expect(result[0]?.calories).toBe(220);
  });

  it('hydrates an occupied dated snapshot without turning it into its reusable source', () => {
    const day = {
      id: 'day-1',
      plan_id: 'plan-1',
      person_id: 'person-1',
      date_local: '2026-09-06',
      created_at: '',
      updated_at: 'v1',
    } as Parameters<typeof datedDayTemplate>[0];
    const slot = {
      id: 'slot-1',
      plan_day_id: day.id,
      person_id: day.person_id,
      slot_ordinal: 1,
      slot_block: 'morning',
      slot_label: 'Breakfast',
      target_time: null,
      created_at: '',
      updated_at: '',
    } as PlanSlot;
    const meal = {
      id: 'dated-meal-1',
      plan_id: day.plan_id,
      plan_day_id: day.id,
      plan_slot_id: slot.id,
      person_id: day.person_id,
      name: 'Applied breakfast',
      meal_type: 'breakfast',
      payload: { totals: { calories: 400 } },
      source_template_id: 'reusable-meal-source',
    } as PlannedMeal;

    const snapshot = datedDayTemplate(day, [slot], [meal]);
    expect(snapshot.id).toBe('');
    expect(snapshot.source_plan_day_id).toBe(day.id);
    expect(snapshot.slots[0]?.source_plan_slot_id).toBe(slot.id);
    expect(snapshot.slots[0]?.meals[0]?.source_planned_meal_id).toBe(meal.id);
    expect(snapshot.slots[0]?.meals[0]?.source_template_id).toBe(
      'reusable-meal-source',
    );
  });
});
