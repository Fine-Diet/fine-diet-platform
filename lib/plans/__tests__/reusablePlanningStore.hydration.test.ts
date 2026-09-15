process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const storedDayRows: Record<string, Record<string, unknown>> = {};

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn((table: string) => {
      if (table !== 'reusable_plan_day_templates') {
        throw new Error(`unexpected table ${table}`);
      }
      const chain: Record<string, unknown> = {};
      const ret = () => chain;
      let personId: string | null = null;
      let templateId: string | null = null;
      chain.select = jest.fn(ret);
      chain.eq = jest.fn((column: string, value: string) => {
        if (column === 'person_id') personId = value;
        if (column === 'id') templateId = value;
        return chain;
      });
      chain.order = jest.fn(async () => ({
        data: Object.values(storedDayRows).filter(
          (row) => !personId || row.person_id === personId,
        ),
        error: null,
      }));
      chain.maybeSingle = jest.fn(async () => ({
        data: templateId ? storedDayRows[templateId] ?? null : null,
        error: null,
      }));
      chain.insert = jest.fn(async (row: Record<string, unknown>) => {
        storedDayRows[String(row.id)] = { ...row };
        return { error: null };
      });
      return chain;
    }),
    rpc: jest.fn(),
  },
}));

jest.mock('../personMetadataStore', () => ({
  readPersonMetadata: jest.fn(async () => ({})),
  normalizeMetadataCollection: (_key: string, value: unknown) =>
    Array.isArray(value) ? value : [],
}));

import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import { dayPlanDraftSignature } from '../dayPlanDraftStore';
import { duplicatePlanDayTemplate } from '../planServerService';
import {
  getReusablePlanDayTemplate,
  listReusablePlanDayTemplates,
  toReusableDayTemplateInsertPayload,
} from '../reusablePlanningStore';
import type { PlanDayTemplate, PlanDayTemplateMeal } from '../types';

function savedMeal(
  id: string,
  name: string,
  mealType: PlanDayTemplateMeal['meal_type'],
): PlanDayTemplateMeal {
  return {
    source_planned_meal_id: id,
    name,
    meal_type: mealType,
    payload: {
      items: [{ food_id: `food-${id}`, quantity_g: 110, name }],
      totals: { calories: 380, protein_g: 24, carbs_g: 36, fat_g: 11 },
      source_meal_document_id: `doc-${id}`,
      source_imported_meal_id: null,
    },
    protein_score_10: 6.8,
    is_main_meal: true,
    psq_multiplier: 0.95,
    meal_derived_data: {
      protein_score_10: 6.8,
      is_main_meal: true,
      meal_calories: 380,
      meal_protein_g: 24,
      psq_multiplier: 0.95,
    },
    nds_confidence: 'high',
    source_template_id: `doc-${id}`,
    source_imported_meal_id: null,
    nds_version: NDS_VERSION,
    classifier_version: CLASSIFIER_VERSION,
  };
}

function storedTemplate(): PlanDayTemplate {
  return {
    id: 'tmpl-real-shape',
    person_id: 'person-1',
    name: 'Training Day',
    description: 'Reusable snapshot with two saved occasions',
    scope: 'day',
    source_plan_id: 'plan-source',
    source_plan_day_id: 'source-day-a',
    source_date_local: '2026-09-01',
    slots: [
      {
        source_plan_slot_id: 'slot-breakfast',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '08:00',
        meals: [savedMeal('meal-oats', 'Overnight oats', 'breakfast')],
      },
      {
        source_plan_slot_id: 'slot-lunch',
        slot_ordinal: 2,
        slot_block: 'midday',
        slot_label: 'Lunch',
        target_time: '12:30',
        meals: [savedMeal('meal-salmon', 'Salmon bowl', 'lunch')],
      },
    ],
    unassigned_meals: [savedMeal('meal-unassigned', 'Emergency bar', 'snack')],
    apply_policy: 'append',
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-10T10:00:00.000Z',
  };
}

describe('reusable planning store meal hydration and duplicate snapshot', () => {
  beforeEach(() => {
    for (const key of Object.keys(storedDayRows)) delete storedDayRows[key];
  });

  it('round-trips a real-shaped saved meal through row mapping without dirtying the draft signature', async () => {
    const original = storedTemplate();
    const insertRow = toReusableDayTemplateInsertPayload(original);
    expect(insertRow.description).toBe('Reusable snapshot with two saved occasions');
    expect(Object.prototype.hasOwnProperty.call(insertRow, 'description')).toBe(true);

    storedDayRows[original.id] = {
      ...insertRow,
      slots_json: (insertRow.slots_json as PlanDayTemplate['slots']).map((slot) => ({
        ...slot,
        meals: slot.meals.map((meal) => ({
          ...meal,
          local_new: true,
          leftover_unknown: 'ignore-me',
        })),
      })),
    };

    const listed = await listReusablePlanDayTemplates('person-1');
    const loaded = await getReusablePlanDayTemplate('person-1', original.id);
    expect(loaded).not.toBeNull();
    expect(listed).toHaveLength(1);
    expect(dayPlanDraftSignature(listed[0]!)).toBe(dayPlanDraftSignature(loaded!));
    expect(loaded!.scope).toBe('day');
    expect(loaded!.description).toBe(original.description);
    expect(loaded!.slots[0]?.meals[0]?.source_planned_meal_id).toBe('meal-oats');
    expect(loaded!.slots[0]?.meals[0]?.name).toBe('Overnight oats');
    expect(loaded!.slots[0]?.meals[0]?.payload).toEqual(original.slots[0]?.meals[0]?.payload);
    expect(loaded!.slots[1]?.meals[0]?.source_planned_meal_id).toBe('meal-salmon');
    expect(loaded!.unassigned_meals?.[0]?.source_planned_meal_id).toBe('meal-unassigned');
    expect(
      (loaded!.slots[0]?.meals[0] as PlanDayTemplateMeal & { leftover_unknown?: string })
        .leftover_unknown,
    ).toBeUndefined();
    expect(loaded!.slots[0]?.meals[0]?.local_new).toBeUndefined();
  });

  it('duplicates only reusable identity/name/timestamps and keeps meals, slots, and description', async () => {
    const original = storedTemplate();
    storedDayRows[original.id] = toReusableDayTemplateInsertPayload(original);

    const copy = await duplicatePlanDayTemplate('person-1', original.id);
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Training Day (Copy)');
    expect(copy.description).toBe(original.description);
    expect(copy.scope).toBe('day');
    expect(copy.source_plan_day_id).toBe(original.source_plan_day_id);
    expect(copy.slots).toEqual(original.slots);
    expect(copy.unassigned_meals).toEqual(original.unassigned_meals);
    expect(copy.slots[0]?.meals[0]?.source_planned_meal_id).toBe('meal-oats');
    expect(copy.created_at).not.toBe(original.created_at);
    expect(copy.updated_at).not.toBe(original.updated_at);

    const persisted = await getReusablePlanDayTemplate('person-1', copy.id);
    expect(persisted?.id).toBe(copy.id);
    expect(persisted?.description).toBe(original.description);
    expect(persisted?.slots[1]?.meals[0]?.name).toBe('Salmon bowl');
    expect(persisted?.unassigned_meals?.[0]?.name).toBe('Emergency bar');
    expect(dayPlanDraftSignature({ ...persisted!, name: original.name })).toBe(
      dayPlanDraftSignature(original),
    );
  });
});
