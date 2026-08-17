import { defaultMealSchedule } from '@/lib/plans/scheduleResolver';
import { MealScheduleSchema } from '@/lib/plans/validators';
import {
  PLANS_FORWARD_COVERAGE_POLICY,
} from '@/lib/plans/decisioning/forwardCoveragePolicy';
import { resolvePlansNextBestAction } from '@/lib/plans/decisioning/resolvePlansNextBestAction';
import type { ResolvePlansNextBestActionInput } from '@/lib/plans/decisioning/resolvePlansNextBestAction';
import { isUsableSavedMealSchedule } from '@/lib/plans/decisioning/usableMealRhythm';
import {
  MEAL_RHYTHM_ASSUMPTION_POLICY_ID,
  MEAL_RHYTHM_ASSUMPTION_POLICY_VERSION,
  buildMealScheduleSavePayload,
  proposeMealRhythm,
  scheduleFromSavedPartial,
} from '../assumptionPolicy';
import { parseMealRhythmDecisionEvent, toMealRhythmEventMetadata, classifyMealRhythmSaveEvent } from '../events';

const NOW = new Date('2026-08-16T15:00:00.000Z');

function nbaInput(
  hasSchedule: boolean,
): ResolvePlansNextBestActionInput {
  return {
    guidanceStatus: hasSchedule ? 'ready' : 'no_schedule',
    hasSchedule,
    todayCoverage: 'empty',
    forwardCoveredDayCount: 0,
    forwardHorizonDays: PLANS_FORWARD_COVERAGE_POLICY.horizonDays,
    pantry: { kind: 'ok', pantryItemsSaved: 4 },
    groceryDemand: false,
    destinations: {
      setupMealRhythm: '/app/plans/rhythm',
      setupPantry: '/app/food/pantry',
      planToday: '/app/plans/day/2026-08-16',
      finishToday: '/app/plans/day/2026-08-16',
      planAhead: '/app/plans/week',
      reviewPlan: '/app/plans/week',
      grocery: null,
    },
  };
}

describe('proposeMealRhythm', () => {
  it('uses product defaults only when no saved schedule or onboarding rhythm exists', () => {
    const proposal = proposeMealRhythm({ savedSchedule: null, now: NOW });
    expect(proposal.policyId).toBe(MEAL_RHYTHM_ASSUMPTION_POLICY_ID);
    expect(proposal.policyVersion).toBe(MEAL_RHYTHM_ASSUMPTION_POLICY_VERSION);
    expect(proposal.source).toBe('product_default');
    expect(proposal.confidence).toBe('unknown');
    expect(proposal.schedule.slots.breakfast.enabled).toBe(true);
    expect(proposal.schedule.slots.lunch.enabled).toBe(true);
    expect(proposal.schedule.slots.dinner.enabled).toBe(true);
    expect(proposal.schedule.slots.morning_snack.enabled).toBe(false);
    expect(proposal.reasonCodes).toContain('history_inference_deferred');
    expect(proposal.weekendVariationSupported).toBe(false);
  });

  it('never overwrites a saved usable schedule with defaults', () => {
    const saved = defaultMealSchedule(NOW);
    saved.slots.breakfast.enabled = true;
    saved.slots.breakfast.target_time = '07:15';
    saved.slots.breakfast.label = 'First plate';
    saved.slots.lunch.enabled = false;
    saved.slots.dinner.enabled = true;
    saved.slots.dinner.target_time = '18:40';
    saved.slots.morning_snack.enabled = false;
    saved.slots.afternoon_snack.enabled = false;
    saved.slots.evening_snack.enabled = false;

    const proposal = proposeMealRhythm({
      savedSchedule: saved,
      onboarding: {
        eating: { rhythm_template: 'three_meals_daily', meal_slots: ['breakfast', 'lunch', 'dinner'] },
      },
      now: NOW,
    });

    expect(proposal.source).toBe('saved_schedule');
    expect(proposal.schedule.slots.breakfast.target_time).toBe('07:15');
    expect(proposal.schedule.slots.breakfast.label).toBe('First plate');
    expect(proposal.schedule.slots.lunch.enabled).toBe(false);
    expect(proposal.schedule.slots.dinner.target_time).toBe('18:40');
    expect(proposal.fieldProvenance.breakfast).toBe('saved_schedule');
  });

  it('keeps a saved schedule that looks like defaults instead of replacing it', () => {
    const saved = defaultMealSchedule(NOW);
    const proposal = proposeMealRhythm({ savedSchedule: saved, now: NOW });
    expect(proposal.source).toBe('saved_schedule');
    expect(proposal.confidence).toBe('deterministic');
  });

  it('maps onboarding two-meal facts without forcing a three-meal day', () => {
    const proposal = proposeMealRhythm({
      savedSchedule: null,
      onboarding: {
        eating: {
          rhythm_template: 'two_meals_one_mini',
          first_meal_window: '11_1',
          last_meal_window: '7_9',
          meal_slots: ['lunch', 'afternoon_snack', 'dinner'],
        },
      },
      now: NOW,
    });
    expect(proposal.source).toBe('onboarding');
    expect(proposal.schedule.slots.breakfast.enabled).toBe(false);
    expect(proposal.schedule.slots.lunch.enabled).toBe(true);
    expect(proposal.schedule.slots.afternoon_snack.enabled).toBe(true);
    expect(proposal.schedule.slots.dinner.enabled).toBe(true);
  });

  it('uses meal_slots when they disagree with a three-meal default template', () => {
    const proposal = proposeMealRhythm({
      savedSchedule: null,
      onboarding: {
        eating: {
          rhythm_template: 'custom_rhythm',
          meal_slots: ['breakfast', 'dinner'],
        },
      },
      now: NOW,
    });
    expect(proposal.schedule.slots.breakfast.enabled).toBe(true);
    expect(proposal.schedule.slots.lunch.enabled).toBe(false);
    expect(proposal.schedule.slots.dinner.enabled).toBe(true);
    expect(proposal.reasonCodes).toContain('ambiguous_onboarding_rhythm');
  });

  it('fills missing saved keys as disabled instead of enabling default meals', () => {
    const partial = {
      version: 1 as const,
      updated_at: '2026-08-01T00:00:00.000Z',
      slots: {
        breakfast: { enabled: true, target_time: '09:00', label: null },
      },
    };
    const schedule = scheduleFromSavedPartial(partial, NOW);
    expect(schedule.slots.breakfast.enabled).toBe(true);
    expect(schedule.slots.lunch.enabled).toBe(false);
    expect(schedule.slots.dinner.enabled).toBe(false);
  });
});

describe('canonical meal_schedule save payload', () => {
  it('writes only meal_schedule and validates against MealScheduleSchema', () => {
    const proposal = proposeMealRhythm({ savedSchedule: null, now: NOW });
    const payload = buildMealScheduleSavePayload(proposal.schedule, NOW);
    expect(Object.keys(payload)).toEqual(['meal_schedule']);
    expect('person_id' in payload).toBe(false);
    expect(MealScheduleSchema.safeParse(payload.meal_schedule).success).toBe(true);
  });
});

describe('Plans NBA after usable rhythm save', () => {
  it('stays on setup_meal_rhythm when no usable saved schedule exists', () => {
    expect(isUsableSavedMealSchedule(null)).toBe(false);
    expect(resolvePlansNextBestAction(nbaInput(false)).stateKey).toBe('setup_meal_rhythm');
    expect(resolvePlansNextBestAction(nbaInput(false)).primary?.destination).toBe(
      '/app/plans/rhythm',
    );
  });

  it('leaves setup_meal_rhythm after a usable canonical save', () => {
    const proposal = proposeMealRhythm({ savedSchedule: null, now: NOW });
    const payload = buildMealScheduleSavePayload(proposal.schedule, NOW);
    expect(isUsableSavedMealSchedule(payload.meal_schedule)).toBe(true);
    const decision = resolvePlansNextBestAction(
      nbaInput(isUsableSavedMealSchedule(payload.meal_schedule)),
    );
    expect(decision.stateKey).not.toBe('setup_meal_rhythm');
    expect(decision.stateKey).toBe('plan_today');
  });
});

describe('meal rhythm events', () => {
  const valid = {
    event: 'meal_rhythm_proposal_shown',
    policyId: MEAL_RHYTHM_ASSUMPTION_POLICY_ID,
    policyVersion: MEAL_RHYTHM_ASSUMPTION_POLICY_VERSION,
    proposalSource: 'product_default',
    path: 'exposed',
    reasonCodes: ['product_default_assumption'],
    enabledSlotCount: 3,
  };

  it('accepts structured identifiers and drops meal text from stored metadata', () => {
    const parsed = parseMealRhythmDecisionEvent({
      ...valid,
      mealName: 'Oats with banana',
    });
    expect(parsed).toEqual(valid);
    const metadata = toMealRhythmEventMetadata(parsed!);
    expect(JSON.stringify(metadata)).not.toMatch(/oats|banana|calories|symptom/i);
  });

  it('rejects unknown events and policy versions', () => {
    expect(parseMealRhythmDecisionEvent({ ...valid, event: 'meal_dump' })).toBeNull();
    expect(parseMealRhythmDecisionEvent({ ...valid, policyVersion: 'v0' })).toBeNull();
  });

  it('accepts meal_rhythm_edit_started without treating it as an edit-save', () => {
    expect(
      parseMealRhythmDecisionEvent({
        ...valid,
        event: 'meal_rhythm_edit_started',
      }),
    ).toEqual({ ...valid, event: 'meal_rhythm_edit_started' });
  });

  it('classifies save as accepted unless schedule values actually changed', () => {
    const baseline = defaultMealSchedule(NOW);
    expect(classifyMealRhythmSaveEvent(baseline, defaultMealSchedule(NOW))).toBe(
      'meal_rhythm_accepted',
    );
    const edited = defaultMealSchedule(NOW);
    edited.slots.breakfast.target_time = '07:15';
    expect(classifyMealRhythmSaveEvent(baseline, edited)).toBe('meal_rhythm_edited');
  });
});
