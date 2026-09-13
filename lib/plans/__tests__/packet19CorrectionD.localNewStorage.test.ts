process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const captured: {
  dayInsert: Record<string, unknown> | null;
  dayUpdate: Record<string, unknown> | null;
  weekInsert: Record<string, unknown> | null;
  weekUpdate: Record<string, unknown> | null;
} = {
  dayInsert: null,
  dayUpdate: null,
  weekInsert: null,
  weekUpdate: null,
};

let storedDayRow: Record<string, unknown> | null = null;
let storedWeekRow: Record<string, unknown> | null = null;

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn((table: string) => {
      const isDay = table === 'reusable_plan_day_templates';
      const chain: Record<string, unknown> = {};
      const ret = () => chain;
      chain.insert = jest.fn((row: Record<string, unknown>) => {
        if (isDay) captured.dayInsert = row;
        else captured.weekInsert = row;
        return Promise.resolve({ error: null });
      });
      chain.update = jest.fn((row: Record<string, unknown>) => {
        if (isDay) captured.dayUpdate = row;
        else captured.weekUpdate = row;
        return chain;
      });
      chain.select = jest.fn(ret);
      chain.eq = jest.fn(ret);
      chain.order = jest.fn(async () => ({
        data: isDay ? (storedDayRow ? [storedDayRow] : []) : (storedWeekRow ? [storedWeekRow] : []),
        error: null,
      }));
      chain.maybeSingle = jest.fn(async () => ({
        data: isDay ? storedDayRow : storedWeekRow,
        error: null,
      }));
      chain.single = jest.fn(async () => {
        const base = (isDay ? storedDayRow : storedWeekRow) ?? {};
        const patch = (isDay ? captured.dayUpdate : captured.weekUpdate) ?? {};
        return { data: { ...base, ...patch }, error: null };
      });
      return chain;
    }),
    rpc: jest.fn(),
  },
}));

import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import { buildTemplateMealFromDocument, snapshotDayTemplateIntoPatternDay } from '../reusableAuthoringHelpers';
import { collectTrustedLocalNewMealIds } from '../localNewMealProvenance';
import { toReusableDayTemplateInsertPayload } from '../reusablePlanningStore';
import {
  duplicatePlanDayTemplate,
  duplicatePlanWeekPattern,
  updatePlanDayTemplate,
  updatePlanWeekPattern,
} from '../planServerService';
import {
  getReusablePlanDayTemplate,
  getReusablePlanWeekPattern,
  saveReusablePlanDayTemplate,
  saveReusablePlanWeekPattern,
  updateReusablePlanDayTemplate,
  updateReusablePlanWeekPattern,
} from '../reusablePlanningStore';
import type { MealDocument } from '@/lib/meals/types';
import type { PlanDayTemplate, PlanWeekPattern } from '../types';

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

function persistedMealFields() {
  return {
    protein_score_10: null,
    is_main_meal: false,
    psq_multiplier: 1,
    meal_derived_data: {
      protein_score_10: null,
      is_main_meal: false,
      meal_calories: 0,
      meal_protein_g: 0,
      psq_multiplier: 1,
    },
    nds_confidence: 'medium' as const,
    source_template_id: null,
    source_imported_meal_id: null,
    nds_version: NDS_VERSION,
    classifier_version: CLASSIFIER_VERSION,
  };
}

function dayTemplate(overrides: Partial<PlanDayTemplate> = {}): PlanDayTemplate {
  const localMeal = buildTemplateMealFromDocument(mealDocument('Oat bowl'), 'breakfast');
  return {
    id: 'tmpl-1',
    person_id: 'person-1',
    name: 'Reusable Day',
    scope: 'day',
    source_plan_id: 'plan-1',
    source_plan_day_id: 'day-1',
    source_date_local: '2026-10-05',
    slots: [{
      source_plan_slot_id: 'slot-1',
      slot_ordinal: 1,
      slot_block: 'morning',
      slot_label: 'Breakfast',
      target_time: '08:00',
      meals: [localMeal],
    }],
    unassigned_meals: [
      buildTemplateMealFromDocument(mealDocument('Unassigned oats'), 'snack'),
    ],
    apply_policy: 'append',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-05T08:00:00.000Z',
    ...overrides,
  };
}

function weekPattern(overrides: Partial<PlanWeekPattern> = {}): PlanWeekPattern {
  const snapshot = snapshotDayTemplateIntoPatternDay(dayTemplate(), 0);
  return {
    id: 'pattern-1',
    person_id: 'person-1',
    name: 'Reusable Week',
    scope: 'week_pattern',
    source_plan_id: 'plan-1',
    source_date_start: '2026-10-05',
    source_date_end: '2026-10-11',
    days: [snapshot],
    apply_policy: 'append',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-05T08:00:00.000Z',
    ...overrides,
  };
}

function containsLocalNew(value: unknown): boolean {
  return JSON.stringify(value).includes('"local_new"');
}

function resetCapture() {
  captured.dayInsert = null;
  captured.dayUpdate = null;
  captured.weekInsert = null;
  captured.weekUpdate = null;
  storedDayRow = null;
  storedWeekRow = null;
}

describe('Packet 19 Correction D C6 — local_new never reaches reusable storage', () => {
  beforeEach(() => {
    resetCapture();
  });

  it('strips composer-created local_new from canonical Day insert/update serialization', () => {
    const draft = dayTemplate();
    expect(draft.slots[0]?.meals[0]?.local_new).toBe(true);
    expect(draft.unassigned_meals?.[0]?.local_new).toBe(true);

    const row = toReusableDayTemplateInsertPayload(draft);
    expect(containsLocalNew(row.slots_json)).toBe(false);
    expect(containsLocalNew(row.unassigned_meals_json)).toBe(false);
    expect(draft.slots[0]?.meals[0]?.local_new).toBe(true);
  });

  it('strips Week pattern snapshot stamps from canonical Week insert serialization', async () => {
    const pattern = weekPattern();
    expect(containsLocalNew(pattern.days)).toBe(true);

    await saveReusablePlanWeekPattern(pattern);
    expect(containsLocalNew(captured.weekInsert?.days_json)).toBe(false);
    expect(containsLocalNew(pattern.days)).toBe(true);
  });

  it('strips local_new on the updatePlanDayTemplate storage payload', async () => {
    const existing = dayTemplate({
      slots: [{
        source_plan_slot_id: 'slot-1',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '08:00',
        meals: [{
          source_planned_meal_id: 'existing-meal',
          name: 'Existing',
          meal_type: 'breakfast',
          payload: {},
          ...persistedMealFields(),
        }],
      }],
      unassigned_meals: [],
    });
    storedDayRow = {
      id: existing.id,
      person_id: existing.person_id,
      name: existing.name,
      source_plan_id: existing.source_plan_id,
      source_plan_day_id: existing.source_plan_day_id,
      source_date_local: existing.source_date_local,
      slots_json: existing.slots,
      unassigned_meals_json: existing.unassigned_meals,
      apply_policy: 'append',
      created_at: existing.created_at,
      updated_at: existing.updated_at,
    };

    const stamped = buildTemplateMealFromDocument(mealDocument('Oat bowl'), 'breakfast');
    await updatePlanDayTemplate({
      personId: 'person-1',
      templateId: 'tmpl-1',
      slots: [{
        source_plan_slot_id: 'slot-1',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '08:00',
        meals: [stamped],
      }],
      unassigned_meals: [buildTemplateMealFromDocument(mealDocument('Unassigned oats'), 'snack')],
    });

    expect(stamped.local_new).toBe(true);
    expect(containsLocalNew(captured.dayUpdate?.slots_json)).toBe(false);
    expect(containsLocalNew(captured.dayUpdate?.unassigned_meals_json)).toBe(false);
  });

  it('strips local_new on the updatePlanWeekPattern storage payload', async () => {
    const existing = weekPattern();
    storedWeekRow = {
      id: existing.id,
      person_id: existing.person_id,
      name: existing.name,
      source_plan_id: existing.source_plan_id,
      source_date_start: existing.source_date_start,
      source_date_end: existing.source_date_end,
      days_json: existing.days.map((day) => ({
        ...day,
        slots: day.slots.map((slot) => ({
          ...slot,
          meals: slot.meals.map(({ local_new: _ignored, ...meal }) => meal),
        })),
        unassigned_meals: (day.unassigned_meals ?? []).map(({ local_new: _ignored, ...meal }) => meal),
      })),
      apply_policy: 'append',
      created_at: existing.created_at,
      updated_at: existing.updated_at,
    };

    const stampedDays = [snapshotDayTemplateIntoPatternDay(dayTemplate(), 0)];
    expect(containsLocalNew(stampedDays)).toBe(true);

    await updatePlanWeekPattern({
      personId: 'person-1',
      patternId: 'pattern-1',
      days: stampedDays,
    });

    expect(containsLocalNew(captured.weekUpdate?.days_json)).toBe(false);
  });

  it('strips local_new from duplicated Day/Week objects written to storage', async () => {
    const stampedDay = dayTemplate({ id: 'tmpl-copy-source' });
    await saveReusablePlanDayTemplate({
      ...stampedDay,
      id: 'tmpl-copy',
      name: 'Reusable Day (Copy)',
    });
    expect(containsLocalNew(captured.dayInsert?.slots_json)).toBe(false);
    expect(containsLocalNew(captured.dayInsert?.unassigned_meals_json)).toBe(false);

    storedDayRow = {
      id: 'tmpl-copy-source',
      person_id: stampedDay.person_id,
      name: stampedDay.name,
      source_plan_id: stampedDay.source_plan_id,
      source_plan_day_id: stampedDay.source_plan_day_id,
      source_date_local: stampedDay.source_date_local,
      slots_json: stampedDay.slots,
      unassigned_meals_json: stampedDay.unassigned_meals,
      apply_policy: 'append',
      created_at: stampedDay.created_at,
      updated_at: stampedDay.updated_at,
    };
    captured.dayInsert = null;
    await duplicatePlanDayTemplate('person-1', 'tmpl-copy-source');
    expect(containsLocalNew(captured.dayInsert?.slots_json)).toBe(false);

    const stampedWeek = weekPattern({ id: 'pattern-copy-source' });
    storedWeekRow = {
      id: stampedWeek.id,
      person_id: stampedWeek.person_id,
      name: stampedWeek.name,
      source_plan_id: stampedWeek.source_plan_id,
      source_date_start: stampedWeek.source_date_start,
      source_date_end: stampedWeek.source_date_end,
      days_json: stampedWeek.days,
      apply_policy: 'append',
      created_at: stampedWeek.created_at,
      updated_at: stampedWeek.updated_at,
    };
    captured.weekInsert = null;
    await duplicatePlanWeekPattern('person-1', 'pattern-copy-source');
    expect(containsLocalNew(captured.weekInsert?.days_json)).toBe(false);
  });

  it('does not reintroduce trusted local_new status when hydrating legacy JSON', async () => {
    storedDayRow = {
      id: 'tmpl-legacy',
      person_id: 'person-1',
      name: 'Legacy Day',
      source_plan_id: 'plan-1',
      source_plan_day_id: 'day-1',
      source_date_local: '2026-10-05',
      slots_json: [{
        source_plan_slot_id: 'slot-1',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '08:00',
        meals: [{
          source_planned_meal_id: 'legacy-meal',
          name: 'Legacy oats',
          meal_type: 'breakfast',
          payload: {},
          local_new: true,
          ...persistedMealFields(),
        }],
      }],
      unassigned_meals_json: [{
        source_planned_meal_id: 'legacy-unassigned',
        name: 'Legacy snack',
        meal_type: 'snack',
        payload: {},
        local_new: true,
        ...persistedMealFields(),
      }],
      apply_policy: 'append',
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-05T08:00:00.000Z',
    };

    const hydrated = await getReusablePlanDayTemplate('person-1', 'tmpl-legacy');
    expect(hydrated).not.toBeNull();
    expect(containsLocalNew(hydrated)).toBe(false);
    expect(collectTrustedLocalNewMealIds(hydrated!)).toEqual(new Set());

    storedWeekRow = {
      id: 'pattern-legacy',
      person_id: 'person-1',
      name: 'Legacy Week',
      source_plan_id: 'plan-1',
      source_date_start: '2026-10-05',
      source_date_end: '2026-10-11',
      days_json: [{
        day_offset: 0,
        source_plan_day_id: 'day-1',
        source_date_local: 'Day 1',
        slots: [{
          source_plan_slot_id: 'slot-1',
          slot_ordinal: 1,
          slot_block: 'morning',
          slot_label: 'Breakfast',
          target_time: '08:00',
          meals: [{
            source_planned_meal_id: 'legacy-week-meal',
            name: 'Legacy week oats',
            meal_type: 'breakfast',
            payload: {},
            local_new: true,
            ...persistedMealFields(),
          }],
        }],
        unassigned_meals: [],
      }],
      apply_policy: 'append',
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-05T08:00:00.000Z',
    };

    const hydratedWeek = await getReusablePlanWeekPattern('person-1', 'pattern-legacy');
    expect(hydratedWeek).not.toBeNull();
    expect(containsLocalNew(hydratedWeek)).toBe(false);
  });

  it('also strips through the reusable Day and Week update store paths', async () => {
    const draft = dayTemplate();
    storedDayRow = {
      id: draft.id,
      person_id: draft.person_id,
      name: draft.name,
      source_plan_id: draft.source_plan_id,
      source_plan_day_id: draft.source_plan_day_id,
      source_date_local: draft.source_date_local,
      slots_json: [],
      unassigned_meals_json: [],
      apply_policy: 'append',
      created_at: draft.created_at,
      updated_at: draft.updated_at,
    };
    await updateReusablePlanDayTemplate(draft);
    expect(containsLocalNew(captured.dayUpdate?.slots_json)).toBe(false);

    const pattern = weekPattern();
    storedWeekRow = {
      id: pattern.id,
      person_id: pattern.person_id,
      name: pattern.name,
      source_plan_id: pattern.source_plan_id,
      source_date_start: pattern.source_date_start,
      source_date_end: pattern.source_date_end,
      days_json: [],
      apply_policy: 'append',
      created_at: pattern.created_at,
      updated_at: pattern.updated_at,
    };
    await updateReusablePlanWeekPattern(pattern);
    expect(containsLocalNew(captured.weekUpdate?.days_json)).toBe(false);
  });
});
