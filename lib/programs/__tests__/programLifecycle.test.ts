import type { ProgramEnrollment } from '../runtimeTypes';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock('@/lib/access/accessService', () => ({
  hasEntitlement: jest.fn(),
}));

jest.mock('@/lib/plans/programAssignmentServerService', () => ({
  listAssignments: jest.fn(),
}));

import {
  computePausedDaysOnResume,
  isLifecycleTransitionAllowed,
  resolveEnrollmentStatus,
} from '../programRuntimeServerService';

function baseEnrollment(
  overrides: Partial<ProgramEnrollment> = {},
): ProgramEnrollment {
  return {
    id: 'enrollment-1',
    person_id: 'person-1',
    program_id: 'program-1',
    program_slug: 'baseline',
    program_version_id: 'version-1',
    source_type: 'entitlement',
    source_ref: null,
    entitlement_key: 'program:baseline',
    assignment_id: null,
    purchase_date: null,
    selected_start_date: '2026-05-20',
    started_at: null,
    completed_at: null,
    status: 'active',
    timezone: 'UTC',
    current_capacity: 'steady',
    paused_days_total: 0,
    pause_until: null,
    input_snapshot_json: {},
    computed_metrics_snapshot_json: {},
    metadata: {},
    created_by_user_id: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isLifecycleTransitionAllowed', () => {
  test('pause is only legal from active', () => {
    expect(isLifecycleTransitionAllowed('active', 'pause')).toBe(true);
    expect(isLifecycleTransitionAllowed('pre_start', 'pause')).toBe(false);
    expect(isLifecycleTransitionAllowed('paused', 'pause')).toBe(false);
    expect(isLifecycleTransitionAllowed('completed', 'pause')).toBe(false);
    expect(isLifecycleTransitionAllowed('cancelled', 'pause')).toBe(false);
  });

  test('resume is only legal from paused', () => {
    expect(isLifecycleTransitionAllowed('paused', 'resume')).toBe(true);
    expect(isLifecycleTransitionAllowed('active', 'resume')).toBe(false);
    expect(isLifecycleTransitionAllowed('pre_start', 'resume')).toBe(false);
  });

  test('cancel is legal from pre_start, active, and paused only', () => {
    expect(isLifecycleTransitionAllowed('pre_start', 'cancel')).toBe(true);
    expect(isLifecycleTransitionAllowed('active', 'cancel')).toBe(true);
    expect(isLifecycleTransitionAllowed('paused', 'cancel')).toBe(true);
    expect(isLifecycleTransitionAllowed('completed', 'cancel')).toBe(false);
    expect(isLifecycleTransitionAllowed('cancelled', 'cancel')).toBe(false);
  });

  test('complete is legal from active and paused only', () => {
    expect(isLifecycleTransitionAllowed('active', 'complete')).toBe(true);
    expect(isLifecycleTransitionAllowed('paused', 'complete')).toBe(true);
    expect(isLifecycleTransitionAllowed('pre_start', 'complete')).toBe(false);
    expect(isLifecycleTransitionAllowed('completed', 'complete')).toBe(false);
    expect(isLifecycleTransitionAllowed('cancelled', 'complete')).toBe(false);
  });
});

describe('computePausedDaysOnResume', () => {
  test('returns prior total when no pause start is recorded', () => {
    expect(
      computePausedDaysOnResume({
        pauseStartedDateKey: null,
        pausedDaysTotal: 3,
      }),
    ).toBe(3);
  });

  test('adds whole-day span between pause start and now', () => {
    expect(
      computePausedDaysOnResume({
        pauseStartedDateKey: '2026-05-10',
        pausedDaysTotal: 2,
        now: new Date('2026-05-14T12:00:00.000Z'),
        timezone: 'UTC',
      }),
    ).toBe(6);
  });

  test('never subtracts when now precedes the pause start', () => {
    expect(
      computePausedDaysOnResume({
        pauseStartedDateKey: '2026-05-20',
        pausedDaysTotal: 1,
        now: new Date('2026-05-18T12:00:00.000Z'),
        timezone: 'UTC',
      }),
    ).toBe(1);
  });
});

describe('resolveEnrollmentStatus duration-based completion (pure)', () => {
  test('derives completed once current_day passes duration without writing', () => {
    const enrollment = baseEnrollment({ selected_start_date: '2026-05-01' });
    // day 22 with a 21-day duration -> completed (pure; no DB side effects)
    expect(
      resolveEnrollmentStatus(
        enrollment,
        new Date('2026-05-22T12:00:00.000Z'),
        21,
      ),
    ).toBe('completed');
  });

  test('stays active on the final day of the duration', () => {
    const enrollment = baseEnrollment({ selected_start_date: '2026-05-01' });
    // day 21 of 21 -> still active
    expect(
      resolveEnrollmentStatus(
        enrollment,
        new Date('2026-05-21T12:00:00.000Z'),
        21,
      ),
    ).toBe('active');
  });

  test('without a duration, never derives completion from day count', () => {
    const enrollment = baseEnrollment({ selected_start_date: '2026-05-01' });
    expect(
      resolveEnrollmentStatus(
        enrollment,
        new Date('2026-06-30T12:00:00.000Z'),
      ),
    ).toBe('active');
  });

  test('explicit completed status and completed_at still win', () => {
    expect(
      resolveEnrollmentStatus(
        baseEnrollment({ status: 'completed' }),
        new Date('2026-05-05T12:00:00.000Z'),
        21,
      ),
    ).toBe('completed');
  });

  test('cancelled and paused states are not overwritten by duration', () => {
    expect(
      resolveEnrollmentStatus(
        baseEnrollment({
          status: 'cancelled',
          selected_start_date: '2026-05-01',
        }),
        new Date('2026-05-30T12:00:00.000Z'),
        21,
      ),
    ).toBe('cancelled');

    expect(
      resolveEnrollmentStatus(
        baseEnrollment({
          status: 'paused',
          selected_start_date: '2026-05-01',
        }),
        new Date('2026-05-30T12:00:00.000Z'),
        21,
      ),
    ).toBe('paused');
  });
});
