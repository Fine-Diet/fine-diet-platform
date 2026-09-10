import { describe, expect, test } from '@jest/globals';
import {
  buildProgramDayRail,
  buildProgramEnrollmentRequest,
  getProgramRoadmapItems,
  localDateKey,
  resolveProgramDuration,
} from '@/lib/programs/programDeliveryNavigation';
import { PROGRAM_PREVIEW_DELIVERY_MODULES } from '@/lib/programs/programPreviewFixtures';
import { resolveProgramPreviewRuntime } from '@/lib/programs/programPreviewFixtures';

describe('Program delivery navigation', () => {
  test('keeps Day 0 available and fails future active days closed', () => {
    const rail = buildProgramDayRail({
      durationDays: 7,
      runtimeStatus: 'active',
      currentDay: 3,
    });

    expect(rail[0]).toMatchObject({ day: 0, accessible: true, state: 'setup' });
    expect(rail[2]).toMatchObject({ day: 2, accessible: true, state: 'review' });
    expect(rail[3]).toMatchObject({ day: 3, accessible: true, state: 'current' });
    expect(rail[4]).toMatchObject({ day: 4, accessible: false, state: 'locked' });
  });

  test('locks every delivery day before the selected start date', () => {
    const rail = buildProgramDayRail({
      durationDays: 3,
      runtimeStatus: 'pre_start',
      currentDay: 0,
    });

    expect(rail[0].accessible).toBe(true);
    expect(rail.slice(1).every((item) => !item.accessible)).toBe(true);
  });

  test('builds the canonical enrollment request without unrelated fields', () => {
    expect(
      buildProgramEnrollmentRequest({
        programSlug: 'baseline',
        selectedStartDate: '2026-09-15',
        timezone: 'America/Chicago',
      }),
    ).toEqual({
      program_slug: 'baseline',
      selected_start_date: '2026-09-15',
      timezone: 'America/Chicago',
    });
  });

  test('uses local calendar fields rather than UTC serialization', () => {
    expect(localDateKey(new Date(2026, 8, 10, 23, 30))).toBe('2026-09-10');
  });

  test('uses version duration and existing roadmap module data', () => {
    const runtime = resolveProgramPreviewRuntime({ stateId: 'active-day-5' });
    expect(
      resolveProgramDuration(runtime.runtimeSummary, PROGRAM_PREVIEW_DELIVERY_MODULES),
    ).toBe(21);
    expect(getProgramRoadmapItems(PROGRAM_PREVIEW_DELIVERY_MODULES).length).toBeGreaterThan(0);
  });
});
