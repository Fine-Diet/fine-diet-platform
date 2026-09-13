import {
  loadDayPlanDraftSession,
  saveDayPlanDraftSession,
  type DayPlanDraftSession,
  type EmbeddedDayDraftSource,
} from '../dayPlanDraftStore';
import type { PlanDayTemplate } from '../types';

function datedTemplate(overrides: Partial<PlanDayTemplate> = {}): PlanDayTemplate {
  return {
    id: '',
    person_id: 'person-1',
    name: 'Dated Day A',
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
      meals: [{
        source_planned_meal_id: 'meal-a',
        name: 'Oats A',
        meal_type: 'breakfast',
        payload: {},
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
        nds_confidence: 'medium',
        source_template_id: null,
        source_imported_meal_id: null,
        nds_version: 'nds',
        classifier_version: 'clf',
      }],
    }],
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-05T08:00:00.000Z',
    ...overrides,
  };
}

function blankTemplate(overrides: Partial<PlanDayTemplate> = {}): PlanDayTemplate {
  return {
    id: '',
    person_id: 'person-1',
    name: 'Unnamed Day Plan',
    scope: 'day',
    source_plan_id: '',
    source_plan_day_id: 'month-modal-draft',
    source_date_local: '',
    slots: [{
      source_plan_slot_id: 'profile-slot',
      slot_ordinal: 1,
      slot_block: 'morning',
      slot_label: 'Breakfast',
      target_time: '08:00',
      meals: [],
    }],
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function reusableTemplate(overrides: Partial<PlanDayTemplate> = {}): PlanDayTemplate {
  return {
    id: 'template-training',
    person_id: 'person-1',
    name: 'Training Day',
    scope: 'day',
    source_plan_id: '',
    source_plan_day_id: 'reusable-day',
    source_date_local: '1970-01-01',
    slots: [{
      source_plan_slot_id: 'slot-1',
      slot_ordinal: 1,
      slot_block: 'morning',
      slot_label: 'Breakfast',
      target_time: '08:00',
      meals: [],
    }],
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-04T08:15:00.000Z',
    ...overrides,
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

type RestoreContext = {
  datedTemplate?: PlanDayTemplate | null;
  reusableTemplates?: PlanDayTemplate[];
};

function loadSession(
  storage: Pick<Storage, 'getItem'>,
  personId: string,
  dayPlanId: string | null,
  fallback: PlanDayTemplate,
  inferredSource: EmbeddedDayDraftSource,
  context?: RestoreContext,
): DayPlanDraftSession | null {
  return (
    loadDayPlanDraftSession as (
      storage: Pick<Storage, 'getItem'>,
      personId: string,
      dayPlanId: string | null,
      fallback: PlanDayTemplate,
      inferredSource: EmbeddedDayDraftSource,
      context?: RestoreContext,
    ) => DayPlanDraftSession | null
  )(storage, personId, dayPlanId, fallback, inferredSource, context);
}

function persistDirty(
  storage: ReturnType<typeof memoryStorage>,
  baseline: PlanDayTemplate,
  source: EmbeddedDayDraftSource,
  draftName: string,
) {
  const session: DayPlanDraftSession = {
    draft: { ...baseline, name: draftName },
    baseline,
    source,
    pendingSavedTemplateId: null,
    pendingSavedSnapshot: null,
    actionError: null,
  };
  saveDayPlanDraftSession(storage, 'person-1', 'month-date:2026-10-05', session);
}

describe('Packet 19 Correction D C5 — draft session canonical freshness', () => {
  it('restores a dirty dated session across same-version object churn', () => {
    const storage = memoryStorage();
    const versionA = datedTemplate();
    persistDirty(storage, versionA, 'dated', 'Stale draft A');

    const churned = datedTemplate({
      slots: versionA.slots.map((slot) => ({ ...slot, meals: slot.meals.map((meal) => ({ ...meal })) })),
    });
    const restored = loadSession(
      storage,
      'person-1',
      'month-date:2026-10-05',
      churned,
      'dated',
      { datedTemplate: churned, reusableTemplates: [] },
    );

    expect(restored?.draft.name).toBe('Stale draft A');
    expect(restored?.source).toBe('dated');
  });

  it('does not restore a dated session after the canonical updated_at changes', () => {
    const storage = memoryStorage();
    persistDirty(storage, datedTemplate(), 'dated', 'Stale draft A');

    const versionB = datedTemplate({
      name: 'Dated Day B',
      updated_at: '2026-10-06T12:00:00.000Z',
      slots: [{
        source_plan_slot_id: 'slot-1',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '08:00',
        meals: [{
          source_planned_meal_id: 'meal-b',
          name: 'Oats B',
          meal_type: 'breakfast',
          payload: {},
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
          nds_confidence: 'medium',
          source_template_id: null,
          source_imported_meal_id: null,
          nds_version: 'nds',
          classifier_version: 'clf',
        }],
      }],
    });

    const restored = loadSession(
      storage,
      'person-1',
      'month-date:2026-10-05',
      versionB,
      'dated',
      { datedTemplate: versionB, reusableTemplates: [] },
    );

    expect(restored).toBeNull();
  });

  it('does not attach a stale dated session to a replaced PlanDay identity', () => {
    const storage = memoryStorage();
    persistDirty(storage, datedTemplate(), 'dated', 'Stale draft A');

    const replacement = datedTemplate({
      source_plan_day_id: 'day-2',
      name: 'Replacement Day',
      updated_at: '2026-10-07T09:00:00.000Z',
    });
    const restored = loadSession(
      storage,
      'person-1',
      'month-date:2026-10-05',
      replacement,
      'dated',
      { datedTemplate: replacement, reusableTemplates: [] },
    );

    expect(restored).toBeNull();
  });

  it('does not restore a dated session after the dated source disappears', () => {
    const storage = memoryStorage();
    persistDirty(storage, datedTemplate(), 'dated', 'Stale draft A');
    const blank = blankTemplate({ name: 'Fresh blank' });

    const restored = loadSession(
      storage,
      'person-1',
      'month-date:2026-10-05',
      blank,
      'blank',
      { datedTemplate: null, reusableTemplates: [] },
    );

    expect(restored).toBeNull();
  });

  it('restores a reusable session when id and updated_at still match', () => {
    const storage = memoryStorage();
    const reusable = reusableTemplate();
    persistDirty(storage, reusable, 'reusable', 'Training Day edited');

    const restored = loadSession(
      storage,
      'person-1',
      'month-date:2026-10-05',
      blankTemplate(),
      'blank',
      { datedTemplate: null, reusableTemplates: [reusableTemplate()] },
    );

    expect(restored?.draft.name).toBe('Training Day edited');
    expect(restored?.source).toBe('reusable');
  });

  it('rejects a reusable session when the source version changed elsewhere', () => {
    const storage = memoryStorage();
    persistDirty(storage, reusableTemplate(), 'reusable', 'Training Day edited');

    const restored = loadSession(
      storage,
      'person-1',
      'month-date:2026-10-05',
      blankTemplate(),
      'blank',
      {
        datedTemplate: null,
        reusableTemplates: [reusableTemplate({ updated_at: '2026-10-08T10:00:00.000Z' })],
      },
    );

    expect(restored).toBeNull();
  });

  it('rejects a reusable session when the source was deleted', () => {
    const storage = memoryStorage();
    persistDirty(storage, reusableTemplate(), 'reusable', 'Training Day edited');

    const restored = loadSession(
      storage,
      'person-1',
      'month-date:2026-10-05',
      blankTemplate(),
      'blank',
      { datedTemplate: null, reusableTemplates: [] },
    );

    expect(restored).toBeNull();
  });

  it('still restores a pending-saved reusable identity before the library list refreshes', () => {
    const storage = memoryStorage();
    const saved = reusableTemplate({
      id: 'saved-1',
      name: 'Saved retry Day',
      updated_at: '2026-10-05T12:00:00.000Z',
    });
    saveDayPlanDraftSession(storage, 'person-1', 'month-date:2026-10-05', {
      draft: saved,
      baseline: saved,
      source: 'reusable',
      pendingSavedTemplateId: 'saved-1',
      pendingSavedSnapshot: saved,
      actionError: 'Apply failed',
    });

    const restored = loadSession(
      storage,
      'person-1',
      'month-date:2026-10-05',
      blankTemplate(),
      'blank',
      { datedTemplate: null, reusableTemplates: [] },
    );

    expect(restored?.pendingSavedTemplateId).toBe('saved-1');
    expect(restored?.draft.name).toBe('Saved retry Day');
  });

  it('does not treat empty blank timestamps as a freshness mismatch', () => {
    const storage = memoryStorage();
    persistDirty(storage, blankTemplate(), 'blank', 'Blank edited');

    const churnedBlank = blankTemplate({
      source_plan_day_id: 'month-frozen:2026-10-05',
      slots: [{
        source_plan_slot_id: 'fresh-object-slot',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '08:00',
        meals: [],
      }],
    });
    const restored = loadSession(
      storage,
      'person-1',
      'month-date:2026-10-05',
      churnedBlank,
      'blank',
      { datedTemplate: null, reusableTemplates: [] },
    );

    expect(restored?.draft.name).toBe('Blank edited');
    expect(restored?.source).toBe('blank');
  });
});
