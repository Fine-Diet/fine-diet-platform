import type { ProgramRuntimeSummary } from '../runtimeTypes';
import {
  BASELINE_PREP_DELIVERY_MODULES,
  BASELINE_WEEK_DELIVERY_MODULES,
} from '../baselineDeliveryModules';
import {
  filterVisibleDeliveryModules,
  isDeliveryModuleVisible,
  resolveDeliveryModuleCopy,
  type ProgramDeliveryModuleDefinition,
} from '../deliveryModuleTypes';

function summary(
  status: ProgramRuntimeSummary['resolved_status'],
  currentDay: number,
  capacity: ProgramRuntimeSummary['enrollment']['current_capacity'] = 'steady',
): ProgramRuntimeSummary {
  return {
    enrollment: {
      current_capacity: capacity,
    } as ProgramRuntimeSummary['enrollment'],
    version: {} as ProgramRuntimeSummary['version'],
    program: {
      id: 'program-1',
      slug: 'baseline',
      title: 'Baseline',
      tagline: null,
      description: null,
      storefront_href: null,
    },
    resolved_status: status,
    current_day: currentDay,
    timezone: 'UTC',
    next_checkin_template: null,
    latest_checkin_response: null,
    latest_recommendation: null,
    resolved_at: '2026-05-27T00:00:00.000Z',
  };
}

const weekModule: ProgramDeliveryModuleDefinition = {
  id: 'week-1',
  programSlug: 'baseline',
  moduleType: 'week',
  title: 'Week 1',
  body: 'Week 1 body',
  dayStart: 1,
  dayEnd: 7,
  statusVisibility: ['active'],
};

describe('delivery module visibility', () => {
  test('shows active day-range modules inside the range', () => {
    expect(
      isDeliveryModuleVisible(weekModule, {
        runtimeSummary: summary('active', 3),
      }),
    ).toBe(true);
  });

  test('hides active day-range modules outside the range', () => {
    expect(
      isDeliveryModuleVisible(weekModule, {
        runtimeSummary: summary('active', 8),
      }),
    ).toBe(false);
  });

  test('hides active modules for paused state', () => {
    expect(
      isDeliveryModuleVisible(weekModule, {
        runtimeSummary: summary('paused', 3),
      }),
    ).toBe(false);
  });

  test('supports condition-gated check-in modules', () => {
    const checkinModule: ProgramDeliveryModuleDefinition = {
      ...weekModule,
      id: 'day-7-checkin',
      moduleType: 'checkin_prompt',
      dayStart: 7,
      dayEnd: 7,
      showWhen: 'checkin_due',
    };

    expect(
      isDeliveryModuleVisible(checkinModule, {
        runtimeSummary: summary('active', 7),
        checkinDue: true,
      }),
    ).toBe(true);
    expect(
      isDeliveryModuleVisible(checkinModule, {
        runtimeSummary: summary('active', 7),
        checkinDue: false,
      }),
    ).toBe(false);
  });

  test('filters modules in source order', () => {
    const visible = filterVisibleDeliveryModules(
      [
        weekModule,
        { ...weekModule, id: 'week-2', dayStart: 8, dayEnd: 14 },
      ],
      { runtimeSummary: summary('active', 9) },
    );

    expect(visible.map((module) => module.id)).toEqual(['week-2']);
  });
});

describe('delivery module copy', () => {
  test('uses capacity variants over base copy', () => {
    const copy = resolveDeliveryModuleCopy(
      {
        ...weekModule,
        capacityVariants: {
          low: {
            title: 'Low title',
            body: 'Low body',
            practice: 'Low practice',
          },
        },
      },
      summary('active', 2, 'low'),
    );

    expect(copy.title).toBe('Low title');
    expect(copy.body).toBe('Low body');
    expect(copy.practice).toBe('Low practice');
  });

  test('uses status copy when capacity copy is absent', () => {
    const copy = resolveDeliveryModuleCopy(
      {
        id: 'prep',
        programSlug: 'baseline',
        moduleType: 'prep',
        title: 'Prep',
        body: 'Prep body',
        statusVisibility: ['pre_start', 'active'],
        statusCopy: {
          active: {
            title: 'Reference title',
          },
        },
      },
      summary('active', 4),
    );

    expect(copy.title).toBe('Reference title');
    expect(copy.body).toBe('Prep body');
  });
});

describe('Baseline delivery module config', () => {
  const weekRangeCases: Array<[number, string[]]> = [
    [
      1,
      [
        'baseline-week-1-focus',
        'baseline-week-1-practice',
        'baseline-week-1-guide',
        'baseline-week-1-capacity',
      ],
    ],
    [
      8,
      [
        'baseline-week-2-focus',
        'baseline-week-2-practice',
        'baseline-week-2-guide',
        'baseline-week-2-capacity',
      ],
    ],
    [
      15,
      [
        'baseline-week-3-focus',
        'baseline-week-3-practice',
        'baseline-week-3-guide',
        'baseline-week-3-capacity',
      ],
    ],
  ];

  const checkinCases: Array<[number, boolean, string[]]> = [
    [
      7,
      true,
      [
        'baseline-week-1-focus',
        'baseline-week-1-practice',
        'baseline-week-1-guide',
        'baseline-week-1-capacity',
        'baseline-day-7-checkin',
      ],
    ],
    [
      7,
      false,
      [
        'baseline-week-1-focus',
        'baseline-week-1-practice',
        'baseline-week-1-guide',
        'baseline-week-1-capacity',
        'baseline-day-7-checkin-handled',
      ],
    ],
    [
      14,
      true,
      [
        'baseline-week-2-focus',
        'baseline-week-2-practice',
        'baseline-week-2-guide',
        'baseline-week-2-capacity',
        'baseline-day-14-checkin',
      ],
    ],
    [
      14,
      false,
      [
        'baseline-week-2-focus',
        'baseline-week-2-practice',
        'baseline-week-2-guide',
        'baseline-week-2-capacity',
        'baseline-day-14-checkin-handled',
      ],
    ],
  ];

  test('shows prep modules before start', () => {
    const visible = filterVisibleDeliveryModules(BASELINE_PREP_DELIVERY_MODULES, {
      runtimeSummary: summary('pre_start', 0),
    });

    expect(visible.map((module) => module.id)).toEqual([
      'baseline-prep-overview',
      'baseline-arrive',
      'baseline-meal-map',
      'baseline-create-meals',
      'baseline-prepare-pantry',
      'baseline-roadmap',
    ]);
  });

  test('keeps day 0 prep copy primary even if runtime status is active', () => {
    const overview = BASELINE_PREP_DELIVERY_MODULES[0];

    expect(resolveDeliveryModuleCopy(overview, summary('active', 0)).title).toBe(
      'Set up your Baseline',
    );
    expect(resolveDeliveryModuleCopy(overview, summary('active', 1)).title).toBe(
      'Prep modules remain available',
    );
  });

  test.each(weekRangeCases)(
    'shows the expected baseline week modules on day %s',
    (day, ids) => {
      const visible = filterVisibleDeliveryModules(
        BASELINE_WEEK_DELIVERY_MODULES,
        {
          runtimeSummary: summary('active', day),
        },
      );

      expect(visible.map((module) => module.id)).toEqual(ids);
    },
  );

  test.each(checkinCases)(
    'switches the baseline day %s check-in module by due state',
    (day, checkinDue, ids) => {
      const visible = filterVisibleDeliveryModules(
        BASELINE_WEEK_DELIVERY_MODULES,
        {
          runtimeSummary: summary('active', day),
          checkinDue,
        },
      );

      expect(visible.map((module) => module.id)).toEqual(ids);
    },
  );

  test('switches day 21 from check-in to recommendation prompt after handling', () => {
    const due = filterVisibleDeliveryModules(BASELINE_WEEK_DELIVERY_MODULES, {
      runtimeSummary: summary('active', 21),
      checkinDue: true,
      day21Handled: false,
    });
    const handled = filterVisibleDeliveryModules(BASELINE_WEEK_DELIVERY_MODULES, {
      runtimeSummary: summary('active', 21),
      checkinDue: false,
      day21Handled: true,
    });

    expect(due.map((module) => module.id)).toContain(
      'baseline-day-21-checkin',
    );
    expect(handled.map((module) => module.id)).toContain(
      'baseline-day-21-recommendation',
    );
  });
});
