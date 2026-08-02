import {
  bestPlanForDateRange,
  computeGroceryDemandEmptyReason,
  formatPullFromPlanOptionLabel,
  groceryPullEmptyMessage,
  planFullyCoversRange,
  planRangeOverlapDays,
  resolvePullFromPlanSelection,
  type PullPlanCandidate,
} from '../pullFromPlanSelection';

const ARCHIVED_AUG2: PullPlanCandidate = {
  id: 'c7d51922-6007-4720-8f72-3e5bd6f78fec',
  title: 'Week of Aug 2, 2026',
  status: 'archived',
  start_date: '2026-08-02',
  end_date: '2026-08-08',
  updated_at: '2026-08-02T12:00:00Z',
};

const ACTIVE_AUG9: PullPlanCandidate = {
  id: '2b2ae5f4-afcf-49ba-b8e0-70af4157e53d',
  title: 'Week of Aug 9, 2026',
  status: 'active',
  start_date: '2026-08-09',
  end_date: '2026-08-15',
  updated_at: '2026-08-02T14:00:00Z',
};

const PLANS = [ACTIVE_AUG9, ARCHIVED_AUG2];

describe('planRangeOverlapDays / planFullyCoversRange', () => {
  it('counts inclusive overlap and full coverage', () => {
    expect(planRangeOverlapDays(ARCHIVED_AUG2, '2026-08-02', '2026-08-05')).toBe(4);
    expect(planFullyCoversRange(ARCHIVED_AUG2, '2026-08-02', '2026-08-05')).toBe(true);
    expect(planRangeOverlapDays(ACTIVE_AUG9, '2026-08-02', '2026-08-05')).toBe(0);
    expect(planFullyCoversRange(ACTIVE_AUG9, '2026-08-02', '2026-08-05')).toBe(false);
  });
});

describe('bestPlanForDateRange', () => {
  it('Aug 2–5 selects archived Week of Aug 2 over active Week of Aug 9', () => {
    const best = bestPlanForDateRange(PLANS, '2026-08-02', '2026-08-05');
    expect(best?.plan.id).toBe(ARCHIVED_AUG2.id);
    expect(best?.coverage).toBe('full');
  });

  it('Aug 9–15 selects active Week of Aug 9', () => {
    const best = bestPlanForDateRange(PLANS, '2026-08-09', '2026-08-15');
    expect(best?.plan.id).toBe(ACTIVE_AUG9.id);
    expect(best?.coverage).toBe('full');
  });

  it('full coverage outranks partial overlap', () => {
    const partialOnly: PullPlanCandidate = {
      id: 'partial',
      title: 'Partial bridge',
      status: 'active',
      start_date: '2026-08-04',
      end_date: '2026-08-10',
      updated_at: '2026-08-10T00:00:00Z',
    };
    const best = bestPlanForDateRange([partialOnly, ARCHIVED_AUG2], '2026-08-02', '2026-08-05');
    expect(best?.plan.id).toBe(ARCHIVED_AUG2.id);
    expect(best?.fullyCovers).toBe(true);
  });
});

describe('resolvePullFromPlanSelection', () => {
  it('auto-selects archived Aug 2 for Aug 2–5', () => {
    const resolved = resolvePullFromPlanSelection({
      plans: PLANS,
      rangeStart: '2026-08-02',
      rangeEnd: '2026-08-05',
      currentPlanId: null,
      selectionMode: 'auto',
    });
    expect(resolved.selectedPlanId).toBe(ARCHIVED_AUG2.id);
    expect(resolved.coverage).toBe('full');
  });

  it('preserves a manual selection that still overlaps after a date adjustment', () => {
    const resolved = resolvePullFromPlanSelection({
      plans: PLANS,
      rangeStart: '2026-08-03',
      rangeEnd: '2026-08-04',
      currentPlanId: ARCHIVED_AUG2.id,
      selectionMode: 'manual',
    });
    expect(resolved.selectedPlanId).toBe(ARCHIVED_AUG2.id);
    expect(resolved.selectionMode).toBe('manual');
    expect(resolved.reboundFromZeroOverlap).toBe(false);
  });

  it('rebounds a selected plan with zero overlap and returns to auto', () => {
    const resolved = resolvePullFromPlanSelection({
      plans: PLANS,
      rangeStart: '2026-08-02',
      rangeEnd: '2026-08-05',
      currentPlanId: ACTIVE_AUG9.id,
      selectionMode: 'manual',
    });
    expect(resolved.selectedPlanId).toBe(ARCHIVED_AUG2.id);
    expect(resolved.selectionMode).toBe('auto');
    expect(resolved.reboundFromZeroOverlap).toBe(true);
  });

  it('clears selection when no plan overlaps the range', () => {
    const resolved = resolvePullFromPlanSelection({
      plans: PLANS,
      rangeStart: '2026-09-01',
      rangeEnd: '2026-09-07',
      currentPlanId: ACTIVE_AUG9.id,
      selectionMode: 'manual',
    });
    expect(resolved.selectedPlanId).toBeNull();
    expect(resolved.coverage).toBe('none');
    expect(resolved.reboundFromZeroOverlap).toBe(true);
  });

  it('surfaces partial coverage without implying full cover', () => {
    const partial: PullPlanCandidate = {
      id: 'partial',
      title: 'Bridge week',
      status: 'draft',
      start_date: '2026-08-04',
      end_date: '2026-08-06',
      updated_at: '2026-08-01T00:00:00Z',
    };
    const resolved = resolvePullFromPlanSelection({
      plans: [partial],
      rangeStart: '2026-08-02',
      rangeEnd: '2026-08-05',
      currentPlanId: null,
      selectionMode: 'auto',
    });
    expect(resolved.selectedPlanId).toBe('partial');
    expect(resolved.partialCoverage).toBe(true);
    expect(resolved.coverage).toBe('partial');
  });
});

describe('formatPullFromPlanOptionLabel', () => {
  it('includes title, status, and date range', () => {
    expect(formatPullFromPlanOptionLabel(ARCHIVED_AUG2)).toBe(
      'Week of Aug 2, 2026 (archived, 2026-08-02–2026-08-08)',
    );
  });
});

describe('computeGroceryDemandEmptyReason / groceryPullEmptyMessage', () => {
  it('returns each empty_reason deterministically', () => {
    expect(
      computeGroceryDemandEmptyReason({
        source_day_count: 0,
        pending_meal_count: 0,
        derived_item_count: 0,
      }),
    ).toBe('no_plan_days_in_range');
    expect(
      computeGroceryDemandEmptyReason({
        source_day_count: 4,
        pending_meal_count: 0,
        derived_item_count: 0,
      }),
    ).toBe('no_pending_meals');
    expect(
      computeGroceryDemandEmptyReason({
        source_day_count: 4,
        pending_meal_count: 2,
        derived_item_count: 0,
      }),
    ).toBe('no_derived_items');
    expect(
      computeGroceryDemandEmptyReason({
        source_day_count: 4,
        pending_meal_count: 2,
        derived_item_count: 3,
      }),
    ).toBeNull();
  });

  it('never uses success-style copy for empty reasons', () => {
    for (const reason of [
      'no_plan_days_in_range',
      'no_pending_meals',
      'no_derived_items',
      null,
    ] as const) {
      const message = groceryPullEmptyMessage(reason);
      expect(message.startsWith('Added ')).toBe(false);
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
