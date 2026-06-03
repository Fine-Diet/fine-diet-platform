/**
 * Meal Object Foundation — Packet 16: logged grouped meal instance edit service.
 *
 * Covers the PURE payload builder (name / servings / note edits + deterministic
 * top-level nutrition re-scale + detach semantics) and the person-scoped write
 * orchestration. No live DB / Supabase / network — getEntry / updateEntry are
 * mocked at a narrow boundary so the real build + recompute logic runs.
 */

import type {
  GroupedMealEntryPayload,
  LoggedMealGroup,
  MealComponent,
} from '@/lib/meals/types';

// ----------------------------------------------------------------------------
// Mocks — journal persistence only (no journal DB, no Supabase).
// ----------------------------------------------------------------------------

const mockGetEntry = jest.fn();
const mockUpdateEntry = jest.fn();

jest.mock('@/lib/journal/journalServerService', () => ({
  getEntry: (...args: unknown[]) => mockGetEntry(...args),
  updateEntry: (...args: unknown[]) => mockUpdateEntry(...args),
}));

import {
  LoggedMealInstanceEditValidationError,
  applyGroupedMealInstanceEditForPerson,
  buildEditedGroupedMealPayload,
  parseLoggedMealInstanceEditPatch,
} from '@/lib/meals/loggedMealGroupInstanceEditService';

const PERSON = 'person-1';
const ENTRY_ID = 'entry-1';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

function component(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: 'c1',
    name: 'Beans',
    quantity: 1,
    unit: 'serving',
    serving_size_g: 100,
    food_object_id: 'food-beans',
    calories: 100,
    macros: { protein_g: 10, carbs_g: 12, fat_g: 3 },
    nutrition_basis: 'per_serving',
    match_status: 'matched',
    source_kind: 'food_object',
    needs_review: false,
    ...overrides,
  };
}

function group(overrides: Partial<LoggedMealGroup> = {}): LoggedMealGroup {
  return {
    schema_version: 1,
    name: 'Bean Bowl',
    source_meal_document_id: 'doc-1',
    source_imported_meal_id: null,
    source_planned_meal_id: null,
    source_template_id: null,
    components: [component()],
    totals: { calories: 200, macros: { protein_g: 20, carbs_g: 24, fat_g: 6 } },
    planned_servings: null,
    consumed_servings: 2,
    detached_from_source: false,
    instance_notes: null,
    needs_review: false,
    ...overrides,
  };
}

function payload(
  groupOverrides: Partial<LoggedMealGroup> = {},
  topOverrides: Partial<GroupedMealEntryPayload> = {},
): GroupedMealEntryPayload & { meal_group: LoggedMealGroup } {
  return {
    name: 'Bean Bowl',
    quantity: 2,
    unit: 'serving',
    calories: 200,
    macros: { protein: 20, carbs: 24, fat: 6 },
    meal_group: group(groupOverrides),
    ...topOverrides,
  };
}

// ----------------------------------------------------------------------------
// parseLoggedMealInstanceEditPatch
// ----------------------------------------------------------------------------

describe('parseLoggedMealInstanceEditPatch', () => {
  it('accepts safe fields and ignores unknown/unsafe keys', () => {
    const result = parseLoggedMealInstanceEditPatch({
      name: 'Renamed',
      consumed_servings: 3,
      instance_note: '  ate late  ',
      // unsafe / untrusted keys — must be ignored
      person_id: 'attacker',
      detached_from_source: false,
      totals: { calories: 9999 },
      components: [{ component_id: 'c1', calories: 9999 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch).toEqual({
        name: 'Renamed',
        consumed_servings: 3,
        instance_note: 'ate late',
      });
    }
  });

  it('trims an empty note to null', () => {
    const result = parseLoggedMealInstanceEditPatch({ instance_note: '   ' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.instance_note).toBeNull();
  });

  it('rejects a non-object patch', () => {
    expect(parseLoggedMealInstanceEditPatch(null).ok).toBe(false);
    expect(parseLoggedMealInstanceEditPatch('x').ok).toBe(false);
  });

  it('rejects an empty patch (no editable fields)', () => {
    const result = parseLoggedMealInstanceEditPatch({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('no editable fields provided');
  });

  it('rejects invalid servings and empty name', () => {
    expect(parseLoggedMealInstanceEditPatch({ consumed_servings: 0 }).ok).toBe(false);
    expect(parseLoggedMealInstanceEditPatch({ consumed_servings: -1 }).ok).toBe(false);
    expect(parseLoggedMealInstanceEditPatch({ consumed_servings: 'x' }).ok).toBe(false);
    expect(parseLoggedMealInstanceEditPatch({ name: '' }).ok).toBe(false);
    expect(parseLoggedMealInstanceEditPatch({ name: 42 }).ok).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// buildEditedGroupedMealPayload — pure
// ----------------------------------------------------------------------------

describe('buildEditedGroupedMealPayload', () => {
  it('edits the display name and detaches without touching nutrition', () => {
    const current = payload();
    const out = buildEditedGroupedMealPayload(current, { name: 'My Lunch' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.payload.name).toBe('My Lunch');
    expect(out.value.payload.meal_group.name).toBe('My Lunch');
    expect(out.value.payload.calories).toBe(200);
    expect(out.value.payload.macros).toEqual({ protein: 20, carbs: 24, fat: 6 });
    expect(out.value.recomputed).toBe(false);
    expect(out.value.detached_from_source).toBe(true);
    expect(out.value.payload.meal_group.detached_from_source).toBe(true);
  });

  it('does not mutate the input payload (purity)', () => {
    const current = payload();
    buildEditedGroupedMealPayload(current, { name: 'X', consumed_servings: 4 });
    expect(current.name).toBe('Bean Bowl');
    expect(current.calories).toBe(200);
    expect(current.meal_group.consumed_servings).toBe(2);
    expect(current.meal_group.detached_from_source).toBe(false);
    expect(current.meal_group.totals.calories).toBe(200);
  });

  it('re-scales top-level nutrition deterministically when servings change (2 → 4)', () => {
    const current = payload();
    const out = buildEditedGroupedMealPayload(current, { consumed_servings: 4 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.recomputed).toBe(true);
    expect(out.value.payload.quantity).toBe(4);
    expect(out.value.payload.meal_group.consumed_servings).toBe(4);
    // absolute consumed totals doubled
    expect(out.value.payload.meal_group.totals).toEqual({
      calories: 400,
      macros: { protein_g: 40, carbs_g: 48, fat_g: 12 },
    });
    expect(out.value.payload.calories).toBe(400);
    expect(out.value.payload.macros).toEqual({ protein: 40, carbs: 48, fat: 12 });
    expect(out.value.payload.meal_group.detached_from_source).toBe(true);
  });

  it('scales down (2 → 1) and preserves the instance review flag', () => {
    const current = payload();
    const out = buildEditedGroupedMealPayload(current, { consumed_servings: 1 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.recomputed).toBe(true);
    expect(out.value.payload.calories).toBe(100);
    expect(out.value.payload.macros).toEqual({ protein: 10, carbs: 12, fat: 3 });
    expect(out.value.needs_review).toBe(false);
  });

  it('preserves nutrition and flags needs_review when totals are unknown (unsafe scale)', () => {
    const current = payload(
      { totals: { calories: null, macros: { protein_g: null, carbs_g: null, fat_g: null } }, needs_review: false },
      { calories: undefined, macros: undefined },
    );
    const out = buildEditedGroupedMealPayload(current, { consumed_servings: 5 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.recomputed).toBe(false);
    expect(out.value.needs_review).toBe(true);
    expect(out.value.payload.meal_group.needs_review).toBe(true);
    // servings still recorded even though nutrition could not be derived
    expect(out.value.payload.meal_group.consumed_servings).toBe(5);
    expect(out.value.payload.quantity).toBe(5);
    // top-level nutrition preserved (absent) — never invented
    expect(out.value.payload.calories).toBeUndefined();
    expect(out.value.payload.macros).toBeUndefined();
  });

  it('flags needs_review when the prior consumed_servings basis is not positive', () => {
    const current = payload({ consumed_servings: 0 });
    const out = buildEditedGroupedMealPayload(current, { consumed_servings: 3 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.recomputed).toBe(false);
    expect(out.value.needs_review).toBe(true);
    // nutrition preserved verbatim (not scaled by an undefined basis)
    expect(out.value.payload.calories).toBe(200);
  });

  it('edits and clears the instance note', () => {
    const set = buildEditedGroupedMealPayload(payload(), { instance_note: 'half portion' });
    expect(set.ok && set.value.payload.meal_group.instance_notes).toBe('half portion');

    const cleared = buildEditedGroupedMealPayload(
      payload({ instance_notes: 'old note' }),
      { instance_note: null },
    );
    expect(cleared.ok && cleared.value.payload.meal_group.instance_notes).toBeNull();
  });

  it('returns ok:false for an invalid patch', () => {
    const out = buildEditedGroupedMealPayload(payload(), { consumed_servings: -2 });
    expect(out.ok).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// applyGroupedMealInstanceEditForPerson — write path (mocked persistence)
// ----------------------------------------------------------------------------

describe('applyGroupedMealInstanceEditForPerson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function entry(overrides: Record<string, unknown> = {}) {
    return {
      id: ENTRY_ID,
      type: 'intake',
      timestamp: new Date('2026-01-01T12:00:00.000Z'),
      block: 'midday',
      payload: payload(),
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    };
  }

  it('returns not_found when the entry is missing / not owned', async () => {
    mockGetEntry.mockResolvedValue(null);
    const result = await applyGroupedMealInstanceEditForPerson(PERSON, ENTRY_ID, { name: 'x' });
    expect(result.status).toBe('not_found');
    expect(mockGetEntry).toHaveBeenCalledWith(PERSON, ENTRY_ID);
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });

  it('returns not_grouped for a non-intake entry', async () => {
    mockGetEntry.mockResolvedValue(entry({ type: 'note', payload: { text: 'hi' } }));
    const result = await applyGroupedMealInstanceEditForPerson(PERSON, ENTRY_ID, { name: 'x' });
    expect(result.status).toBe('not_grouped');
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });

  it('returns not_grouped for a flat intake entry (no meal_group)', async () => {
    mockGetEntry.mockResolvedValue(
      entry({ payload: { name: 'Apple', quantity: 1, unit: 'serving', calories: 95 } }),
    );
    const result = await applyGroupedMealInstanceEditForPerson(PERSON, ENTRY_ID, { name: 'x' });
    expect(result.status).toBe('not_grouped');
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });

  it('throws a validation error for an invalid patch (no DB write)', async () => {
    mockGetEntry.mockResolvedValue(entry());
    await expect(
      applyGroupedMealInstanceEditForPerson(PERSON, ENTRY_ID, { consumed_servings: 0 }),
    ).rejects.toBeInstanceOf(LoggedMealInstanceEditValidationError);
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });

  it('persists only the journal entry payload (person-scoped) and returns flags', async () => {
    mockGetEntry.mockResolvedValue(entry());
    mockUpdateEntry.mockImplementation(async ({ payload: p }: { payload: unknown }) =>
      entry({ payload: p }),
    );

    const result = await applyGroupedMealInstanceEditForPerson(PERSON, ENTRY_ID, {
      name: 'Adjusted',
      consumed_servings: 4,
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.recomputed).toBe(true);
    expect(result.detached_from_source).toBe(true);

    // updateEntry called with person scope + the rebuilt payload only.
    expect(mockUpdateEntry).toHaveBeenCalledTimes(1);
    const arg = mockUpdateEntry.mock.calls[0][0];
    expect(arg.personId).toBe(PERSON);
    expect(arg.entryId).toBe(ENTRY_ID);
    expect(arg.payload.name).toBe('Adjusted');
    expect(arg.payload.meal_group.detached_from_source).toBe(true);
    expect(arg.payload.meal_group.consumed_servings).toBe(4);
    expect(arg.payload.calories).toBe(400);
  });

  it('returns not_found when the scoped write reports no row', async () => {
    mockGetEntry.mockResolvedValue(entry());
    mockUpdateEntry.mockResolvedValue(null);
    const result = await applyGroupedMealInstanceEditForPerson(PERSON, ENTRY_ID, { name: 'x' });
    expect(result.status).toBe('not_found');
  });
});
