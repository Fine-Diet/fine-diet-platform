import {
  applyReusableDayPlan,
  embeddedDayPlanDraftId,
  saveDatedDayPlan,
} from '../dayPlanActions';
import type { PlanDay, PlanDayTemplate, PlannedMeal } from '../types';

function template(overrides: Partial<PlanDayTemplate> = {}): PlanDayTemplate {
  return {
    id: '',
    person_id: 'person-1',
    name: 'Unnamed Day Plan',
    scope: 'day',
    source_plan_id: '',
    source_plan_day_id: 'draft',
    source_date_local: '',
    slots: [],
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('Packet 19 Correction A shared Day actions', () => {
  it('isolates embedded draft keys between Week and Month contexts', () => {
    expect(embeddedDayPlanDraftId('week', '2026-10-05')).toBe('week-date:2026-10-05');
    expect(embeddedDayPlanDraftId('month', '2026-10-05')).toBe('month-date:2026-10-05');
    expect(embeddedDayPlanDraftId('week', '2026-10-05')).not.toBe(
      embeddedDayPlanDraftId('month', '2026-10-05'),
    );
  });

  it('returns cancelled without applying when append confirmation is declined', async () => {
    const instantiate = jest
      .fn()
      .mockRejectedValueOnce(new Error('Date already has meals. Confirm append?'));
    const outcome = await applyReusableDayPlan({
      services: {
        instantiatePlanDayTemplate: instantiate,
        savePlanDayTemplate: jest.fn(),
        deleteMeal: jest.fn(),
        updateMeal: jest.fn(),
        createMeal: jest.fn(),
      },
      templateId: 'template-1',
      dateLocal: '2026-10-05',
      confirmAppend: () => false,
    });
    expect(outcome).toBe('cancelled');
    expect(instantiate).toHaveBeenCalledTimes(1);
  });

  it('preserves unassigned meals when saving a dated Day snapshot', async () => {
    const planDay = {
      id: 'day-1',
      plan_id: 'plan-1',
      person_id: 'person-1',
      date_local: '2026-10-05',
    } as PlanDay;
    const existingMeals = [
      {
        id: 'meal-slot',
        plan_id: 'plan-1',
        plan_day_id: 'day-1',
        plan_slot_id: 'slot-1',
        person_id: 'person-1',
        name: 'Breakfast',
        execution_state: 'pending',
      },
      {
        id: 'meal-unassigned',
        plan_id: 'plan-1',
        plan_day_id: 'day-1',
        plan_slot_id: null,
        person_id: 'person-1',
        name: 'Legacy snack',
        execution_state: 'pending',
      },
    ] as PlannedMeal[];
    const deleteMeal = jest.fn().mockResolvedValue(undefined);
    const updateMeal = jest.fn().mockResolvedValue(undefined);
    const createMeal = jest.fn().mockResolvedValue(undefined);

    await saveDatedDayPlan({
      services: {
        instantiatePlanDayTemplate: jest.fn(),
        savePlanDayTemplate: jest.fn(),
        deleteMeal,
        updateMeal,
        createMeal,
      },
      draft: template({
        slots: [{
          source_plan_slot_id: 'slot-1',
          slot_ordinal: 1,
          slot_block: 'morning',
          slot_label: 'Breakfast',
          target_time: '08:00',
          meals: [{
            source_planned_meal_id: 'meal-slot',
            name: 'Breakfast',
            meal_type: 'meal',
            payload: {},
          }],
        }],
        unassigned_meals: [{
          source_planned_meal_id: 'meal-unassigned',
          name: 'Legacy snack',
          meal_type: 'meal',
          payload: {},
        }],
      }),
      dateLocal: '2026-10-05',
      planDays: [planDay],
      meals: existingMeals,
    });

    expect(deleteMeal).not.toHaveBeenCalled();
    expect(updateMeal).toHaveBeenCalledTimes(2);
  });
});
