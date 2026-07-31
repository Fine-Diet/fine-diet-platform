import {
  buildPostGeneratePlansHomeHref,
  formatPlanTitleFallback,
  isStubPlanTitle,
  resolveGeneratedPlanEndDate,
  resolveGeneratedPlanTitle,
  selectCurrentPlan,
} from '../currentPlan';
import type { Plan } from '../types';

function plan(partial: Partial<Plan> & Pick<Plan, 'id' | 'status'>): Plan {
  return {
    id: partial.id,
    person_id: 'person-1',
    title: partial.title ?? 'Plan',
    plan_shape: partial.plan_shape ?? 'week',
    source: partial.source ?? 'ai_generated',
    status: partial.status,
    start_date: partial.start_date ?? '2026-07-12',
    end_date: partial.end_date ?? null,
    program_slug: null,
    program_run_id: null,
    input_snapshot_json: {} as Plan['input_snapshot_json'],
    nds_version: '1',
    classifier_version: '1',
    created_at: partial.created_at ?? '2026-07-12T10:00:00.000Z',
    updated_at: partial.updated_at ?? '2026-07-12T10:00:00.000Z',
  };
}

describe('selectCurrentPlan', () => {
  it('returns null for empty list', () => {
    expect(selectCurrentPlan([])).toBeNull();
  });

  it('returns the sole active plan', () => {
    const current = plan({
      id: 'new',
      status: 'active',
      created_at: '2026-07-31T12:00:00.000Z',
    });
    const archived = plan({
      id: 'old',
      status: 'archived',
      created_at: '2026-07-01T12:00:00.000Z',
    });
    expect(selectCurrentPlan([archived, current])?.id).toBe('new');
  });

  it('selects newest active by created_at when multiple actives exist', () => {
    const olderActive = plan({
      id: 'older',
      status: 'active',
      start_date: '2026-07-20',
      created_at: '2026-07-20T09:00:00.000Z',
    });
    const newerActive = plan({
      id: 'newer',
      status: 'active',
      start_date: '2026-07-12',
      created_at: '2026-07-31T15:00:00.000Z',
    });
    expect(selectCurrentPlan([olderActive, newerActive])?.id).toBe('newer');
  });

  it('returns null for archived-only lists', () => {
    expect(
      selectCurrentPlan([
        plan({ id: 'a', status: 'archived', created_at: '2026-07-01T00:00:00.000Z' }),
        plan({ id: 'b', status: 'archived', created_at: '2026-07-10T00:00:00.000Z' }),
      ]),
    ).toBeNull();
  });

  it('returns null for draft-only lists', () => {
    expect(
      selectCurrentPlan([
        plan({ id: 'd', status: 'draft', created_at: '2026-07-31T00:00:00.000Z' }),
      ]),
    ).toBeNull();
  });
});

describe('buildPostGeneratePlansHomeHref', () => {
  it('lands on Plans Home with the generated start date', () => {
    expect(buildPostGeneratePlansHomeHref('2026-07-12')).toEqual({
      pathname: '/app/plans',
      query: { date: '2026-07-12' },
    });
  });
});

describe('resolveGeneratedPlanEndDate', () => {
  it('keeps an explicit end_date', () => {
    expect(
      resolveGeneratedPlanEndDate({
        end_date: '2026-07-18',
        start_date: '2026-07-12',
        plan_shape: 'week',
      }),
    ).toBe('2026-07-18');
  });

  it('uses last plan day when end_date is missing', () => {
    expect(
      resolveGeneratedPlanEndDate({
        end_date: null,
        start_date: '2026-07-12',
        plan_shape: 'week',
        planDayDates: ['2026-07-14', '2026-07-12', '2026-07-18'],
      }),
    ).toBe('2026-07-18');
  });

  it('derives week end as start + 6 when days are absent', () => {
    expect(
      resolveGeneratedPlanEndDate({
        end_date: null,
        start_date: '2026-07-12',
        plan_shape: 'week',
      }),
    ).toBe('2026-07-18');
  });
});

describe('resolveGeneratedPlanTitle', () => {
  it('detects stub titles', () => {
    expect(isStubPlanTitle('Stub week plan')).toBe(true);
    expect(isStubPlanTitle('Week of Jul 12, 2026')).toBe(false);
  });

  it('replaces stub titles with dated fallback', () => {
    expect(
      resolveGeneratedPlanTitle({
        authoredTitle: 'Stub week plan',
        start_date: '2026-07-12',
        end_date: '2026-07-18',
        plan_shape: 'week',
      }),
    ).toBe(formatPlanTitleFallback({
      start_date: '2026-07-12',
      end_date: '2026-07-18',
      plan_shape: 'week',
    }));
  });

  it('keeps non-stub authored titles', () => {
    expect(
      resolveGeneratedPlanTitle({
        authoredTitle: 'Protein focus week',
        start_date: '2026-07-12',
        end_date: '2026-07-18',
        plan_shape: 'week',
      }),
    ).toBe('Protein focus week');
  });
});
