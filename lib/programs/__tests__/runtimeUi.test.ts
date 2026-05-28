import type {
  ProgramRecommendation,
  ProgramRuntimeSummary,
} from '../runtimeTypes';
import {
  formatRecommendedStepLabel,
  getRecommendationRevealDetails,
  getBaselineWeekOneCapacityCopy,
  getBaselineWeekThreeCapacityCopy,
  getBaselineWeekTwoCapacityCopy,
  isBaselineCheckinDue,
  isDay21Handled,
  resolveBaselineCardRuntimeState,
  resolveBaselineDetailRuntimeState,
  resolveBaselinePrepModuleAccess,
  shouldShowBaselineWeekOneModules,
  shouldShowBaselineWeekThreeModules,
  shouldShowBaselineWeekTwoModules,
  shouldShowRecommendationReveal,
} from '../runtimeUi';

function summary(
  resolvedStatus: ProgramRuntimeSummary['resolved_status'],
  currentDay = resolvedStatus === 'pre_start' ? 0 : 1,
  options: {
    templateDay?: number | null;
    latestResponseDay?: number | null;
    latestResponseStatus?: 'completed' | 'skipped';
    latestRecommendation?: ProgramRecommendation | null;
  } = {},
): ProgramRuntimeSummary {
  return {
    enrollment: {} as ProgramRuntimeSummary['enrollment'],
    version: {} as ProgramRuntimeSummary['version'],
    program: {
      id: 'program-1',
      slug: 'baseline',
      title: 'Baseline',
      tagline: null,
      description: null,
      storefront_href: null,
    },
    resolved_status: resolvedStatus,
    current_day: currentDay,
    timezone: 'UTC',
    next_checkin_template:
      options.templateDay == null
        ? null
        : ({
            id: `template-${options.templateDay}`,
            checkin_day: options.templateDay,
          } as ProgramRuntimeSummary['next_checkin_template']),
    latest_checkin_response:
      options.latestResponseDay == null
        ? null
        : ({
            id: `response-${options.latestResponseDay}`,
            checkin_day: options.latestResponseDay,
            response_status: options.latestResponseStatus ?? 'completed',
          } as ProgramRuntimeSummary['latest_checkin_response']),
    latest_recommendation: options.latestRecommendation ?? null,
    resolved_at: '2026-05-27T00:00:00.000Z',
  };
}

function recommendation(
  payload: Record<string, unknown>,
  status: ProgramRecommendation['status'] = 'generated',
): ProgramRecommendation {
  return {
    id: 'recommendation-1',
    enrollment_id: 'enrollment-1',
    based_on_checkin_response_id: 'response-21',
    recommendation_type: 'runtime_summary',
    program_day: 21,
    status,
    recommendation_payload_json: payload,
    input_snapshot_json: {},
    computed_metrics_snapshot_json: {},
    metadata: {},
    generated_at: '2026-05-27T00:00:00.000Z',
    acted_at: null,
    created_at: '2026-05-27T00:00:00.000Z',
    updated_at: '2026-05-27T00:00:00.000Z',
  };
}

describe('resolveBaselineCardRuntimeState', () => {
  test('locks Baseline without access or enrollment', () => {
    expect(
      resolveBaselineCardRuntimeState({ hasAccess: false, summary: null }),
    ).toBe('locked');
  });

  test('shows start flow when access exists without enrollment', () => {
    expect(
      resolveBaselineCardRuntimeState({ hasAccess: true, summary: null }),
    ).toBe('start_ready');
  });

  test.each([
    ['pre_start', 'pre_start'],
    ['active', 'active'],
    ['paused', 'paused'],
    ['completed', 'completed'],
    ['cancelled', 'cancelled'],
  ] as const)('maps %s enrollment state', (runtimeStatus, cardState) => {
    expect(
      resolveBaselineCardRuntimeState({
        hasAccess: true,
        summary: summary(runtimeStatus),
      }),
    ).toBe(cardState);
  });
});

describe('resolveBaselinePrepModuleAccess', () => {
  test('hides prep modules without an enrollment summary', () => {
    expect(resolveBaselinePrepModuleAccess(null)).toBe('hidden');
  });

  test('shows prep modules as primary work before start', () => {
    expect(resolveBaselinePrepModuleAccess(summary('pre_start', 0))).toBe(
      'primary',
    );
  });

  test('shows prep modules as primary work on runtime day 0', () => {
    expect(resolveBaselinePrepModuleAccess(summary('active', 0))).toBe(
      'primary',
    );
  });

  test('keeps prep modules available as reference once active', () => {
    expect(resolveBaselinePrepModuleAccess(summary('active', 3))).toBe(
      'reference',
    );
  });

  test.each(['paused', 'completed', 'cancelled'] as const)(
    'hides prep modules for %s enrollments',
    (status) => {
      expect(resolveBaselinePrepModuleAccess(summary(status, 4))).toBe(
        'hidden',
      );
    },
  );
});

describe('resolveBaselineDetailRuntimeState', () => {
  test('uses not_in_library for inaccessible detail routes', () => {
    expect(
      resolveBaselineDetailRuntimeState({
        inLibrary: false,
        hasAccess: false,
        summary: null,
      }),
    ).toBe('not_in_library');
  });

  test('uses start_ready for accessible library detail without enrollment', () => {
    expect(
      resolveBaselineDetailRuntimeState({
        inLibrary: true,
        hasAccess: true,
        summary: null,
      }),
    ).toBe('start_ready');
  });

  test('maps runtime enrollment status for detail delivery', () => {
    expect(
      resolveBaselineDetailRuntimeState({
        inLibrary: true,
        hasAccess: true,
        summary: summary('active'),
      }),
    ).toBe('active');
  });
});

describe('isBaselineCheckinDue', () => {
  test.each([7, 14, 21])('shows due for active Baseline day %s', (day) => {
    expect(
      isBaselineCheckinDue(
        summary('active', day, {
          templateDay: day,
          latestResponseDay: day - 7,
        }),
      ),
    ).toBe(true);
  });

  test('does not show due for non-check-in days', () => {
    expect(
      isBaselineCheckinDue(summary('active', 8, { templateDay: null })),
    ).toBe(false);
  });

  test('does not show due when runtime is not active', () => {
    expect(
      isBaselineCheckinDue(summary('paused', 7, { templateDay: 7 })),
    ).toBe(false);
  });

  test('does not show due without the seeded current-day template', () => {
    expect(
      isBaselineCheckinDue(summary('active', 7, { templateDay: null })),
    ).toBe(false);
  });

  test('does not show due after the current day was handled', () => {
    expect(
      isBaselineCheckinDue(
        summary('active', 14, {
          templateDay: 14,
          latestResponseDay: 14,
        }),
      ),
    ).toBe(false);
  });
});

describe('Baseline Week 1 helpers', () => {
  test.each([1, 3, 7])('shows Week 1 modules on active day %s', (day) => {
    expect(shouldShowBaselineWeekOneModules(summary('active', day))).toBe(true);
  });

  test.each([0, 8, 14, 21])(
    'does not show Week 1 modules on day %s',
    (day) => {
      expect(shouldShowBaselineWeekOneModules(summary('active', day))).toBe(
        false,
      );
    },
  );

  test('does not show Week 1 modules outside active runtime', () => {
    expect(shouldShowBaselineWeekOneModules(summary('paused', 3))).toBe(false);
    expect(shouldShowBaselineWeekOneModules(null)).toBe(false);
  });

  test('returns low capacity Week 1 copy', () => {
    const copy = getBaselineWeekOneCapacityCopy('low');

    expect(copy.label).toBe('Low capacity');
    expect(copy.body).toContain('prioritize timing over variety');
  });

  test('returns steady capacity Week 1 copy by default', () => {
    const copy = getBaselineWeekOneCapacityCopy(null);

    expect(copy.label).toBe('Steady capacity');
    expect(copy.practice).toContain('breakfast and lunch rhythm');
  });

  test('returns high capacity Week 1 copy', () => {
    const copy = getBaselineWeekOneCapacityCopy('high');

    expect(copy.label).toBe('High capacity');
    expect(copy.body).toContain('not a stricter plan');
  });
});

describe('Baseline Week 2 helpers', () => {
  test.each([8, 11, 14])('shows Week 2 modules on active day %s', (day) => {
    expect(shouldShowBaselineWeekTwoModules(summary('active', day))).toBe(true);
  });

  test.each([1, 7, 15, 21])(
    'does not show Week 2 modules on day %s',
    (day) => {
      expect(shouldShowBaselineWeekTwoModules(summary('active', day))).toBe(
        false,
      );
    },
  );

  test('does not show Week 2 modules outside active runtime', () => {
    expect(shouldShowBaselineWeekTwoModules(summary('paused', 10))).toBe(false);
    expect(shouldShowBaselineWeekTwoModules(null)).toBe(false);
  });

  test('returns low capacity Week 2 copy', () => {
    const copy = getBaselineWeekTwoCapacityCopy('low');

    expect(copy.label).toBe('Low capacity');
    expect(copy.body).toContain('slow the first few bites');
  });

  test('returns steady capacity Week 2 copy by default', () => {
    const copy = getBaselineWeekTwoCapacityCopy(null);

    expect(copy.label).toBe('Steady capacity');
    expect(copy.body).toContain('wake or wind-down cue');
  });

  test('returns high capacity Week 2 copy', () => {
    const copy = getBaselineWeekTwoCapacityCopy('high');

    expect(copy.label).toBe('High capacity');
    expect(copy.body).toContain('without turning it into stricter rules');
  });
});

describe('Baseline Week 3 helpers', () => {
  test.each([15, 18, 21])('shows Week 3 modules on active day %s', (day) => {
    expect(shouldShowBaselineWeekThreeModules(summary('active', day))).toBe(
      true,
    );
  });

  test.each([7, 14, 22])(
    'does not show Week 3 modules on day %s',
    (day) => {
      expect(shouldShowBaselineWeekThreeModules(summary('active', day))).toBe(
        false,
      );
    },
  );

  test('does not show Week 3 modules outside active runtime', () => {
    expect(shouldShowBaselineWeekThreeModules(summary('paused', 18))).toBe(
      false,
    );
    expect(shouldShowBaselineWeekThreeModules(null)).toBe(false);
  });

  test('returns low capacity Week 3 copy', () => {
    const copy = getBaselineWeekThreeCapacityCopy('low');

    expect(copy.label).toBe('Low capacity');
    expect(copy.body).toContain('one reliable meal');
  });

  test('returns steady capacity Week 3 copy by default', () => {
    const copy = getBaselineWeekThreeCapacityCopy(null);

    expect(copy.label).toBe('Steady capacity');
    expect(copy.practice).toContain('one adjustment');
  });

  test('returns high capacity Week 3 copy', () => {
    const copy = getBaselineWeekThreeCapacityCopy('high');

    expect(copy.label).toBe('High capacity');
    expect(copy.body).toContain('without making Baseline stricter');
  });
});

describe('Baseline recommendation reveal helpers', () => {
  test('keeps reveal hidden before Day 21 is handled', () => {
    const runtimeSummary = summary('active', 21, {
      templateDay: 21,
      latestResponseDay: 14,
    });

    expect(isDay21Handled(runtimeSummary)).toBe(false);
    expect(shouldShowRecommendationReveal(runtimeSummary)).toBe(false);
  });

  test('shows reveal after Day 21 is completed', () => {
    const runtimeSummary = summary('active', 21, {
      templateDay: 21,
      latestResponseDay: 21,
      latestResponseStatus: 'completed',
    });

    expect(isDay21Handled(runtimeSummary)).toBe(true);
    expect(shouldShowRecommendationReveal(runtimeSummary)).toBe(true);
  });

  test('shows reveal after Day 21 is skipped', () => {
    const runtimeSummary = summary('active', 21, {
      templateDay: 21,
      latestResponseDay: 21,
      latestResponseStatus: 'skipped',
    });

    expect(isDay21Handled(runtimeSummary)).toBe(true);
    expect(shouldShowRecommendationReveal(runtimeSummary)).toBe(true);
  });

  test('extracts stored recommendation display fields when present', () => {
    const details = getRecommendationRevealDetails(
      recommendation(
        {
          action_type: 'review',
          recommended_step: 'baseline_maintenance',
          reason_snippet: 'Baseline signals look steady enough to review.',
        },
        'generated',
      ),
    );

    expect(details).toEqual({
      actionType: 'review',
      recommendedStep: 'baseline_maintenance',
      reasonSnippet: 'Baseline signals look steady enough to review.',
      status: 'generated',
    });
    expect(formatRecommendedStepLabel(details?.recommendedStep ?? null)).toBe(
      'Baseline Maintenance',
    );
  });

  test('supports placeholder state when no recommendation row exists', () => {
    expect(getRecommendationRevealDetails(null)).toBeNull();
    expect(formatRecommendedStepLabel(null)).toBe('Not set');
  });
});
