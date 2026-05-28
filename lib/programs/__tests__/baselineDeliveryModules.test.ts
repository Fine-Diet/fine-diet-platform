import {
  BASELINE_PREP_DELIVERY_MODULES,
  BASELINE_WEEK_DELIVERY_MODULES,
} from '../baselineDeliveryModules';
import {
  filterVisibleDeliveryModules,
  resolveDeliveryModuleCopy,
} from '../deliveryModuleTypes';
import type { ProgramRuntimeSummary } from '../runtimeTypes';

function summary(
  status: ProgramRuntimeSummary['resolved_status'],
  currentDay: number,
  capacity: ProgramRuntimeSummary['enrollment']['current_capacity'] = 'steady',
): ProgramRuntimeSummary {
  return {
    enrollment: {
      current_capacity: capacity,
      selected_start_date: '2026-05-27',
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

describe('Baseline delivery module config', () => {
  test('shows prep modules before start', () => {
    const visible = filterVisibleDeliveryModules(BASELINE_PREP_DELIVERY_MODULES, {
      runtimeSummary: summary('pre_start', 0),
    });

    expect(visible.map((module) => module.id)).toContain(
      'baseline-prep-overview',
    );
    expect(visible.map((module) => module.id)).toContain('baseline-roadmap');
  });

  test('keeps prep modules visible as active reference', () => {
    const visible = filterVisibleDeliveryModules(BASELINE_PREP_DELIVERY_MODULES, {
      runtimeSummary: summary('active', 9),
    });
    const overview = visible.find(
      (module) => module.id === 'baseline-prep-overview',
    );

    expect(overview).toBeDefined();
    expect(resolveDeliveryModuleCopy(overview!, summary('active', 9)).title).toBe(
      'Prep modules remain available',
    );
  });

  test.each([
    [1, 'baseline-week-1-focus', 'baseline-week-1-capacity'],
    [7, 'baseline-week-1-focus', 'baseline-day-7-checkin'],
    [8, 'baseline-week-2-focus', 'baseline-week-2-capacity'],
    [14, 'baseline-week-2-focus', 'baseline-day-14-checkin'],
    [15, 'baseline-week-3-focus', 'baseline-week-3-capacity'],
    [21, 'baseline-week-3-focus', 'baseline-day-21-checkin'],
  ])('shows expected Baseline modules on day %s', (day, focusId, promptId) => {
    const visible = filterVisibleDeliveryModules(BASELINE_WEEK_DELIVERY_MODULES, {
      runtimeSummary: summary('active', day),
      checkinDue: day === 7 || day === 14 || day === 21,
      day21Handled: false,
    });
    const ids = visible.map((module) => module.id);

    expect(ids).toContain(focusId);
    expect(ids).toContain(promptId);
  });

  test('uses capacity variants from Baseline module config', () => {
    const capacityModule = BASELINE_WEEK_DELIVERY_MODULES.find(
      (module) => module.id === 'baseline-week-3-capacity',
    );

    expect(
      resolveDeliveryModuleCopy(capacityModule!, summary('active', 17, 'high'))
        .title,
    ).toBe('Choose maintenance anchors, not new rules');
  });

  test('shows recommendation prompt after Day 21 is handled', () => {
    const visible = filterVisibleDeliveryModules(BASELINE_WEEK_DELIVERY_MODULES, {
      runtimeSummary: summary('active', 21),
      checkinDue: false,
      day21Handled: true,
    });
    const ids = visible.map((module) => module.id);

    expect(ids).toContain('baseline-day-21-recommendation');
    expect(ids).not.toContain('baseline-day-21-checkin');
    expect(ids).not.toContain('baseline-day-21-transition');
  });
});
