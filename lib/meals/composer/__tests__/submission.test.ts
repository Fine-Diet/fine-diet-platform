import type { MealComponent, MealDocument } from '../../types';

// submission.ts re-imports buildGroupedMealIntakePayload from
// groupedMealLoggingService.ts, which pulls in journalServerService/Supabase
// at module load. Mock those boundaries so this stays a pure-logic test —
// mirrors the pattern in lib/meals/__tests__/groupedMealLoggingService.test.ts.
jest.mock('../../mealDocumentServerService', () => ({ getMealDocumentForPerson: jest.fn() }));
jest.mock('@/lib/journal/journalServerService', () => ({ createEntry: jest.fn() }));

import { createBlankMealDocument, createComposerState } from '../state';
import {
  buildComposerLogPayload,
  buildDocumentForCreate,
  buildStructuralEditPatch,
} from '../submission';

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
    ...createBlankMealDocument(),
    id: 'doc-1',
    title: 'Bean Bowl',
    review_state: 'confirmed',
    components: [component()],
    per_serving: { calories: 100, macros: { protein_g: 10, carbs_g: 12, fat_g: 3 } },
    ...overrides,
  };
}

describe('buildDocumentForCreate', () => {
  it('normalizes id/timestamps for a new document and trims the title', () => {
    const state = createComposerState('create', { ...doc(), id: 'should-be-ignored', title: '  Bowl  ' });
    const built = buildDocumentForCreate(state);
    expect(built.id).toBeNull();
    expect(built.created_at).toBeNull();
    expect(built.updated_at).toBeNull();
    expect(built.title).toBe('Bowl');
  });

  it('does not promote a draft with a needs-review component to confirmed', () => {
    const state = createComposerState('create', {
      ...doc(),
      review_state: 'draft',
      components: [component({ needs_review: true })],
    });
    expect(buildDocumentForCreate(state).review_state).toBe('needs_review');
  });

  it('promotes a clean draft to confirmed', () => {
    const state = createComposerState('create', { ...doc(), review_state: 'draft' });
    expect(buildDocumentForCreate(state).review_state).toBe('confirmed');
  });
});

describe('buildStructuralEditPatch', () => {
  it('produces an empty patch when nothing changed', () => {
    const original = doc();
    expect(buildStructuralEditPatch(original, original)).toEqual({});
  });

  it('diffs a title change', () => {
    const original = doc();
    const edited = { ...original, title: 'Renamed Bowl' };
    expect(buildStructuralEditPatch(original, edited)).toEqual({ title: 'Renamed Bowl' });
  });

  it('emits add_components for a new component id', () => {
    const original = doc();
    const edited = {
      ...original,
      components: [...original.components, component({ component_id: 'new-1', name: 'Rice', food_object_id: null, match_status: 'none' })],
    };
    const patch = buildStructuralEditPatch(original, edited);
    expect(patch.add_components).toEqual([{ name: 'Rice', quantity: 1, unit: 'serving' }]);
    expect(patch.components).toBeUndefined();
  });

  it('emits remove_component_ids for a dropped component id', () => {
    const original = doc({
      components: [component({ component_id: 'c1' }), component({ component_id: 'c2', name: 'Rice' })],
    });
    const edited = { ...original, components: [original.components[0]] };
    const patch = buildStructuralEditPatch(original, edited);
    expect(patch.remove_component_ids).toEqual(['c2']);
  });

  it('emits unmatch_component_ids when a grounded component is cleared', () => {
    const original = doc();
    const edited = {
      ...original,
      components: [{ ...original.components[0], food_object_id: null, match_status: 'none' as const }],
    };
    const patch = buildStructuralEditPatch(original, edited);
    expect(patch.unmatch_component_ids).toEqual(['c1']);
  });

  it('emits a components[] edit for a quantity change on an existing component', () => {
    const original = doc();
    const edited = {
      ...original,
      components: [{ ...original.components[0], quantity: 2 }],
    };
    const patch = buildStructuralEditPatch(original, edited);
    expect(patch.components).toEqual([{ component_id: 'c1', quantity: 2 }]);
  });

  it('emits steps when instruction text changes', () => {
    const original = doc({ kind: 'recipe', steps: [{ step_number: 1, instruction: 'Cook.' }] });
    const edited = { ...original, steps: [{ step_number: 1, instruction: 'Cook thoroughly.' }] };
    const patch = buildStructuralEditPatch(original, edited);
    expect(patch.steps).toEqual([{ step_number: 1, instruction: 'Cook thoroughly.' }]);
  });

  it('emits a review_state change', () => {
    const original = doc({ review_state: 'needs_review' });
    const edited = { ...original, review_state: 'confirmed' as const };
    expect(buildStructuralEditPatch(original, edited)).toEqual({ review_state: 'confirmed' });
  });
});

describe('buildComposerLogPayload', () => {
  it('delegates to buildGroupedMealIntakePayload with the composer servings/note', () => {
    const state = createComposerState('log', doc(), { consumedServingsInput: '2', instanceNote: 'extra hot sauce' });
    const payload = buildComposerLogPayload(state);
    expect(payload.meal_group).toBeDefined();
    expect(payload.quantity).toBe(2);
    expect(payload.meal_group?.instance_notes).toBe('extra hot sauce');
    expect(payload.calories).toBe(200);
  });

  it('defaults to 1 serving for invalid/blank input', () => {
    const state = createComposerState('log', doc(), { consumedServingsInput: '' });
    const payload = buildComposerLogPayload(state);
    expect(payload.quantity).toBe(1);
  });
});
