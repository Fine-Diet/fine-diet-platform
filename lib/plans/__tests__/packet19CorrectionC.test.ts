import {
  saveDatedDayPlan,
  validateDatedDayDraftMembership,
} from '../dayPlanActions';
import { buildTemplateMealFromDocument } from '../reusableAuthoringHelpers';
import type { MealDocument } from '@/lib/meals/types';
import type { PlanDay, PlanDayTemplate, PlanDayTemplateMeal, PlannedMeal, PlanSlot } from '../types';

function mealDocument(title: string): MealDocument {
  return {
    schema_version: 'meal.v1',
    id: 'doc-local-new',
    person_id: 'person-1',
    kind: 'meal',
    review_state: 'confirmed',
    title,
    description: null,
    intents: [],
    meal_type_hint: 'breakfast',
    components: [],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: null,
    totals: null,
    nds: null,
    source: null,
    provenance: null,
  };
}

function datedTemplate(overrides: Partial<PlanDayTemplate> = {}): PlanDayTemplate {
  return {
    id: '',
    person_id: 'person-1',
    name: 'Dated Day',
    scope: 'day',
    source_plan_id: 'plan-1',
    source_plan_day_id: 'day-1',
    source_date_local: '2026-10-05',
    slots: [],
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function emptyBreakfastSlot(meals: PlanDayTemplateMeal[] = []) {
  return {
    source_plan_slot_id: 'slot-1',
    slot_ordinal: 1,
    slot_block: 'morning' as const,
    slot_label: 'Breakfast',
    target_time: '08:00',
    meals,
  };
}

const targetDay = {
  id: 'day-1',
  plan_id: 'plan-1',
  person_id: 'person-1',
  date_local: '2026-10-05',
} as PlanDay;

const daySlots = [{
  id: 'slot-1',
  plan_day_id: 'day-1',
  person_id: 'person-1',
  slot_ordinal: 1,
}] as PlanSlot[];

const foreignPersistedMeal = {
  id: 'foreign-persisted-meal',
  plan_id: 'plan-other',
  plan_day_id: 'day-other',
  plan_slot_id: 'slot-other',
  person_id: 'person-1',
  name: 'Other day meal',
  execution_state: 'pending',
} as PlannedMeal;

function services() {
  return {
    instantiatePlanDayTemplate: jest.fn(),
    savePlanDayTemplate: jest.fn(),
    deleteMeal: jest.fn().mockResolvedValue(undefined),
    updateMeal: jest.fn().mockResolvedValue(undefined),
    createMeal: jest.fn().mockResolvedValue(undefined),
  };
}

describe('Packet 19 Correction C2 — trusted local-new dated meals', () => {
  it('lets a composer-created local-new meal reach createMeal on an empty valid slot', async () => {
    const localMeal = buildTemplateMealFromDocument(mealDocument('Oat bowl'), 'breakfast');
    expect(localMeal.source_planned_meal_id).toBeTruthy();
    const actionServices = services();

    await expect(
      saveDatedDayPlan({
        services: actionServices,
        draft: datedTemplate({
          slots: [emptyBreakfastSlot([localMeal])],
        }),
        dateLocal: '2026-10-05',
        planDays: [targetDay],
        planSlots: daySlots,
        meals: [],
      }),
    ).resolves.toBe('applied');

    expect(actionServices.createMeal).toHaveBeenCalledTimes(1);
    expect(actionServices.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_id: 'plan-1',
        plan_day_id: 'day-1',
        plan_slot_id: 'slot-1',
        name: 'Oat bowl',
        create_context: 'plans_slot',
      }),
    );
    expect(actionServices.deleteMeal).not.toHaveBeenCalled();
    expect(actionServices.updateMeal).not.toHaveBeenCalled();
  });

  it('still rejects a foreign persisted meal ID before any dated mutation', async () => {
    const actionServices = services();
    const foreignMeal = {
      ...buildTemplateMealFromDocument(mealDocument('Should not save'), 'breakfast'),
      source_planned_meal_id: foreignPersistedMeal.id,
    };

    await expect(
      saveDatedDayPlan({
        services: actionServices,
        draft: datedTemplate({
          slots: [emptyBreakfastSlot([foreignMeal])],
        }),
        dateLocal: '2026-10-05',
        planDays: [targetDay],
        planSlots: daySlots,
        meals: [foreignPersistedMeal],
      }),
    ).rejects.toThrow(/meal outside the target dated day/);

    expect(actionServices.createMeal).not.toHaveBeenCalled();
    expect(actionServices.deleteMeal).not.toHaveBeenCalled();
    expect(actionServices.updateMeal).not.toHaveBeenCalled();
  });

  it('still rejects a foreign persisted slot ID before any dated mutation', async () => {
    const actionServices = services();
    const localMeal = buildTemplateMealFromDocument(mealDocument('Oat bowl'), 'breakfast');

    await expect(
      saveDatedDayPlan({
        services: actionServices,
        draft: datedTemplate({
          slots: [{
            ...emptyBreakfastSlot([localMeal]),
            source_plan_slot_id: 'slot-other-day',
          }],
        }),
        dateLocal: '2026-10-05',
        planDays: [targetDay],
        planSlots: daySlots,
        meals: [],
      }),
    ).rejects.toThrow(/slot outside the target dated day/);

    expect(actionServices.createMeal).not.toHaveBeenCalled();
    expect(actionServices.deleteMeal).not.toHaveBeenCalled();
    expect(actionServices.updateMeal).not.toHaveBeenCalled();
  });

  it('does not trust an arbitrary UUID that the composer never created', () => {
    expect(() =>
      validateDatedDayDraftMembership(
        datedTemplate({
          slots: [emptyBreakfastSlot([{
            source_planned_meal_id: '11111111-1111-1111-1111-111111111111',
            name: 'Unknown',
            meal_type: 'breakfast',
            payload: {},
          } as PlanDayTemplateMeal])],
        }),
        targetDay,
        daySlots,
        [],
      ),
    ).toThrow(/meal outside the target dated day/);
  });
});
