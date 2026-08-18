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
  it('maps snack occasions to snack instead of forcing three meals', () => {
    expect(mealTypeForSlotKey('afternoon_snack')).toBe('snack');
    expect(mealTypeForSlotKey('breakfast')).toBe('breakfast');
  });
});
