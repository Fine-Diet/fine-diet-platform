import {
  clearDayPlanDraft,
  dayPlanDraftSignature,
  dayPlanDraftStorageKey,
  loadDayPlanDraft,
  normalizeDayPlanName,
  saveDayPlanDraft,
} from '../dayPlanDraftStore';
import type { PlanDayTemplate } from '../types';

function template(overrides: Partial<PlanDayTemplate> = {}): PlanDayTemplate {
  return {
    id: '',
    person_id: 'person-a',
    name: 'Unnamed Day Plan',
    scope: 'day',
    source_plan_id: '',
    source_plan_day_id: 'draft-day',
    source_date_local: '',
    slots: [],
    unassigned_meals: [],
    created_at: '',
    updated_at: '',
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

describe('Packet 17D Day Plan browser drafts', () => {
  it('scopes drafts to person and saved reusable identity', () => {
    expect(dayPlanDraftStorageKey('person-a', null)).not.toBe(
      dayPlanDraftStorageKey('person-b', null),
    );
    expect(dayPlanDraftStorageKey('person-a', 'plan-1')).not.toBe(
      dayPlanDraftStorageKey('person-a', 'plan-2'),
    );
  });

  it('restores only a matching baseline and clears after Save', () => {
    const storage = memoryStorage();
    const draft = template({ name: 'Renamed' });
    saveDayPlanDraft(storage as Storage, 'person-a', null, null, draft);
    expect(loadDayPlanDraft(storage as Storage, 'person-a', null, null)).toEqual(draft);
    expect(loadDayPlanDraft(storage as Storage, 'person-b', null, null)).toBeNull();
    expect(loadDayPlanDraft(storage as Storage, 'person-a', null, 'later')).toBeNull();
    clearDayPlanDraft(storage as Storage, 'person-a', null);
    expect(loadDayPlanDraft(storage as Storage, 'person-a', null, null)).toBeNull();
  });

  it('treats name and slot-content edits as dirty and normalizes blank names', () => {
    const base = template();
    expect(dayPlanDraftSignature({ ...base, name: 'Renamed' })).not.toBe(
      dayPlanDraftSignature(base),
    );
    expect(dayPlanDraftSignature({
      ...base,
      slots: [{
        source_plan_slot_id: 'slot-1',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '08:00',
        meals: [],
      }],
    })).not.toBe(dayPlanDraftSignature(base));
    expect(normalizeDayPlanName('   ')).toBe('Unnamed Day Plan');
  });
});
