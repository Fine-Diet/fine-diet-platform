import { getPlansHomeFixture } from '@/lib/plans/home/fixtures';
import { buildFixturePlansNbaInput } from '../fromPlansHome';
import { resolvePlansNextBestAction } from '../resolvePlansNextBestAction';

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
    expect(decision.primary?.destination).toContain('#meal-schedule');
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
    expect(decision.secondary?.actionId).toBe('plan_without_pantry');
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
  });

  it('maps pantry_error fixture without inventing pantry setup', () => {
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
  });
});
