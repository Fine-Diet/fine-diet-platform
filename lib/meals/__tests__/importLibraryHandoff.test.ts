import {
  buildFromImportRequestBody,
  buildMealLibraryHandoffHref,
  detectImportRawIngredientDivergence,
  primaryImportLibrarySaveLabel,
  requireMealDocumentIdFromImportResponse,
  selectStagedImportsNeedingLibrarySave,
} from '../importLibraryHandoff';
import type { ImportedMeal } from '@/lib/plans/types';

function imported(partial: Partial<ImportedMeal> & { id: string }): ImportedMeal {
  return {
    person_id: 'person-1',
    title: partial.title ?? 'Draft',
    source_type: 'manual',
    source_url: null,
    payload: { items: [], totals: {} },
    protein_score_10: null,
    is_main_meal: false,
    psq_multiplier: 1,
    meal_derived_data: {
      protein_score_10: 0,
      is_main_meal: false,
      meal_calories: 0,
      meal_protein_g: 0,
      psq_multiplier: 1,
    },
    nds_confidence: 'low',
    import_type: 'pasted_text',
    source_platform: null,
    raw_input_text: null,
    parse_status: 'parsed',
    parsed_payload_json: null,
    nutrition_estimate_json: null,
    ingredient_match_json: null,
    nds_version: '1',
    classifier_version: '1',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...partial,
  } as ImportedMeal;
}

describe('importLibraryHandoff', () => {
  describe('buildFromImportRequestBody', () => {
    it('uses confirm-yield body when servings are explicit', () => {
      expect(buildFromImportRequestBody({ servings: 4 })).toEqual({
        yield: { servings: 4, yield_label: null, serving_label: null },
      });
    });

    it('uses draft body when servings are missing', () => {
      expect(buildFromImportRequestBody({ servings: null })).toEqual({});
      expect(buildFromImportRequestBody({ servings: 0 })).toEqual({});
    });
  });

  describe('requireMealDocumentIdFromImportResponse', () => {
    it('requires a returned meal_document.id before success', () => {
      expect(
        requireMealDocumentIdFromImportResponse({
          meal_document: { id: 'doc-1' },
        }),
      ).toBe('doc-1');
      expect(() => requireMealDocumentIdFromImportResponse({ ok: true })).toThrow(
        /meal document/,
      );
      expect(() =>
        requireMealDocumentIdFromImportResponse({ meal_document: { id: '' } }),
      ).toThrow(/meal document id/);
    });
  });

  describe('buildMealLibraryHandoffHref', () => {
    it('navigates to Meals & Recipes with the document id', () => {
      expect(buildMealLibraryHandoffHref('doc-99')).toBe(
        '/app/food/meals?document=doc-99',
      );
    });
  });

  describe('selectStagedImportsNeedingLibrarySave', () => {
    it('keeps parsed imports recoverable before promotion', () => {
      const rows = selectStagedImportsNeedingLibrarySave({
        imports: [
          imported({ id: 'a', parse_status: 'parsed', updated_at: '2026-08-01T02:00:00Z' }),
          imported({ id: 'b', parse_status: 'parsed', updated_at: '2026-08-01T01:00:00Z' }),
          imported({ id: 'c', parse_status: 'pending' }),
          imported({ id: 'd', parse_status: 'manual_review', updated_at: '2026-08-01T03:00:00Z' }),
        ],
        linkedImportedMealIds: ['b'],
      });
      expect(rows.map((row) => row.id)).toEqual(['d', 'a']);
    });

    it('excludes imports already linked to a MealDocument', () => {
      const rows = selectStagedImportsNeedingLibrarySave({
        imports: [imported({ id: 'linked', parse_status: 'parsed' })],
        linkedImportedMealIds: ['linked'],
      });
      expect(rows).toEqual([]);
    });
  });

  describe('primaryImportLibrarySaveLabel', () => {
    it('labels explicit-yield saves as Confirm and save recipe', () => {
      expect(
        primaryImportLibrarySaveLabel({
          hasExplicitServings: true,
          isRecipeLike: true,
        }),
      ).toBe('Confirm and save recipe');
    });

    it('labels draft library saves as Save to Meals & Recipes', () => {
      expect(
        primaryImportLibrarySaveLabel({
          hasExplicitServings: false,
          isRecipeLike: false,
        }),
      ).toBe('Save to Meals & Recipes');
    });
  });

  describe('detectImportRawIngredientDivergence', () => {
    it('does not warn when raw input is empty', () => {
      expect(
        detectImportRawIngredientDivergence({
          raw_input_text: null,
          ingredients: [
            {
              raw_text: '1 cup oats',
              normalized_name: 'oats',
              quantity_value: 1,
              quantity_unit: 'cup',
              preparation_note: null,
            },
          ],
        }).diverged,
      ).toBe(false);
    });

    it('warns when structured ingredients no longer match preserved raw paste', () => {
      const result = detectImportRawIngredientDivergence({
        raw_input_text: 'Ingredients\n1 cup oats\n2 eggs\n1 banana',
        ingredients: [
          {
            raw_text: '2 cups unrelated flour',
            normalized_name: 'flour',
            quantity_value: 2,
            quantity_unit: 'cup',
            preparation_note: null,
          },
          {
            raw_text: '1 tbsp mystery spice',
            normalized_name: 'spice',
            quantity_value: 1,
            quantity_unit: 'tbsp',
            preparation_note: null,
          },
          {
            raw_text: 'salt to taste',
            normalized_name: 'salt',
            quantity_value: null,
            quantity_unit: null,
            preparation_note: null,
          },
        ],
      });
      expect(result.diverged).toBe(true);
      expect(result.message).toMatch(/preserved original paste/i);
    });

    it('keeps raw input considered present when matches still align', () => {
      const result = detectImportRawIngredientDivergence({
        raw_input_text: '1 cup oats\n2 eggs',
        ingredients: [
          {
            raw_text: '1 cup oats',
            normalized_name: 'oats',
            quantity_value: 1,
            quantity_unit: 'cup',
            preparation_note: null,
          },
          {
            raw_text: '2 eggs',
            normalized_name: 'eggs',
            quantity_value: 2,
            quantity_unit: 'each',
            preparation_note: null,
          },
        ],
      });
      expect(result.diverged).toBe(false);
    });
  });
});
