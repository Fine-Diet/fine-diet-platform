import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MealComponent, MealDocument } from '../types';

// ----------------------------------------------------------------------------
// Mocks — isolate the grouped-logging orchestration from the DB + journal layer.
// ----------------------------------------------------------------------------

let mockGetMealDocument!: jest.Mock;
jest.mock('../mealDocumentServerService', () => {
  mockGetMealDocument = jest.fn();
  return { getMealDocumentForPerson: mockGetMealDocument };
});

let mockCreateEntry!: jest.Mock;
jest.mock('@/lib/journal/journalServerService', () => {
  mockCreateEntry = jest.fn();
  return { createEntry: mockCreateEntry };
});

import {
  GroupedMealLogValidationError,
  MealDocumentNotFoundError,
  buildGroupedMealIntakePayload,
  logMealDocumentForPerson,
  scaleTopLevelMealNutrition,
  validateGroupedMealLogInput,
} from '../groupedMealLoggingService';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const PERSON = 'person-1';

function component(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: 'c1',
    name: 'Beans',
    quantity: 1,
    unit: 'serving',
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

function doc(overrides: Partial<MealDocument> = {}): MealDocument {
  return {
    schema_version: 1,
    id: 'doc-1',
    person_id: PERSON,
    kind: 'meal',
    review_state: 'confirmed',
    title: 'Bean Bowl',
    description: null,
    intents: [],
    meal_type_hint: null,
    components: [component()],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: { calories: 250, macros: { protein_g: 20, carbs_g: 24, fat_g: 6 } },
    totals: null,
    source: {
      source_type: 'imported',
      source_imported_meal_id: 'imp-1',
      source_planned_meal_id: null,
      source_template_id: null,
    },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockGetMealDocument.mockReset();
  mockCreateEntry.mockReset();

  mockGetMealDocument.mockImplementation(async (personId: string, id: string) =>
    personId === PERSON && id === 'doc-1' ? doc() : null,
  );
  // createEntry echoes a minimal entry shape carrying the payload it received.
  mockCreateEntry.mockImplementation(async (args: { payload: unknown }) => ({
    id: 'entry-1',
    type: 'intake',
    payload: args.payload,
  }));
});

// ============================================================================
// (1) build grouped payload + (4) meal_group exists
// ============================================================================

describe('buildGroupedMealIntakePayload', () => {
  it('builds a grouped intake payload with a meal_group', () => {
    const payload = buildGroupedMealIntakePayload(doc(), { consumed_servings: 1 });
    expect(payload.meal_group).toBeDefined();
    expect(payload.meal_group?.schema_version).toBe(1);
    expect(payload.name).toBe('Bean Bowl');
  });

  // (9) top-level quantity/unit
  it('sets top-level quantity to consumed servings and unit to serving', () => {
    const payload = buildGroupedMealIntakePayload(doc(), { consumed_servings: 2 });
    expect(payload.quantity).toBe(2);
    expect(payload.unit).toBe('serving');
  });

  // (5) components snapshotted as children
  it('snapshots components into meal_group.components', () => {
    const d = doc({
      components: [
        component({ component_id: 'c1', name: 'Beans' }),
        component({ component_id: 'c2', name: 'Rice' }),
      ],
    });
    const payload = buildGroupedMealIntakePayload(d, { consumed_servings: 1 });
    expect(payload.meal_group?.components).toHaveLength(2);
    expect(payload.meal_group?.components[0].name).toBe('Beans');
    expect(payload.meal_group?.components[1].name).toBe('Rice');
  });

  // (6) instructions/steps snapshotted
  it('snapshots steps into meal_group.steps', () => {
    const d = doc({
      kind: 'recipe',
      steps: [
        { step_number: 1, instruction: 'Cook beans.' },
        { step_number: 2, instruction: 'Plate.' },
      ],
    });
    const payload = buildGroupedMealIntakePayload(d, { consumed_servings: 1 });
    expect(payload.meal_group?.steps).toHaveLength(2);
    expect(payload.meal_group?.steps?.[0].instruction).toBe('Cook beans.');
  });

  // (7) source pointers preserved
  it('preserves source pointers on the meal_group', () => {
    const d = doc({
      source: {
        source_type: 'imported',
        source_imported_meal_id: 'imp-9',
        source_planned_meal_id: 'plan-9',
        source_template_id: 'tmpl-9',
      },
    });
    const payload = buildGroupedMealIntakePayload(d, { consumed_servings: 1 });
    const g = payload.meal_group!;
    expect(g.source_meal_document_id).toBe('doc-1');
    expect(g.source_imported_meal_id).toBe('imp-9');
    expect(g.source_planned_meal_id).toBe('plan-9');
    expect(g.source_template_id).toBe('tmpl-9');
    // Mirrored to the back-compat top-level field too.
    expect(payload.source_planned_meal_id).toBe('plan-9');
  });

  // (8) consumed_servings applied + detached default
  it('records consumed_servings and defaults detached_from_source to false', () => {
    const payload = buildGroupedMealIntakePayload(doc(), { consumed_servings: 3 });
    expect(payload.meal_group?.consumed_servings).toBe(3);
    expect(payload.meal_group?.detached_from_source).toBe(false);
  });

  it('defaults consumed_servings to 1 when not supplied', () => {
    const payload = buildGroupedMealIntakePayload(doc());
    expect(payload.quantity).toBe(1);
    expect(payload.meal_group?.consumed_servings).toBe(1);
  });

  it('stores the instance note on meal_group.instance_notes', () => {
    const payload = buildGroupedMealIntakePayload(doc(), {
      consumed_servings: 1,
      instance_note: 'with extra hot sauce',
    });
    expect(payload.meal_group?.instance_notes).toBe('with extra hot sauce');
  });

  // (10) top-level nutrition scales from per-serving nutrition
  it('scales top-level calories/macros from per-serving nutrition deterministically', () => {
    const payload = buildGroupedMealIntakePayload(doc(), { consumed_servings: 2 });
    expect(payload.calories).toBe(500);
    expect(payload.macros).toEqual({ protein: 40, carbs: 48, fat: 12 });
    expect(payload.meal_group?.totals).toEqual({
      calories: 500,
      macros: { protein_g: 40, carbs_g: 48, fat_g: 12 },
    });
  });

  // (11) unknown / review nutrition does not invent numbers
  it('does not invent top-level numbers when the document needs review', () => {
    const d = doc({
      review_state: 'needs_review',
      components: [component({ needs_review: true })],
    });
    const payload = buildGroupedMealIntakePayload(d, { consumed_servings: 2 });
    expect(payload.calories).toBeUndefined();
    expect(payload.macros).toBeUndefined();
    expect(payload.meal_group?.needs_review).toBe(true);
    expect(payload.meal_group?.totals).toEqual({
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
    });
  });

  it('does not invent top-level numbers when nutrition is entirely unknown', () => {
    const d = doc({ per_serving: null, totals: null });
    const payload = buildGroupedMealIntakePayload(d, { consumed_servings: 1 });
    expect(payload.calories).toBeUndefined();
    expect(payload.macros).toBeUndefined();
    expect(payload.meal_group?.needs_review).toBe(true);
  });

  // (12) source MealDocument is not mutated
  it('does not mutate the source document (deep-frozen input)', () => {
    const d = doc({
      kind: 'recipe',
      steps: [{ step_number: 1, instruction: 'Cook.' }],
      components: [component()],
    });
    // Deep freeze to catch any in-place mutation.
    Object.freeze(d.components[0].macros);
    Object.freeze(d.components[0]);
    Object.freeze(d.components);
    if (d.steps) {
      Object.freeze(d.steps[0]);
      Object.freeze(d.steps);
    }
    Object.freeze(d.source);
    if (d.per_serving) Object.freeze(d.per_serving);
    Object.freeze(d);

    const before = JSON.parse(JSON.stringify(d));
    expect(() => buildGroupedMealIntakePayload(d, { consumed_servings: 2 })).not.toThrow();
    expect(d).toEqual(before);
  });

  it('clones components so payload edits cannot reach the source document', () => {
    const d = doc();
    const payload = buildGroupedMealIntakePayload(d, { consumed_servings: 1 });
    expect(payload.meal_group?.components[0]).not.toBe(d.components[0]);
    expect(payload.meal_group?.components[0].macros).not.toBe(d.components[0].macros);
  });

  // (15) the grouped path always produces a grouped (meal_group) payload —
  // it never emits a flat single-food payload, so flat logging is untouched.
  it('always produces a grouped payload (never a flat food payload)', () => {
    const payload = buildGroupedMealIntakePayload(doc());
    expect(payload.meal_group).toBeDefined();
    expect(payload.unit).toBe('serving');
  });
});

// ============================================================================
// scaleTopLevelMealNutrition — deterministic nutrition policy
// ============================================================================

describe('scaleTopLevelMealNutrition', () => {
  it('scales trusted per-serving nutrition by consumed servings', () => {
    expect(scaleTopLevelMealNutrition(doc(), 2)).toEqual({
      calories: 500,
      macros: { protein_g: 40, carbs_g: 48, fat_g: 12 },
    });
  });

  it('returns null for a needs-review document (no invented numbers)', () => {
    expect(scaleTopLevelMealNutrition(doc({ review_state: 'needs_review' }), 1)).toBeNull();
  });

  it('returns null when a component needs review', () => {
    const d = doc({ components: [component({ needs_review: true })] });
    expect(scaleTopLevelMealNutrition(d, 1)).toBeNull();
  });

  it('derives per-serving from totals + confirmed yield', () => {
    const d = doc({
      per_serving: null,
      totals: { calories: 1000, macros: { protein_g: 80, carbs_g: 100, fat_g: 24 } },
      yield: { servings: 4, confirmed: true },
      recipe_yield_servings: 4,
    });
    // 1000 / 4 = 250 per serving, × 2 = 500.
    expect(scaleTopLevelMealNutrition(d, 2)).toEqual({
      calories: 500,
      macros: { protein_g: 40, carbs_g: 50, fat_g: 12 },
    });
  });

  it('treats totals as single-serving when there is no yield concept', () => {
    const d = doc({
      per_serving: null,
      totals: { calories: 300, macros: { protein_g: 30, carbs_g: 20, fat_g: 10 } },
    });
    expect(scaleTopLevelMealNutrition(d, 2)).toEqual({
      calories: 600,
      macros: { protein_g: 60, carbs_g: 40, fat_g: 20 },
    });
  });

  it('returns null when totals exist but no safe per-serving basis is known', () => {
    const d = doc({
      per_serving: null,
      totals: { calories: 1000, macros: { protein_g: 80, carbs_g: 100, fat_g: 24 } },
      // unconfirmed yield ⇒ no safe basis
      yield: { servings: null, confirmed: false },
    });
    expect(scaleTopLevelMealNutrition(d, 1)).toBeNull();
  });

  it('returns null for non-positive consumed servings', () => {
    expect(scaleTopLevelMealNutrition(doc(), 0)).toBeNull();
    expect(scaleTopLevelMealNutrition(doc(), -1)).toBeNull();
    expect(scaleTopLevelMealNutrition(doc(), NaN)).toBeNull();
  });
});

// ============================================================================
// validateGroupedMealLogInput
// ============================================================================

describe('validateGroupedMealLogInput', () => {
  it('defaults consumed_servings to 1 and resolves a date', () => {
    const result = validateGroupedMealLogInput({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.consumed_servings).toBe(1);
      expect(result.value.occurredAt).toBeInstanceOf(Date);
      expect(result.value.note).toBeNull();
    }
  });

  it('rejects a non-positive consumed_servings', () => {
    const result = validateGroupedMealLogInput({ consumed_servings: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed date', () => {
    const result = validateGroupedMealLogInput({ date: '06/02/2026' });
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed time', () => {
    const result = validateGroupedMealLogInput({ date: '2026-06-02', time: '9am' });
    expect(result.ok).toBe(false);
  });

  it('combines date + time into occurredAt', () => {
    const result = validateGroupedMealLogInput({ date: '2026-06-02', time: '08:30' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const d = new Date('2026-06-02T08:30:00');
      expect(result.value.occurredAt.getTime()).toBe(d.getTime());
    }
  });

  it('accepts an explicit occurred_at ISO string', () => {
    const iso = '2026-06-02T12:00:00.000Z';
    const result = validateGroupedMealLogInput({ occurred_at: iso });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.occurredAt.toISOString()).toBe(iso);
  });

  it('trims and caps the note', () => {
    const ok = validateGroupedMealLogInput({ note: '  hi  ' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.note).toBe('hi');

    const tooLong = validateGroupedMealLogInput({ note: 'x'.repeat(501) });
    expect(tooLong.ok).toBe(false);
  });
});

// ============================================================================
// logMealDocumentForPerson — write path
// ============================================================================

describe('logMealDocumentForPerson', () => {
  // (13) person-scoped MealDocument lookup
  it('loads the MealDocument scoped to the caller personId', async () => {
    await logMealDocumentForPerson(PERSON, 'doc-1', { consumed_servings: 1 });
    expect(mockGetMealDocument).toHaveBeenCalledWith(PERSON, 'doc-1');
  });

  // (2)/(17) exactly one journal entry is created
  it('creates EXACTLY ONE journal entry', async () => {
    await logMealDocumentForPerson(PERSON, 'doc-1', { consumed_servings: 2 });
    expect(mockCreateEntry).toHaveBeenCalledTimes(1);
  });

  it('never creates more than one entry across servings/component counts', async () => {
    mockGetMealDocument.mockResolvedValue(
      doc({ components: [component({ component_id: 'a' }), component({ component_id: 'b' })] }),
    );
    await logMealDocumentForPerson(PERSON, 'doc-1', { consumed_servings: 5 });
    expect(mockCreateEntry).toHaveBeenCalledTimes(1);
  });

  // (3) entry_type is intake
  it('creates the entry as entry_type intake for the same personId', async () => {
    await logMealDocumentForPerson(PERSON, 'doc-1', { consumed_servings: 1 });
    const args = mockCreateEntry.mock.calls[0][0];
    expect(args.entryType).toBe('intake');
    expect(args.personId).toBe(PERSON);
  });

  // (4) payload.meal_group exists on the created entry
  it('creates an entry whose payload carries meal_group', async () => {
    await logMealDocumentForPerson(PERSON, 'doc-1', { consumed_servings: 1 });
    const args = mockCreateEntry.mock.calls[0][0];
    expect(args.payload.meal_group).toBeDefined();
    expect(args.payload.unit).toBe('serving');
  });

  // (14) non-owner / missing MealDocument fails 404-style
  it('throws MealDocumentNotFoundError when the document is not owned/missing', async () => {
    mockGetMealDocument.mockResolvedValue(null);
    await expect(
      logMealDocumentForPerson('other-person', 'doc-1', { consumed_servings: 1 }),
    ).rejects.toBeInstanceOf(MealDocumentNotFoundError);
    expect(mockCreateEntry).not.toHaveBeenCalled();
  });

  it('throws GroupedMealLogValidationError on invalid input (no entry created)', async () => {
    await expect(
      logMealDocumentForPerson(PERSON, 'doc-1', { consumed_servings: -2 }),
    ).rejects.toBeInstanceOf(GroupedMealLogValidationError);
    expect(mockGetMealDocument).not.toHaveBeenCalled();
    expect(mockCreateEntry).not.toHaveBeenCalled();
  });
});

// ============================================================================
// (16) Branded food search + AI are NOT referenced by this write path.
// Structural guard: the grouped logging service must never import/branch into
// branded food search or the AI gateway from the nutrition path.
// ============================================================================

describe('isolation guards', () => {
  const src = readFileSync(
    join(__dirname, '..', 'groupedMealLoggingService.ts'),
    'utf8',
  );

  it('does not reference branded food search', () => {
    expect(src).not.toMatch(/foods\/search/);
    expect(src).not.toMatch(/searchFoods/);
    expect(src).not.toMatch(/food_objects/);
  });

  it('does not import or call the AI gateway in the nutrition path', () => {
    expect(src).not.toMatch(/@\/lib\/ai/);
    expect(src).not.toMatch(/aiGateway|callAI|openai/i);
  });
});
