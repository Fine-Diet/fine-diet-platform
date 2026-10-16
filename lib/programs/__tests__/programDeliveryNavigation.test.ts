import { describe, expect, test } from '@jest/globals';
import { PROGRAM_PREVIEW_TEST_AUDIO_PATH } from '@/lib/programs/deliveryComposition';
import {
  authorizedReturnDay,
  buildProgramDayRail,
  buildProgramEnrollmentRequest,
  deriveDayTabLabel,
  deriveHeroDayContext,
  getProgramRoadmapItems,
  localDateKey,
  numberedProgramDayRail,
  resolveCommentaryAudio,
  resolveProgramDuration,
  twoDigitDay,
  weekOrdinalLabel,
} from '@/lib/programs/programDeliveryNavigation';
import { SYNTHETIC_PROGRAM_BLUEPRINT } from '@/lib/programs/programBlueprintExamples';
import {
  BASELINE_PREP_DELIVERY_MODULES,
  BASELINE_WEEK_DELIVERY_MODULES,
} from '@/lib/programs/baselineDeliveryModules';
import { PROGRAM_PREVIEW_DELIVERY_MODULES } from '@/lib/programs/programPreviewFixtures';
import { resolveProgramPreviewRuntime } from '@/lib/programs/programPreviewFixtures';

const baselineModules = [
  ...BASELINE_PREP_DELIVERY_MODULES,
  ...BASELINE_WEEK_DELIVERY_MODULES,
];

describe('Program delivery navigation', () => {
  test.each([
    [0, '00'],
    [1, '01'],
    [9, '09'],
    [10, '10'],
  ])('formats day %s with two digits', (day, expected) => {
    expect(twoDigitDay(day)).toBe(expected);
  });

  test.each([
    [1, 'Week One'],
    [2, 'Week Two'],
    [10, 'Week Ten'],
  ])('formats week %s as an ordinal label', (week, expected) => {
    expect(weekOrdinalLabel(week)).toBe(expected);
  });

  test('derives authored hero context from delivery module bounds', () => {
    expect(deriveHeroDayContext(0, [])).toBe('00 — Setup');
    expect(deriveHeroDayContext(0, baselineModules)).toBe(
      '00 — Baseline Setup',
    );
    expect(deriveHeroDayContext(1, baselineModules)).toBe(
      '01 — Week One — Eating Rhythm',
    );
    expect(deriveHeroDayContext(8, baselineModules)).toBe(
      '08 — Week Two — Digestion & Recovery Support',
    );
  });

  test('derives named day tabs without hardcoded program copy', () => {
    expect(deriveDayTabLabel(0, baselineModules)).toBe('Setup');
    expect(deriveDayTabLabel(1, baselineModules)).toBe(
      'Day 01: Nourish before you optimize',
    );
  });

  test('prefers an exact-day authored title over a ranged practice title', () => {
    const modules = [
      ...baselineModules,
      {
        ...BASELINE_WEEK_DELIVERY_MODULES[1],
        id: 'exact-day-title',
        title: 'Notice the first signal',
        dayStart: 2,
        dayEnd: 2,
      },
    ];

    expect(deriveDayTabLabel(2, modules)).toBe(
      'Day 02: Notice the first signal',
    );
  });

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

  test('numbers the active rail from day 1 through the program duration', () => {
    const baseline = numberedProgramDayRail(buildProgramDayRail({
      durationDays: 21,
      runtimeStatus: 'active',
      currentDay: 7,
    }));
    const synthetic = numberedProgramDayRail(buildProgramDayRail({
      durationDays: SYNTHETIC_PROGRAM_BLUEPRINT.version.durationDays,
      runtimeStatus: 'active',
      currentDay: 2,
    }));

    expect(baseline.map((item) => item.day)).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 1),
    );
    expect(baseline.some((item) => item.day === 0)).toBe(false);
    expect(synthetic.map((item) => item.day)).toEqual([1, 2, 3, 4, 5]);
    expect(synthetic.find((item) => item.day === 2)?.state).toBe('current');
    expect(synthetic.find((item) => item.day === 1)?.state).toBe('review');
    expect(synthetic.find((item) => item.day === 3)?.state).toBe('locked');
  });

  test('returns to the authorized runtime day and withholds locked or pre-start days', () => {
    const active = buildProgramDayRail({
      durationDays: 21,
      runtimeStatus: 'active',
      currentDay: 7,
    });
    expect(authorizedReturnDay(active, 'active', 7)).toBe(7);
    expect(authorizedReturnDay(active, 'paused', 7)).toBe(7);
    expect(authorizedReturnDay(active, 'pre_start', 0)).toBeNull();
    expect(authorizedReturnDay(active, 'active', 0)).toBeNull();
    expect(authorizedReturnDay(active, 'active', 8)).toBeNull();
  });

  test('resolves only genuine day-scoped audio and rejects the development recording', () => {
    expect(resolveCommentaryAudio(null)).toEqual({
      available: false,
      src: null,
      title: null,
      description: null,
    });
    expect(resolveCommentaryAudio({
      type: 'audio',
      id: 'test-file',
      url: PROGRAM_PREVIEW_TEST_AUDIO_PATH,
      title: 'Development recording',
      description: 'Not a Baseline recording',
    })).toEqual({
      available: false,
      src: null,
      title: null,
      description: null,
    });
    expect(resolveCommentaryAudio({
      type: 'video',
      id: 'video',
      url: 'https://example.com/setup.mp4',
      title: 'Video',
    }).available).toBe(false);
    expect(resolveCommentaryAudio({
      type: 'audio',
      id: 'day-0',
      url: 'https://example.com/day-0-commentary.mp3',
      title: ' Day zero commentary ',
      description: ' Authored description ',
    })).toEqual({
      available: true,
      src: 'https://example.com/day-0-commentary.mp3',
      title: 'Day zero commentary',
      description: 'Authored description',
    });
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
