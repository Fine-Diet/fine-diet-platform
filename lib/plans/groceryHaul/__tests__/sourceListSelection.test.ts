import type { GeneratedGroceryList } from '@/lib/plans/types';
import type { GroceryListReadinessDecision } from '@/lib/plans/groceryListReadiness/policy';
import {
  buildEligibleHaulSourceCandidates,
  formatHaulSourceListRowLabel,
  rankVisibleHaulSourceCandidates,
} from '@/lib/plans/groceryHaul/sourceListSelection';

function list(
  overrides: Partial<GeneratedGroceryList> & Pick<GeneratedGroceryList, 'id'>,
): GeneratedGroceryList {
  return {
    plan_id: null,
    person_id: 'person-1',
    title: overrides.title ?? 'Weekly',
    date_range_start: null,
    date_range_end: null,
    mode: 'persistent',
    status: 'active',
    export_payload_json: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function summary(pending: number): GroceryListReadinessDecision {
  return {
    policyId: 'grocery-list-readiness.v1',
    policyVersion: 'v1',
    state: pending > 0 ? 'ready_to_shop' : 'empty_or_no_demand',
    reasonCodes: [],
    counts: {
      total: pending,
      pending,
      bought: 0,
      have: 0,
      skipped: 0,
      pendingUnresolvedIdentity: 0,
      pendingUnsafeAmount: 0,
    },
  };
}

describe('sourceListSelection', () => {
  it('filters to active lists with pending demand and excludes attached lists', () => {
    const lists = [
      list({ id: 'default', is_default: true, title: null }),
      list({ id: 'named', title: 'Costco' }),
      list({ id: 'archived', archived_at: '2026-01-02T00:00:00.000Z' }),
      list({ id: 'empty', title: 'Empty' }),
    ];
    const summaries = {
      default: summary(3),
      named: summary(2),
      archived: summary(5),
      empty: summary(0),
    };

    const eligible = buildEligibleHaulSourceCandidates(lists, summaries, {
      excludeListIds: ['named'],
    });

    expect(eligible.map((row) => row.list.id)).toEqual(['default']);
  });

  it('pins selected rows and ranks unselected default then updated_at then title', () => {
    const lists = [
      list({ id: 'default', is_default: true, title: null, updated_at: '2026-01-01T00:00:00.000Z' }),
      list({ id: 'alpha', title: 'Alpha', updated_at: '2026-01-03T00:00:00.000Z' }),
      list({ id: 'beta', title: 'Beta', updated_at: '2026-01-02T00:00:00.000Z' }),
    ];
    const summaries = {
      default: summary(1),
      alpha: summary(2),
      beta: summary(3),
    };
    const candidates = buildEligibleHaulSourceCandidates(lists, summaries);
    const visible = rankVisibleHaulSourceCandidates(candidates, {
      selectedIds: ['beta'],
      defaultListId: 'default',
      titleFor: (row) => row.title ?? 'Essentials',
      searchQuery: '',
    });

    expect(visible.map((row) => row.list.id)).toEqual(['beta', 'default', 'alpha']);
  });

  it('keeps selected rows visible while search filters unselected candidates', () => {
    const lists = [
      list({ id: 'alpha', title: 'Alpha run' }),
      list({ id: 'beta', title: 'Beta run' }),
    ];
    const summaries = { alpha: summary(1), beta: summary(1) };
    const candidates = buildEligibleHaulSourceCandidates(lists, summaries);
    const visible = rankVisibleHaulSourceCandidates(candidates, {
      selectedIds: ['alpha'],
      defaultListId: null,
      titleFor: (row) => row.title ?? 'Untitled',
      searchQuery: 'beta',
    });

    expect(visible.map((row) => row.list.id)).toEqual(['alpha', 'beta']);
  });

  it('formats row labels with pending counts', () => {
    expect(formatHaulSourceListRowLabel('Essentials', 8)).toBe('Essentials - 8 items');
    expect(formatHaulSourceListRowLabel('Essentials', 1)).toBe('Essentials - 1 item');
  });
});
