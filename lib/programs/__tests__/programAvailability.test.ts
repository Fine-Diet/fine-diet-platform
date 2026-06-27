jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const mockHasEntitlement = jest.fn();
jest.mock('@/lib/access/accessService', () => ({
  hasEntitlement: (...args: unknown[]) => mockHasEntitlement(...args),
}));

const mockListSummaries = jest.fn();
jest.mock('../programRuntimeServerService', () => ({
  listProgramRuntimeSummariesForPerson: (...args: unknown[]) =>
    mockListSummaries(...args),
}));

import {
  computeProgramAvailabilityForPerson,
  deriveProgramAvailabilityEntry,
  extractProgramDependencyRules,
} from '../programAvailabilityServerService';

function entry(
  slug: string,
  requiresCompletedSlug: string | null,
  sets: {
    entitled?: string[];
    open?: string[];
    completed?: string[];
    runtimeReady?: string[];
  },
) {
  return deriveProgramAvailabilityEntry(
    { slug, requiresCompletedSlug },
    {
      entitledSlugs: new Set(sets.entitled ?? []),
      openEnrollmentSlugs: new Set(sets.open ?? []),
      completedSlugs: new Set(sets.completed ?? []),
      runtimeReadySlugs: new Set(sets.runtimeReady ?? []),
    },
  );
}

describe('deriveProgramAvailabilityEntry — Baseline (no prerequisite)', () => {
  const ready = { runtimeReady: ['baseline'] };

  test('entitled, no enrollment -> available', () => {
    const r = entry('baseline', null, { entitled: ['baseline'], ...ready });
    expect(r.state).toBe('available');
    expect(r.reason).toBe('eligible_to_start');
  });

  test('open enrollment -> in_progress', () => {
    const r = entry('baseline', null, {
      entitled: ['baseline'],
      open: ['baseline'],
      ...ready,
    });
    expect(r.state).toBe('in_progress');
    expect(r.reason).toBe('enrollment_open');
  });

  test('completed enrollment -> completed', () => {
    const r = entry('baseline', null, {
      entitled: ['baseline'],
      completed: ['baseline'],
      ...ready,
    });
    expect(r.state).toBe('completed');
    expect(r.reason).toBe('enrollment_completed');
  });

  test('not entitled -> not_entitled (distinct from dependency_locked)', () => {
    const r = entry('baseline', null, ready);
    expect(r.state).toBe('not_entitled');
    expect(r.reason).toBe('entitlement_required');
  });

  test('cancelled-only (no open/completed) entitled -> available (restart implicit)', () => {
    // A cancelled enrollment contributes neither open nor completed truth, so
    // the slug resolves back to available without any restart action.
    const r = entry('baseline', null, { entitled: ['baseline'], ...ready });
    expect(r.state).toBe('available');
  });
});

describe('deriveProgramAvailabilityEntry — Digestive Reset (requires Baseline)', () => {
  const ready = { runtimeReady: ['digestive-foundations', 'baseline'] };

  test('entitled but Baseline not completed -> dependency_locked', () => {
    const r = entry('digestive-foundations', 'baseline', {
      entitled: ['digestive-foundations'],
      ...ready,
    });
    expect(r.state).toBe('dependency_locked');
    expect(r.reason).toBe('prerequisite_incomplete');
    expect(r.dependency).toEqual({
      required_program_slug: 'baseline',
      required_state: 'completed',
      satisfied: false,
    });
  });

  test('entitled plus Baseline completed -> available', () => {
    const r = entry('digestive-foundations', 'baseline', {
      entitled: ['digestive-foundations'],
      completed: ['baseline'],
      ...ready,
    });
    expect(r.state).toBe('available');
    expect(r.dependency?.satisfied).toBe(true);
  });

  test('not entitled -> not_entitled even if prerequisite incomplete', () => {
    const r = entry('digestive-foundations', 'baseline', ready);
    expect(r.state).toBe('not_entitled');
    expect(r.reason).toBe('entitlement_required');
  });

  test('open enrollment wins over dependency state -> in_progress', () => {
    const r = entry('digestive-foundations', 'baseline', {
      entitled: ['digestive-foundations'],
      open: ['digestive-foundations'],
      ...ready,
    });
    expect(r.state).toBe('in_progress');
  });
});

describe('deriveProgramAvailabilityEntry — runtime readiness', () => {
  test('entitled + deps met but runtime not ready -> dependency_locked/runtime_not_ready', () => {
    const r = entry('protein-sufficiency', 'baseline', {
      entitled: ['protein-sufficiency'],
      completed: ['baseline'],
      runtimeReady: ['baseline'], // protein not runtime-enabled
    });
    expect(r.state).toBe('dependency_locked');
    expect(r.reason).toBe('runtime_not_ready');
  });
});

describe('deriveProgramAvailabilityEntry — can_start (start/restart signal)', () => {
  test('available entitled program can_start', () => {
    const r = entry('baseline', null, {
      entitled: ['baseline'],
      runtimeReady: ['baseline'],
    });
    expect(r.state).toBe('available');
    expect(r.can_start).toBe(true);
  });

  test('completed + still entitled + runtime ready + no open -> can_start (restart)', () => {
    const r = entry('baseline', null, {
      entitled: ['baseline'],
      completed: ['baseline'],
      runtimeReady: ['baseline'],
    });
    expect(r.state).toBe('completed');
    expect(r.is_completed).toBe(true);
    expect(r.can_start).toBe(true);
  });

  test('completed dependent program restartable only when prerequisite still satisfied', () => {
    const satisfied = entry('digestive-foundations', 'baseline', {
      entitled: ['digestive-foundations'],
      completed: ['digestive-foundations', 'baseline'],
      runtimeReady: ['digestive-foundations', 'baseline'],
    });
    expect(satisfied.state).toBe('completed');
    expect(satisfied.can_start).toBe(true);

    const unsatisfied = entry('digestive-foundations', 'baseline', {
      entitled: ['digestive-foundations'],
      completed: ['digestive-foundations'],
      runtimeReady: ['digestive-foundations', 'baseline'],
    });
    expect(unsatisfied.state).toBe('completed');
    expect(unsatisfied.can_start).toBe(false);
  });

  test('open enrollment cannot start again', () => {
    const r = entry('baseline', null, {
      entitled: ['baseline'],
      open: ['baseline'],
      runtimeReady: ['baseline'],
    });
    expect(r.can_start).toBe(false);
  });

  test('not entitled and dependency_locked cannot start', () => {
    const notEntitled = entry('baseline', null, { runtimeReady: ['baseline'] });
    expect(notEntitled.can_start).toBe(false);

    const locked = entry('digestive-foundations', 'baseline', {
      entitled: ['digestive-foundations'],
      runtimeReady: ['digestive-foundations', 'baseline'],
    });
    expect(locked.state).toBe('dependency_locked');
    expect(locked.can_start).toBe(false);
  });
});

describe('extractProgramDependencyRules', () => {
  test('includes baseline (no prereq) and digestive-foundations (requires baseline)', () => {
    const rules = extractProgramDependencyRules();
    const baseline = rules.find((r) => r.slug === 'baseline');
    const digestive = rules.find((r) => r.slug === 'digestive-foundations');
    expect(baseline).toBeDefined();
    expect(baseline?.requiresCompletedSlug).toBeNull();
    expect(digestive?.requiresCompletedSlug).toBe('baseline');
  });

  test('excludes tba placeholder programs', () => {
    const rules = extractProgramDependencyRules();
    expect(rules.find((r) => r.slug === 'lifestyle-tba')).toBeUndefined();
    expect(rules.find((r) => r.slug === 'advanced-tba')).toBeUndefined();
  });
});

describe('computeProgramAvailabilityForPerson (IO)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('maps entitlement + enrollment truth into availability entries', async () => {
    mockHasEntitlement.mockImplementation(
      async (_personId: string, key: string) =>
        key === 'program:baseline' || key === 'program:digestive-foundations',
    );
    mockListSummaries.mockResolvedValue({
      person_id: 'person-1',
      summaries: [
        { program: { slug: 'baseline' }, resolved_status: 'completed' },
      ],
      resolved_at: '2026-06-27T00:00:00.000Z',
    });

    const result = await computeProgramAvailabilityForPerson('person-1', [
      'baseline',
      'digestive-foundations',
    ]);

    const baseline = result.entries.find((e) => e.slug === 'baseline');
    const digestive = result.entries.find(
      (e) => e.slug === 'digestive-foundations',
    );
    expect(baseline?.state).toBe('completed');
    // Baseline completed + entitled -> Digestive Reset becomes available.
    expect(digestive?.state).toBe('available');
  });

  test('returns empty entries for empty person id', async () => {
    const result = await computeProgramAvailabilityForPerson('');
    expect(result.entries).toEqual([]);
    expect(mockListSummaries).not.toHaveBeenCalled();
  });
});
