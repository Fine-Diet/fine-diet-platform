import {
  buildMyProgramsViewModel,
  resolveMyProgramGroup,
  type MyProgramsAvailabilitySlice,
  type MyProgramsLibrarySlice,
  type MyProgramsRuntimeSlice,
} from '@/lib/programs/myProgramsGrouping';

function library(overrides: Partial<MyProgramsLibrarySlice> = {}): MyProgramsLibrarySlice {
  return {
    slug: 'baseline',
    title: 'Baseline',
    tagline: 'A 21-day start',
    has_entitlement: true,
    access_state: 'entitled',
    runtime_state: 'none',
    impact_headline: null,
    progress: null,
    ...overrides,
  };
}

function runtime(overrides: Partial<MyProgramsRuntimeSlice> = {}): MyProgramsRuntimeSlice {
  return {
    slug: 'baseline',
    title: 'Baseline',
    tagline: 'A 21-day start',
    resolvedStatus: 'active',
    currentDay: 4,
    durationDays: 21,
    selectedStartDate: '2026-09-01',
    completedAt: null,
    ...overrides,
  };
}

function availability(
  overrides: Partial<MyProgramsAvailabilitySlice> = {},
): MyProgramsAvailabilitySlice {
  return {
    slug: 'baseline',
    state: 'available',
    reason: 'eligible_to_start',
    can_start: true,
    is_entitled: true,
    ...overrides,
  };
}

describe('My Programs grouping', () => {
  it('puts active and paused enrollments in Current and keeps day progress', () => {
    const cards = buildMyProgramsViewModel({
      entries: [
        library({ slug: 'baseline', runtime_state: 'active_now' }),
        library({
          slug: 'digestive-foundations',
          title: 'Digestive Reset',
          runtime_state: 'inactive',
        }),
      ],
      runtimes: [
        runtime(),
        runtime({
          slug: 'digestive-foundations',
          title: 'Digestive Reset',
          resolvedStatus: 'paused',
          currentDay: 2,
          durationDays: 14,
        }),
      ],
    });

    expect(cards.map((card) => [card.slug, card.group, card.statusLabel, card.progressDetail])).toEqual([
      ['baseline', 'current', 'In progress', 'Day 4 of 21'],
      ['digestive-foundations', 'current', 'Paused', 'Day 2 of 14'],
    ]);
    expect(JSON.stringify(cards)).not.toContain('percent');
  });

  it('groups pre-start, scheduled, and entitled-not-started as Ready to Start', () => {
    const cards = buildMyProgramsViewModel({
      entries: [
        library({ slug: 'baseline', runtime_state: 'none' }),
        library({
          slug: 'protein-sufficiency',
          title: 'Protein Optimization',
          runtime_state: 'scheduled',
        }),
      ],
      runtimes: [
        runtime({
          slug: 'baseline',
          resolvedStatus: 'pre_start',
          currentDay: 0,
          selectedStartDate: '2026-10-06',
        }),
      ],
      availability: [
        availability({ slug: 'baseline', state: 'in_progress', reason: 'enrollment_open', can_start: false }),
        availability({ slug: 'protein-sufficiency', state: 'available', can_start: true }),
      ],
    });

    expect(cards.find((card) => card.slug === 'baseline')).toMatchObject({
      group: 'ready_to_start',
      statusLabel: 'Pre-start',
      startDate: '2026-10-06',
      progressDetail: null,
    });
    expect(cards.find((card) => card.slug === 'protein-sufficiency')).toMatchObject({
      group: 'ready_to_start',
      statusLabel: 'Scheduled',
    });
  });

  it('keeps a completed program in Completed even when it can restart', () => {
    const cards = buildMyProgramsViewModel({
      entries: [library({ runtime_state: 'completed', progress: { items_completed: 8, items_total: 8 } })],
      runtimes: [runtime({ resolvedStatus: 'completed', currentDay: 21, completedAt: '2026-09-21' })],
      availability: [availability({ state: 'completed', reason: 'enrollment_completed', can_start: true })],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      group: 'completed',
      statusLabel: 'Completed',
      progressDetail: '8 of 8 items',
    });
  });

  it('labels entitled programs that are still locked without calling them ready', () => {
    const cards = buildMyProgramsViewModel({
      entries: [library({ slug: 'digestive-foundations', title: 'Digestive Reset', runtime_state: 'none' })],
      availability: [
        availability({
          slug: 'digestive-foundations',
          state: 'dependency_locked',
          reason: 'prerequisite_incomplete',
          can_start: false,
        }),
      ],
    });

    expect(cards[0]).toMatchObject({
      group: 'ready_to_start',
      statusLabel: 'Prerequisite incomplete',
    });
    expect(cards[0].statusLabel).not.toBe('Ready to start');
  });

  it('omits cancelled programs that no longer have access', () => {
    const cards = buildMyProgramsViewModel({
      runtimes: [runtime({ resolvedStatus: 'cancelled', currentDay: 3 })],
      entries: [
        library({
          has_entitlement: false,
          access_state: 'unavailable',
          runtime_state: 'cancelled',
        }),
      ],
      availability: [
        availability({
          state: 'not_entitled',
          reason: 'entitlement_required',
          can_start: false,
          is_entitled: false,
        }),
      ],
    });

    expect(cards).toEqual([]);
    expect(resolveMyProgramGroup({
      hasAccess: false,
      enrollmentStatus: 'cancelled',
      assignmentRuntimeState: 'cancelled',
    })).toBeNull();
  });

  it('uses item progress and does not emit a score field', () => {
    const cards = buildMyProgramsViewModel({
      entries: [
        library({
          runtime_state: 'active_now',
          progress: { items_completed: 3, items_total: 8 },
          impact_headline: 'Protein target is active on your plan.',
        }),
      ],
    });

    expect(cards[0]).toMatchObject({
      group: 'current',
      statusLabel: 'In progress',
    });
    expect(cards[0].progressDetail).toBe('3 of 8 items');
    expect(cards[0].note).toBe('Protein target is active on your plan.');
    expect(cards[0]).not.toHaveProperty('percent_complete');
    expect(cards[0].href).toBe('/app/programs/baseline');
  });
});
