import type { ProgramRuntimeSummary } from '../runtimeTypes';
import { resolveBaselineCardRuntimeState } from '../runtimeUi';

function summary(
  resolvedStatus: ProgramRuntimeSummary['resolved_status'],
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
    current_day: resolvedStatus === 'pre_start' ? 0 : 1,
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
