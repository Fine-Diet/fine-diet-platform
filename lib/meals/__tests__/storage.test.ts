import type { MealTemplate } from '@/lib/journal/types';

import { mealTemplateToMealDocument, loggedMealGroupToIntakePayload } from '../adapters';
import { MEAL_SCHEMA_VERSION, type LoggedMealGroup, type MealDocument } from '../types';
import {
  assertMealDocumentPersonScoped,
  mealDocumentToStorageRow,
  validateLoggedMealGroup,
  validateLoggedMealGroupPayload,
  validateMealDocumentForStorage,
} from '../storage';

// ============================================================================
// Fixtures
// ============================================================================

const SAVED_MEAL: MealTemplate = {
  id: 'tmpl-1',
  name: 'Protein Bowl',
  items: [
    {
      id: 'item-1',
      name: 'Chicken Breast',
      quantity: 1,
      unit: 'serving',
      calories: 200,
      macros: { protein: 40, carbs: 0, fat: 4 },
      foodObjectId: 'food-chicken',
    },
    {
      id: 'item-2',
      name: 'Brown Rice',
      quantity: 1,
      unit: 'cup',
      calories: 220,
      macros: { protein: 5, carbs: 45, fat: 2 },
      foodObjectId: 'food-rice',
    },
  ],
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),
};

function buildDoc(): MealDocument {
  // mealTemplateToMealDocument produces a confirmed, NDS-less meal doc.
  return mealTemplateToMealDocument(SAVED_MEAL);
}

function buildLoggedGroup(): LoggedMealGroup {
  return {
    schema_version: MEAL_SCHEMA_VERSION,
    name: 'Protein Bowl',
    source_meal_document_id: null,
    source_imported_meal_id: null,
    source_planned_meal_id: null,
    source_template_id: 'tmpl-1',
    components: buildDoc().components,
    totals: { calories: 420, macros: { protein_g: 45, carbs_g: 45, fat_g: 6 } },
    planned_servings: null,
    consumed_servings: 1,
    detached_from_source: false,
    needs_review: false,
  };
}

// ============================================================================
// validateMealDocumentForStorage
// ============================================================================

describe('validateMealDocumentForStorage', () => {
  it('accepts a valid NDS-less saved-meal document and projects the storage row', () => {
    const doc = buildDoc();
    const result = validateMealDocumentForStorage(doc, { personId: 'person-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = result.value;
    expect(row.person_id).toBe('person-1');
    expect(row.kind).toBe('meal');
    expect(row.title).toBe('Protein Bowl');
    expect(row.review_state).toBe('confirmed');
    expect(row.schema_version).toBe(MEAL_SCHEMA_VERSION);
    expect(row.source_type).toBe('saved_meal');
    expect(row.source_id).toBe('tmpl-1');
    // document_json is the source of truth and carries the owner.
    expect(row.document_json.person_id).toBe('person-1');
  });

  it('does not require NDS (nds null is valid)', () => {
    const doc = buildDoc();
    expect(doc.nds).toBeNull();
    expect(validateMealDocumentForStorage(doc, { personId: 'p' }).ok).toBe(true);
  });

  it('rejects an empty title', () => {
    const doc = { ...buildDoc(), title: '   ' };
    const result = validateMealDocumentForStorage(doc, { personId: 'p' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/title/);
  });

  it('rejects a schema_version below 1', () => {
    const doc = { ...buildDoc(), schema_version: 0 };
    const result = validateMealDocumentForStorage(doc, { personId: 'p' });
    expect(result.ok).toBe(false);
  });

  it('rejects when the document is scoped to a different person', () => {
    const doc = { ...buildDoc(), person_id: 'person-A' };
    const result = validateMealDocumentForStorage(doc, { personId: 'person-B' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/person_id/);
  });

  it('requires an owner when neither options.personId nor document.person_id is set', () => {
    const doc = { ...buildDoc(), person_id: null };
    const result = validateMealDocumentForStorage(doc);
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid kind via the schema', () => {
    const doc = { ...buildDoc(), kind: 'snack' as unknown as MealDocument['kind'] };
    expect(validateMealDocumentForStorage(doc, { personId: 'p' }).ok).toBe(false);
  });

  it('rejects a non-object input', () => {
    expect(validateMealDocumentForStorage(null).ok).toBe(false);
    expect(validateMealDocumentForStorage('nope').ok).toBe(false);
  });
});

// ============================================================================
// mealDocumentToStorageRow
// ============================================================================

describe('mealDocumentToStorageRow', () => {
  it('uses the supplied personId as the row owner and stamps it into document_json', () => {
    const doc = { ...buildDoc(), person_id: null };
    const row = mealDocumentToStorageRow(doc, 'owner-1');
    expect(row.person_id).toBe('owner-1');
    expect(row.document_json.person_id).toBe('owner-1');
  });

  it('copies intents as a new array (no shared reference)', () => {
    const doc = buildDoc();
    const row = mealDocumentToStorageRow(doc, 'owner-1');
    expect(row.intents).toEqual(doc.intents);
    expect(row.intents).not.toBe(doc.intents);
  });
});

// ============================================================================
// assertMealDocumentPersonScoped
// ============================================================================

describe('assertMealDocumentPersonScoped', () => {
  it('passes for a matching owner', () => {
    expect(() => assertMealDocumentPersonScoped({ person_id: 'p1' }, 'p1')).not.toThrow();
  });

  it('passes for an unowned draft (null person_id)', () => {
    expect(() => assertMealDocumentPersonScoped({ person_id: null }, 'p1')).not.toThrow();
  });

  it('throws on owner mismatch', () => {
    expect(() => assertMealDocumentPersonScoped({ person_id: 'p1' }, 'p2')).toThrow(/scoped/);
  });

  it('throws when personId is empty', () => {
    expect(() => assertMealDocumentPersonScoped({ person_id: 'p1' }, '')).toThrow(/required/);
  });
});

// ============================================================================
// validateLoggedMealGroupPayload / validateLoggedMealGroup
// ============================================================================

describe('validateLoggedMealGroupPayload', () => {
  it('accepts a grouped intake payload built from a LoggedMealGroup', () => {
    const payload = loggedMealGroupToIntakePayload(buildLoggedGroup());
    const result = validateLoggedMealGroupPayload(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.meal_group).toBeDefined();
    expect(result.value.name).toBe('Protein Bowl');
  });

  it('accepts a legacy flat payload with no meal_group (absence ⇒ legacy)', () => {
    const result = validateLoggedMealGroupPayload({ name: 'Apple', calories: 95 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.meal_group).toBeUndefined();
  });

  it('rejects a flat payload when meal_group is required', () => {
    const result = validateLoggedMealGroupPayload(
      { name: 'Apple', calories: 95 },
      { requireMealGroup: true },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/meal_group/);
  });

  it('rejects a malformed meal_group', () => {
    const bad = { name: 'x', meal_group: { schema_version: 1 } };
    expect(validateLoggedMealGroupPayload(bad).ok).toBe(false);
  });
});

describe('validateLoggedMealGroup', () => {
  it('accepts a well-formed bare LoggedMealGroup', () => {
    expect(validateLoggedMealGroup(buildLoggedGroup()).ok).toBe(true);
  });

  it('rejects a bare group missing required fields', () => {
    expect(validateLoggedMealGroup({ schema_version: 1, name: 'x' }).ok).toBe(false);
  });
});
