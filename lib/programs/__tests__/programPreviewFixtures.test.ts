import { describe, expect, test } from '@jest/globals';
import {
  PROGRAM_PREVIEW_STATES,
  getProgramPreviewCapacity,
  getProgramPreviewState,
  getProgramPreviewSurface,
  resolveProgramPreviewRuntime,
} from '@/lib/programs/programPreviewFixtures';
import {
  isBaselineCheckinDue,
  isDay21Handled,
  shouldShowRecommendationReveal,
} from '@/lib/programs/runtimeUi';

describe('program preview fixtures', () => {
  test('exposes all requested runtime states', () => {
    expect(PROGRAM_PREVIEW_STATES.map((state) => state.id)).toEqual([
      'locked',
      'access-no-enrollment',
      'pre-start',
      'active-day-1',
      'active-day-7-checkin-due',
      'active-day-8',
      'active-day-14-checkin-due',
      'active-day-15',
      'active-day-21-checkin-due',
      'day-21-handled-placeholder',
      'day-21-handled-recommendation',
      'paused',
      'completed',
      'cancelled',
    ]);
  });

  test('resolves locked state without access or enrollment data', () => {
    const preview = resolveProgramPreviewRuntime({ stateId: 'locked' });

    expect(preview.hasAccess).toBe(false);
    expect(preview.runtimeSummary).toBeNull();
    expect(preview.libraryDetail.has_entitlement).toBe(false);
    expect(preview.libraryDetail.access_state).toBe('unavailable');
  });

  test('resolves access without enrollment as entitlement fixture only', () => {
    const preview = resolveProgramPreviewRuntime({
      stateId: 'access-no-enrollment',
    });

    expect(preview.hasAccess).toBe(true);
    expect(preview.runtimeSummary).toBeNull();
    expect(preview.libraryDetail.has_entitlement).toBe(true);
    expect(preview.progressSummary).toBeNull();
  });

  test('marks weekly check-in states as due', () => {
    for (const stateId of [
      'active-day-7-checkin-due',
      'active-day-14-checkin-due',
      'active-day-21-checkin-due',
    ]) {
      const preview = resolveProgramPreviewRuntime({ stateId });
      expect(isBaselineCheckinDue(preview.runtimeSummary)).toBe(true);
    }
  });

  test('resolves day 21 handled states with placeholder or stored recommendation', () => {
    const placeholder = resolveProgramPreviewRuntime({
      stateId: 'day-21-handled-placeholder',
    });
    const stored = resolveProgramPreviewRuntime({
      stateId: 'day-21-handled-recommendation',
    });

    expect(isDay21Handled(placeholder.runtimeSummary)).toBe(true);
    expect(shouldShowRecommendationReveal(placeholder.runtimeSummary)).toBe(true);
    expect(placeholder.runtimeSummary?.latest_recommendation).toBeNull();

    expect(isDay21Handled(stored.runtimeSummary)).toBe(true);
    expect(stored.runtimeSummary?.latest_recommendation).toMatchObject({
      recommendation_type: 'baseline_day_21_v1',
      status: 'generated',
    });
  });

  test('normalizes invalid query controls to safe defaults', () => {
    expect(getProgramPreviewState('missing').id).toBe('locked');
    expect(getProgramPreviewSurface('missing')).toBe('hub');
    expect(getProgramPreviewCapacity('overloaded')).toBe('steady');
  });
});
