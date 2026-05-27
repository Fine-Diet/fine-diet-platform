import type { ProgramRuntimeSummary } from '../runtimeTypes';
import {
  resolveBaselineCardRuntimeState,
  resolveBaselineDetailRuntimeState,
  resolveBaselinePrepModuleAccess,
} from '../runtimeUi';

function summary(
  resolvedStatus: ProgramRuntimeSummary['resolved_status'],
  currentDay = resolvedStatus === 'pre_start' ? 0 : 1,
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
    next_checkin_template: null,
    latest_checkin_response: null,
    latest_recommendation: null,
    resolved_at: '2026-05-27T00:00:00.000Z',
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
