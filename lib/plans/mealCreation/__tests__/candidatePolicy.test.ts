import {
  proposeMealCreationCandidates,
  mealTypeForSlotKey,
} from '../candidatePolicy';

describe('proposeMealCreationCandidates', () => {
  it('returns no invented meals when the library is empty and defers history', () => {
    const proposal = proposeMealCreationCandidates({ slotKey: 'lunch', library: [] });
    expect(proposal.candidates).toEqual([]);
    expect(proposal.deferredSources).toEqual(['logged_history', 'repeat_ranking']);
    expect(proposal.reasonCodes).toContain('no_saved_library_candidates');
    expect(proposal.policyId).toBe('meal-creation.simplified');
  });

  it('ranks occasion-matching saved meals before unrelated recency', () => {
    const proposal = proposeMealCreationCandidates({
      slotKey: 'breakfast',
      library: [
        {
          id: 'later',
          title: 'Pasta',
          document_kind: 'meal',
          intents: ['dinner'],
          updated_at: '2026-08-16T12:00:00.000Z',
        },
        {
          id: 'oats',
          title: 'Oats',
          document_kind: 'meal',
          intents: ['breakfast'],
          updated_at: '2026-08-01T12:00:00.000Z',
        },
      ],
    });
    expect(proposal.candidates.map((row) => row.id)).toEqual(['oats', 'later']);
    expect(proposal.candidates[0].reasonCodes).toContain('occasion_intent_match');
    expect(proposal.candidates[0].source).toBe('saved_library');
    expect(proposal.candidates[1].reasonCodes).toContain('library_recency');
  });

  it('ranks newer occasion-matching meals before older matching meals', () => {
    const proposal = proposeMealCreationCandidates({
      slotKey: 'lunch',
      library: [
        {
          id: 'older',
          title: 'Older salad',
          document_kind: 'meal',
          intents: ['lunch'],
          updated_at: '2026-08-01T12:00:00.000Z',
        },
        {
          id: 'newer',
          title: 'Newer salad',
          document_kind: 'meal',
          intents: ['lunch'],
          updated_at: '2026-08-16T12:00:00.000Z',
        },
      ],
    });
    expect(proposal.candidates.map((row) => row.id)).toEqual(['newer', 'older']);
  });

  it('does not duplicate ids and skips archived rows', () => {
    const proposal = proposeMealCreationCandidates({
      slotKey: 'dinner',
      library: [
        {
          id: 'same',
          title: 'Bowl',
          document_kind: 'meal',
          intents: ['dinner'],
          updated_at: '2026-08-16T12:00:00.000Z',
        },
        {
          id: 'same',
          title: 'Bowl copy',
          document_kind: 'meal',
          intents: [],
          updated_at: '2026-08-16T13:00:00.000Z',
        },
        {
          id: 'old',
          title: 'Archived',
          document_kind: 'meal',
          intents: ['dinner'],
          archived: true,
          updated_at: '2026-08-16T14:00:00.000Z',
        },
      ],
    });
    expect(proposal.candidates.map((row) => row.id)).toEqual(['same']);
  });
});

describe('mealTypeForSlotKey', () => {
  it('maps legacy v1 keys only; v2 occasions stay neutral (other)', () => {
    expect(mealTypeForSlotKey('afternoon_snack')).toBe('snack');
    expect(mealTypeForSlotKey('breakfast')).toBe('breakfast');
    expect(mealTypeForSlotKey('occasion_5')).toBe('other');
    expect(mealTypeForSlotKey('occasion_2')).toBe('other');
  });
});

describe('proposeMealCreationCandidates v2 neutrality', () => {
  it('does not prefer breakfast/lunch/dinner/snack solely from a v2 occasion key', () => {
    const library = [
      {
        id: 'later-dinner',
        title: 'Pasta',
        document_kind: 'meal' as const,
        intents: ['dinner' as const],
        updated_at: '2026-08-16T12:00:00.000Z',
      },
      {
        id: 'earlier-breakfast',
        title: 'Oats',
        document_kind: 'meal' as const,
        intents: ['breakfast' as const],
        updated_at: '2026-08-01T12:00:00.000Z',
      },
    ];
    const forOccasion2 = proposeMealCreationCandidates({
      slotKey: 'occasion_2',
      library,
    });
    // Neutral ranking: recency only — dinner is newer, not demoted by breakfast intent.
    expect(forOccasion2.candidates.map((row) => row.id)).toEqual([
      'later-dinner',
      'earlier-breakfast',
    ]);
    expect(forOccasion2.candidates[0].reasonCodes).toContain('library_recency');
    expect(forOccasion2.candidates[0].reasonCodes).not.toContain('occasion_intent_match');

    const forLegacyBreakfast = proposeMealCreationCandidates({
      slotKey: 'breakfast',
      library,
    });
    expect(forLegacyBreakfast.candidates.map((row) => row.id)).toEqual([
      'earlier-breakfast',
      'later-dinner',
    ]);
    expect(forLegacyBreakfast.candidates[0].reasonCodes).toContain('occasion_intent_match');
  });
});
