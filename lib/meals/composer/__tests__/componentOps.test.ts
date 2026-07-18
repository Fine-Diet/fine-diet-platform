import type { MealComponent } from '../../types';
import {
  addBlankComponent,
  addComponentFromSelection,
  applySelectionToComponent,
  blankComponent,
  clearComponentGrounding,
  duplicateComponent,
  moveComponentDown,
  moveComponentUp,
  removeComponent,
  setComponentNeedsReview,
  swapComponents,
  updateComponentName,
  updateComponentPrepNote,
  updateComponentQuantityUnit,
} from '../componentOps';
import type { MealComposerFoodSelection } from '../types';

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

describe('blankComponent / addBlankComponent', () => {
  it('creates an ungrounded, needs-review component', () => {
    const c = blankComponent('new-1');
    expect(c.component_id).toBe('new-1');
    expect(c.food_object_id).toBeNull();
    expect(c.match_status).toBe('none');
    expect(c.needs_review).toBe(true);
  });

  it('appends without mutating the input array', () => {
    const original = [component()];
    const next = addBlankComponent(original, 'new-1');
    expect(original).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(next[1].component_id).toBe('new-1');
  });
});

describe('addComponentFromSelection / applySelectionToComponent', () => {
  const foodSnapshot: MealComposerFoodSelection['food'] = {
    id: 'food-rice',
    calories: 200,
    proteinG: 4,
    carbsG: 44,
    fatG: 0.5,
    servingSizeG: 150,
  } as unknown as MealComposerFoodSelection['food'];

  it('grounds a new component with a full food snapshot', () => {
    const next = addComponentFromSelection([], 'new-1', {
      food_object_id: 'food-rice',
      name: 'Rice',
      food: foodSnapshot,
    });
    expect(next).toHaveLength(1);
    expect(next[0].food_object_id).toBe('food-rice');
    expect(next[0].match_status).toBe('matched');
    expect(next[0].needs_review).toBe(false);
    expect(next[0].calories).toBe(200);
    // Corrective fix (plans-vs-log-nutrition-read): a fresh match defaults
    // to 1 serving so recompute can trust its contribution immediately —
    // see lib/meals/componentGrounding.ts applyGroundingInPlace.
    expect(next[0].quantity).toBe(1);
    expect(next[0].unit).toBe('serving');
  });

  it('flags for review when the selection has no food snapshot', () => {
    const next = addComponentFromSelection([], 'new-1', {
      food_object_id: 'food-rice',
      name: 'Rice',
    });
    expect(next[0].food_object_id).toBe('food-rice');
    expect(next[0].match_status).toBe('matched');
    expect(next[0].needs_review).toBe(true);
    expect(next[0].calories).toBeNull();
  });

  it('applies a selection to an existing component, replacing its grounding', () => {
    const original = [component({ food_object_id: null, match_status: 'none', calories: null })];
    const next = applySelectionToComponent(original, 'c1', {
      food_object_id: 'food-rice',
      name: 'Rice',
      food: foodSnapshot,
    });
    expect(next[0].food_object_id).toBe('food-rice');
    expect(next[0].name).toBe('Rice');
    expect(next[0].calories).toBe(200);
    expect(next[0].needs_review).toBe(false);
  });
});

describe('removeComponent', () => {
  it('removes by id and leaves others untouched', () => {
    const original = [component({ component_id: 'a' }), component({ component_id: 'b' })];
    const next = removeComponent(original, 'a');
    expect(next).toHaveLength(1);
    expect(next[0].component_id).toBe('b');
  });
});

describe('moveComponentUp / moveComponentDown', () => {
  const list = [
    component({ component_id: 'a' }),
    component({ component_id: 'b' }),
    component({ component_id: 'c' }),
  ];

  it('moves a middle component up', () => {
    const next = moveComponentUp(list, 'b');
    expect(next.map((c) => c.component_id)).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op moving the first component up', () => {
    const next = moveComponentUp(list, 'a');
    expect(next).toBe(list);
  });

  it('moves a middle component down', () => {
    const next = moveComponentDown(list, 'b');
    expect(next.map((c) => c.component_id)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op moving the last component down', () => {
    const next = moveComponentDown(list, 'c');
    expect(next).toBe(list);
  });

  it('is a no-op for an unknown id', () => {
    expect(moveComponentUp(list, 'ghost')).toBe(list);
    expect(moveComponentDown(list, 'ghost')).toBe(list);
  });
});

describe('swapComponents', () => {
  const list = [
    component({ component_id: 'a' }),
    component({ component_id: 'b' }),
    component({ component_id: 'c' }),
  ];

  it('swaps two arbitrary components by id', () => {
    const next = swapComponents(list, 'a', 'c');
    expect(next.map((c) => c.component_id)).toEqual(['c', 'b', 'a']);
  });

  it('is a no-op when swapping a component with itself', () => {
    expect(swapComponents(list, 'a', 'a')).toBe(list);
  });

  it('is a no-op when either id is missing', () => {
    expect(swapComponents(list, 'a', 'ghost')).toBe(list);
  });
});

describe('duplicateComponent', () => {
  it('inserts a clone immediately after the original with a fresh id', () => {
    const list = [component({ component_id: 'a', name: 'Beans' }), component({ component_id: 'b' })];
    const next = duplicateComponent(list, 'a', 'a-copy');
    expect(next.map((c) => c.component_id)).toEqual(['a', 'a-copy', 'b']);
    expect(next[1].name).toBe('Beans');
    expect(next[1]).not.toBe(next[0]);
    expect(next[1].macros).not.toBe(next[0].macros);
  });

  it('carries over grounding and nutrition unchanged', () => {
    const list = [component({ component_id: 'a', calories: 250, needs_review: false })];
    const next = duplicateComponent(list, 'a', 'a-copy');
    expect(next[1].calories).toBe(250);
    expect(next[1].needs_review).toBe(false);
    expect(next[1].food_object_id).toBe('food-beans');
  });

  it('is a no-op for an unknown id', () => {
    const list = [component()];
    expect(duplicateComponent(list, 'ghost', 'x')).toBe(list);
  });
});

describe('updateComponentName', () => {
  it('detaches grounding when a grounded component is renamed', () => {
    const list = [component({ food_object_id: 'food-beans', match_status: 'matched' })];
    const next = updateComponentName(list, 'c1', 'Black beans');
    expect(next[0].name).toBe('Black beans');
    expect(next[0].food_object_id).toBeNull();
    expect(next[0].match_status).toBe('none');
    expect(next[0].needs_review).toBe(true);
  });

  it('keeps grounding when the name is unchanged', () => {
    const list = [component({ name: 'Beans', food_object_id: 'food-beans' })];
    const next = updateComponentName(list, 'c1', 'Beans');
    expect(next[0].food_object_id).toBe('food-beans');
  });

  it('does not detach an ungrounded component', () => {
    const list = [component({ food_object_id: null, match_status: 'none' })];
    const next = updateComponentName(list, 'c1', 'Something else');
    expect(next[0].food_object_id).toBeNull();
  });
});

describe('updateComponentQuantityUnit', () => {
  it('updates quantity/unit without detaching when the unit is unchanged', () => {
    const list = [component({ nutrition_basis: 'per_serving', quantity: 1, unit: 'cup' })];
    const next = updateComponentQuantityUnit(list, 'c1', 2, 'cup');
    expect(next[0].quantity).toBe(2);
    expect(next[0].unit).toBe('cup');
    expect(next[0].food_object_id).toBe('food-beans');
  });

  it('detaches per_component nutrition when the unit changes', () => {
    const list = [
      component({
        nutrition_basis: 'per_component',
        quantity: 1,
        unit: 'cup',
        food_object_id: null,
        match_status: 'none',
        source_kind: 'user_entered',
      }),
    ];
    const next = updateComponentQuantityUnit(list, 'c1', 1, 'tbsp');
    expect(next[0].unit).toBe('tbsp');
    expect(next[0].calories).toBeNull();
    expect(next[0].needs_review).toBe(true);
  });

  it('does not detach per_serving nutrition on a unit change (grounding-based scaling)', () => {
    const list = [component({ nutrition_basis: 'per_serving', unit: 'cup' })];
    const next = updateComponentQuantityUnit(list, 'c1', 1, 'tbsp');
    expect(next[0].food_object_id).toBe('food-beans');
  });
});

describe('updateComponentPrepNote', () => {
  it('sets a trimmed prep note, or null when blank', () => {
    const list = [component()];
    expect(updateComponentPrepNote(list, 'c1', 'diced')[0].preparation_note).toBe('diced');
    expect(updateComponentPrepNote(list, 'c1', '')[0].preparation_note).toBeNull();
  });
});

describe('clearComponentGrounding / setComponentNeedsReview', () => {
  it('clears grounding and flags for review', () => {
    const list = [component()];
    const next = clearComponentGrounding(list, 'c1');
    expect(next[0].food_object_id).toBeNull();
    expect(next[0].match_status).toBe('none');
    expect(next[0].needs_review).toBe(true);
  });

  it('toggles needs_review independently of grounding', () => {
    const list = [component({ needs_review: false })];
    expect(setComponentNeedsReview(list, 'c1', true)[0].needs_review).toBe(true);
    expect(setComponentNeedsReview(list, 'c1', false)[0].needs_review).toBe(false);
  });
});
