import { getPlansHomeFixture } from '@/lib/plans/home/fixtures';
import { buildFixturePlansNbaInput, buildLivePlansNbaInput } from '../fromPlansHome';
import { resolvePlansNextBestAction } from '../resolvePlansNextBestAction';
import type { PlansMealGuidanceViewModel } from '@/lib/plans/home/types';

describe('Plans Home fixtures through NBA resolver', () => {
  it('maps no_schedule fixture to meal-rhythm setup', () => {
    const fixture = getPlansHomeFixture('no_schedule');
    const decision = resolvePlansNextBestAction(
      buildFixturePlansNbaInput({
        today: fixture.guidance.selectedDate,
        guidance: fixture.guidance,
        pantry: fixture.pantry,
      }),
    );
    expect(decision.stateKey).toBe('setup_meal_rhythm');
    expect(decision.primary?.destination).toBe('/app/plans/rhythm');
  });

  it('maps pantry_empty fixture to pantry setup with plan-without-pantry secondary', () => {
    const fixture = getPlansHomeFixture('pantry_empty');
    const decision = resolvePlansNextBestAction(
      buildFixturePlansNbaInput({
        today: fixture.guidance.selectedDate,
        guidance: fixture.guidance,
        pantry: fixture.pantry,
      }),
    );
    expect(decision.stateKey).toBe('setup_pantry');
    expect(decision.primary?.destination).toBe('/app/food/pantry?start=quick');
    expect(decision.secondary?.actionId).toBe('plan_without_pantry');
  });

  it('maps pantry_no_list fixture past setup_pantry because grocery absence is not pantry weakness', () => {
    const fixture = getPlansHomeFixture('pantry_no_list');
    const decision = resolvePlansNextBestAction(
      buildFixturePlansNbaInput({
        today: fixture.guidance.selectedDate,
        guidance: fixture.guidance,
        pantry: fixture.pantry,
      }),
    );
    expect(decision.stateKey).not.toBe('setup_pantry');
  });

  it('maps empty_day fixture to plan_today', () => {
    const fixture = getPlansHomeFixture('empty_day');
    const decision = resolvePlansNextBestAction(
      buildFixturePlansNbaInput({
        today: fixture.guidance.selectedDate,
        guidance: fixture.guidance,
        pantry: fixture.pantry,
      }),
    );
    expect(decision.stateKey).toBe('plan_today');
    expect(decision.primary?.destination).toBe('/app/plans/today');
  });

  it('maps pantry_error fixture to finish_today on Simplified Plan Today', () => {
    const fixture = getPlansHomeFixture('pantry_error');
    const decision = resolvePlansNextBestAction(
      buildFixturePlansNbaInput({
        today: fixture.guidance.selectedDate,
        guidance: fixture.guidance,
        pantry: fixture.pantry,
      }),
    );
    expect(decision.stateKey).not.toBe('setup_pantry');
    expect(decision.stateKey).toBe('finish_today');
    expect(decision.primary?.destination).toBe('/app/plans/today');
  });
});

describe('buildLivePlansNbaInput pantry fallback', () => {
  const guidance: PlansMealGuidanceViewModel = {
    status: 'ready',
    selectedDate: '2026-08-16',
    days: [],
    rows: [],
    planId: 'plan-1',
  };

  it('does not recommend setup_pantry while pantry readiness is loading or errored', () => {
    const loading = resolvePlansNextBestAction(
      buildLivePlansNbaInput({
        today: '2026-08-16',
        todayGuidance: guidance,
        hasSchedule: true,
        days: [],
        meals: [],
        plan: null,
        pantryLoadState: 'loading',
        pantrySummary: null,
      }),
    );
    expect(loading.stateKey).not.toBe('setup_pantry');

    const errored = resolvePlansNextBestAction(
      buildLivePlansNbaInput({
        today: '2026-08-16',
        todayGuidance: guidance,
        hasSchedule: true,
        days: [],
        meals: [],
        plan: null,
        pantryLoadState: 'error',
        pantrySummary: null,
      }),
    );
    expect(errored.stateKey).not.toBe('setup_pantry');
  });
});
