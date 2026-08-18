import {
  coverageFromRows,
} from '../coverage';
import { PLANS_FORWARD_COVERAGE_POLICY, isForwardCoverageWeak } from '../forwardCoveragePolicy';
import { resolvePlansNextBestAction } from '../resolvePlansNextBestAction';
import type { ResolvePlansNextBestActionInput } from '../resolvePlansNextBestAction';
import type { PlansMealGuidanceRow } from '@/lib/plans/home/types';
import { PLANS_NBA_RESOLVER_VERSION } from '../types';

const destinations: ResolvePlansNextBestActionInput['destinations'] = {
  setupMealRhythm: '/app/plans/rhythm',
  setupPantry: '/app/food/pantry',
  planToday: '/app/plans/day/2026-08-16',
  finishToday: '/app/plans/day/2026-08-16',
  planAhead: '/app/plans/week?action=generate',
  reviewPlan: '/app/plans/week',
  grocery: '/app/food/groceries/plan/plan-1?date=2026-08-16',
};

function base(
  overrides: Partial<ResolvePlansNextBestActionInput> = {},
): ResolvePlansNextBestActionInput {
  return {
    guidanceStatus: 'ready',
    hasSchedule: true,
    todayCoverage: 'empty',
    forwardCoveredDayCount: 0,
    forwardHorizonDays: PLANS_FORWARD_COVERAGE_POLICY.horizonDays,
    pantry: { kind: 'ok', pantryItemsSaved: 4 },
    groceryDemand: false,
    destinations,
    ...overrides,
  };
}

function row(state: PlansMealGuidanceRow['state']): PlansMealGuidanceRow {
  return {
    slotKey: 'breakfast',
    targetTimeLabel: '11:00',
    targetTimeValue: '11:00',
    label: 'Breakfast',
    mealName: state === 'empty' ? null : 'Oats',
    mealId: state === 'empty' ? null : 'meal-1',
    state,
  };
}

describe('resolvePlansNextBestAction', () => {
  it('is deterministic for the same input', () => {
    const input = base({ todayCoverage: 'partial' });
    expect(resolvePlansNextBestAction(input)).toEqual(resolvePlansNextBestAction(input));
    expect(resolvePlansNextBestAction(input).resolverVersion).toBe(PLANS_NBA_RESOLVER_VERSION);
  });

  it('does not mutate the input object', () => {
    const input = base();
    const frozen = Object.freeze({
      ...input,
      destinations: Object.freeze({ ...input.destinations }),
      pantry: Object.freeze({ ...input.pantry }),
    });
    expect(() => resolvePlansNextBestAction(frozen)).not.toThrow();
  });

  it('1. no meal rhythm → setup_meal_rhythm is primary', () => {
    const decision = resolvePlansNextBestAction(
      base({ hasSchedule: false, guidanceStatus: 'no_schedule' }),
    );
    expect(decision.stateKey).toBe('setup_meal_rhythm');
    expect(decision.primary?.actionId).toBe('setup_meal_rhythm');
    expect(decision.primary?.destination).toBe(destinations.setupMealRhythm);
    expect(decision.confidence).toBe('deterministic');
  });

  it('2. rhythm present + pantry weak → pantry primary and plan without pantry secondary', () => {
    const decision = resolvePlansNextBestAction(
      base({
        pantry: { kind: 'weak', reason: 'no_pantry', pantryItemsSaved: 0 },
        todayCoverage: 'empty',
      }),
    );
    expect(decision.stateKey).toBe('setup_pantry');
    expect(decision.primary?.actionId).toBe('setup_pantry');
    expect(decision.secondary?.actionId).toBe('plan_without_pantry');
    expect(decision.confidence).toBe('inferred');
  });

  it('3. today empty → plan_today primary', () => {
    const decision = resolvePlansNextBestAction(base({ todayCoverage: 'empty' }));
    expect(decision.stateKey).toBe('plan_today');
    expect(decision.primary?.actionId).toBe('plan_today');
  });

  it('4. today partial → finish_today primary', () => {
    const decision = resolvePlansNextBestAction(base({ todayCoverage: 'partial' }));
    expect(decision.stateKey).toBe('finish_today');
    expect(decision.primary?.actionId).toBe('finish_today');
  });

  it('5. today covered + future weak → plan_ahead primary', () => {
    const decision = resolvePlansNextBestAction(
      base({ todayCoverage: 'covered', forwardCoveredDayCount: 1 }),
    );
    expect(decision.stateKey).toBe('plan_ahead');
    expect(decision.primary?.actionId).toBe('plan_ahead');
    expect(isForwardCoverageWeak(1)).toBe(true);
  });

  it('6. today/future covered → review_plan', () => {
    const decision = resolvePlansNextBestAction(
      base({ todayCoverage: 'covered', forwardCoveredDayCount: 4 }),
    );
    expect(decision.stateKey).toBe('review_plan');
    expect(decision.primary?.actionId).toBe('review_plan');
  });

  it('7. grocery demand while planning incomplete remains secondary', () => {
    const decision = resolvePlansNextBestAction(
      base({ todayCoverage: 'empty', groceryDemand: true }),
    );
    expect(decision.stateKey).toBe('plan_today');
    expect(decision.primary?.actionId).toBe('plan_today');
    expect(decision.secondary?.actionId).toBe('open_grocery');
  });

  it('8. errored pantry reads do not invent pantry certainty', () => {
    const decision = resolvePlansNextBestAction(
      base({ pantry: { kind: 'error' }, todayCoverage: 'partial' }),
    );
    expect(decision.stateKey).toBe('finish_today');
    expect(decision.stateKey).not.toBe('setup_pantry');
    expect(decision.confidence).toBe('deterministic');
  });

  it('8b. loading guidance does not present a resolved action', () => {
    const decision = resolvePlansNextBestAction(
      base({ guidanceStatus: 'loading', hasSchedule: false }),
    );
    expect(decision.stateKey).toBe('loading');
    expect(decision.primary).toBeNull();
    expect(decision.confidence).toBe('unknown');
  });

  it('does not let grocery outrank meal rhythm or pantry', () => {
    const rhythm = resolvePlansNextBestAction(
      base({
        hasSchedule: false,
        guidanceStatus: 'no_schedule',
        groceryDemand: true,
      }),
    );
    expect(rhythm.primary?.actionId).toBe('setup_meal_rhythm');
    expect(rhythm.secondary).toBeNull();

    const pantry = resolvePlansNextBestAction(
      base({
        pantry: { kind: 'weak', reason: 'empty', pantryItemsSaved: 0 },
        groceryDemand: true,
      }),
    );
    expect(pantry.primary?.actionId).toBe('setup_pantry');
    expect(pantry.secondary?.actionId).toBe('plan_without_pantry');
  });
});

describe('coverageFromRows', () => {
  it('classifies empty, partial, and covered days', () => {
    expect(coverageFromRows([row('empty'), row('empty')])).toBe('empty');
    expect(coverageFromRows([row('pending'), row('empty')])).toBe('partial');
    expect(coverageFromRows([row('eaten'), row('skipped')])).toBe('covered');
  });
});
