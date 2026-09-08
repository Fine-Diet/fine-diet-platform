import {
  selectPlansHomePlanningTarget,
} from '../planningTarget';
import type { Plan } from '../../types';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    person_id: 'person-1',
    title: null,
    plan_shape: 'week',
    source: 'ai_generated',
    status: 'active',
    start_date: '2026-09-06',
    end_date: '2026-09-12',
    program_slug: null,
    program_run_id: null,
    input_snapshot_json: {} as Plan['input_snapshot_json'],
    nds_version: '1',
    classifier_version: '1',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('selectPlansHomePlanningTarget', () => {
  it('reuses the canonical active plan while it covers the date', () => {
    const manual = plan({
      id: 'manual',
      plan_shape: 'day',
      source: 'user_manual',
      status: 'draft',
      start_date: '2026-09-08',
      end_date: '2026-09-08',
    });
    const selected = selectPlansHomePlanningTarget([manual, plan()], '2026-09-08');
    expect(selected).toEqual({ plan: expect.objectContaining({ id: 'plan-1' }), kind: 'active_coverage' });
  });

  it('uses an exact-date writable manual day when active coverage misses', () => {
    const manual = plan({
      id: 'manual',
      plan_shape: 'day',
      source: 'user_manual',
      status: 'draft',
      start_date: '2026-10-08',
      end_date: '2026-10-08',
    });
    const selected = selectPlansHomePlanningTarget([plan(), manual], '2026-10-08');
    expect(selected).toEqual({ plan: manual, kind: 'manual_dated_day' });
  });

  it('chooses legacy duplicates deterministically without mutating lifecycle', () => {
    const older = plan({
      id: 'manual-a',
      plan_shape: 'day',
      source: 'user_manual',
      status: 'draft',
      start_date: '2026-10-08',
      end_date: '2026-10-08',
      updated_at: '2026-09-01T00:00:00Z',
    });
    const newer = plan({
      ...older,
      id: 'manual-b',
      updated_at: '2026-09-02T00:00:00Z',
    });
    expect(selectPlansHomePlanningTarget([older, newer], '2026-10-08')?.plan.id).toBe('manual-b');
    expect(older.status).toBe('draft');
    expect(newer.status).toBe('draft');
  });

  it('never reuses archived, non-manual, multi-day, or wrong-date containers', () => {
    const invalid = [
      plan({ id: 'archived', status: 'archived', plan_shape: 'day', source: 'user_manual', start_date: '2026-10-08' }),
      plan({ id: 'generated', status: 'draft', plan_shape: 'day', source: 'ai_generated', start_date: '2026-10-08' }),
      plan({ id: 'week', status: 'draft', source: 'user_manual', start_date: '2026-10-08' }),
      plan({ id: 'wrong-date', status: 'draft', plan_shape: 'day', source: 'user_manual', start_date: '2026-10-09' }),
    ];
    expect(selectPlansHomePlanningTarget(invalid, '2026-10-08')).toBeNull();
  });
});
