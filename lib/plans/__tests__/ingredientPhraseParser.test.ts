/**
 * Plans Phase 33 — `parseIngredientPhrase` structured-completeness
 * regressions for hedge words, "to" ranges, plus/+ composition, and
 * "a pinch/dash/handful of X" article short-circuits.
 *
 * The pre-Packet-33 parser collapsed all of the phrases below into
 * the ingredient-name slot, producing blank amount/unit fields and
 * forcing the matcher onto its most conservative defaults. The
 * cases here are the smallest change surface that gives transcript-
 * recovered drafts materially better structured completeness.
 */

import { parseIngredientPhrase } from '../ingredientPhraseParser';

describe('parseIngredientPhrase — Packet 33 structured-completeness additions', () => {
  describe('leading hedge words', () => {
    test('strips "about" and demotes quantity_source to approximated', () => {
      const p = parseIngredientPhrase('about 2 tbsp olive oil');
      expect(p.quantity_value).toBe(2);
      expect(p.quantity_unit).toBe('tbsp');
      expect(p.normalized_name).toBe('olive oil');
      expect(p.quantity_source).toBe('approximated');
      expect(p.parse_confidence).toBe('medium');
      expect(p.preparation_note).toContain('approximate');
    });

    test('strips "approximately" with decimals', () => {
      const p = parseIngredientPhrase('approximately 1.5 cups flour');
      expect(p.quantity_value).toBe(1.5);
      // Parser preserves the user's unit token (lowercased) as-is —
      // both `cup` and `cups` are accepted by INGREDIENT_UNITS.
      expect(p.quantity_unit).toBe('cups');
      expect(p.normalized_name).toBe('flour');
      expect(p.quantity_source).toBe('approximated');
    });

    test('strips "~" shortcut and tags approximated', () => {
      const p = parseIngredientPhrase('~ 1/2 tsp salt');
      expect(p.quantity_value).toBeCloseTo(0.5);
      expect(p.quantity_unit).toBe('tsp');
      expect(p.normalized_name).toBe('salt');
      expect(p.quantity_source).toBe('approximated');
    });
  });

  describe('"to" ranges', () => {
    test('1/2 to 3/4 cup → midpoint 0.63 cup (Packet 34 rounding)', () => {
      const p = parseIngredientPhrase('1/2 to 3/4 cup milk');
      // Packet 34 rounds range midpoints to 2 decimals to avoid
      // synthetic precision; 0.625 → 0.63.
      expect(p.quantity_value).toBe(0.63);
      expect(p.quantity_unit).toBe('cup');
      expect(p.normalized_name).toBe('milk');
      expect(p.quantity_source).toBe('range_midpoint');
      expect(p.parse_confidence).toBe('low');
    });

    test('2 to 3 tablespoons → midpoint 2.5 tbsp', () => {
      const p = parseIngredientPhrase('2 to 3 tablespoons soy sauce');
      expect(p.quantity_value).toBeCloseTo(2.5);
      expect(p.quantity_unit).toBe('tablespoons');
      expect(p.normalized_name).toBe('soy sauce');
      expect(p.quantity_source).toBe('range_midpoint');
    });

    test('mixed fraction on either side of "to"', () => {
      const p = parseIngredientPhrase('1 1/2 to 2 cups chicken stock');
      expect(p.quantity_value).toBeCloseTo(1.75);
      expect(p.quantity_unit).toBe('cups');
      expect(p.normalized_name).toBe('chicken stock');
    });
  });

  describe('plus / + composition', () => {
    test('1 cup plus 2 tbsp flour → 1 cup flour with prep "plus 2 tbsp"', () => {
      const p = parseIngredientPhrase('1 cup plus 2 tbsp flour');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('cup');
      expect(p.normalized_name).toBe('flour');
      expect(p.preparation_note).toContain('plus 2 tbsp');
    });

    test('1 tbsp + 1 tsp olive oil → 1 tbsp olive oil with prep "plus 1 tsp"', () => {
      const p = parseIngredientPhrase('1 tbsp + 1 tsp olive oil');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('tbsp');
      expect(p.normalized_name).toBe('olive oil');
      expect(p.preparation_note).toContain('plus 1 tsp');
    });

    test('does not fold prose like "salt plus pepper to taste"', () => {
      const p = parseIngredientPhrase('salt plus pepper to taste');
      expect(p.preparation_note ?? '').not.toContain('plus');
      expect(p.normalized_name).toBe('salt plus pepper to taste');
    });
  });

  describe('Packet 34 — range midpoint precision + splash unit + bare conversational form', () => {
    test('1/2 to 3/4 cup milk → 0.63 cup (not 0.625)', () => {
      const p = parseIngredientPhrase('1/2 to 3/4 cup milk');
      expect(p.quantity_value).toBe(0.63);
      expect(p.quantity_unit).toBe('cup');
      expect(p.normalized_name).toBe('milk');
      expect(p.quantity_source).toBe('range_midpoint');
      expect(p.parse_confidence).toBe('low');
    });

    test('2 to 3 tablespoons (already clean) stays 2.5', () => {
      const p = parseIngredientPhrase('2 to 3 tablespoons soy sauce');
      expect(p.quantity_value).toBe(2.5);
    });

    test('1 1/4 to 1 1/2 cups → 1.38 cups', () => {
      const p = parseIngredientPhrase('1 1/4 to 1 1/2 cups chicken stock');
      expect(p.quantity_value).toBe(1.38);
    });

    test('range prep note preserves the raw range text', () => {
      const p = parseIngredientPhrase('1/2 to 3/4 cup milk');
      expect(p.preparation_note ?? '').toContain('range 1/2 to 3/4');
    });

    test('splash of olive oil (bare form) → 1 splash', () => {
      const p = parseIngredientPhrase('splash of olive oil');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('splash');
      expect(p.normalized_name).toBe('olive oil');
      expect(p.quantity_source).toBe('count_inferred');
      expect(p.parse_confidence).toBe('medium');
    });

    test('a splash of vinegar → 1 splash vinegar', () => {
      const p = parseIngredientPhrase('a splash of vinegar');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('splash');
      expect(p.normalized_name).toBe('vinegar');
    });

    test('pinch of salt (bare form) → 1 pinch salt', () => {
      const p = parseIngredientPhrase('pinch of salt');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('pinch');
      expect(p.normalized_name).toBe('salt');
    });

    test('handful of cilantro (bare form) → 1 handful cilantro', () => {
      const p = parseIngredientPhrase('handful of cilantro');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('handful');
      expect(p.normalized_name).toBe('cilantro');
    });

    test('dash of pepper (bare form) → 1 dash pepper', () => {
      const p = parseIngredientPhrase('dash of pepper');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('dash');
      expect(p.normalized_name).toBe('pepper');
    });

    test('does not match unrelated "of" prose like "box of tomatoes"', () => {
      const p = parseIngredientPhrase('box of tomatoes');
      expect(p.quantity_unit).not.toBe('pinch');
      expect(p.quantity_unit).not.toBe('handful');
      expect(p.quantity_unit).not.toBe('splash');
    });
  });

  describe('article + small-measure short circuit', () => {
    test('a pinch of salt → 1 pinch, name=salt, count_inferred', () => {
      const p = parseIngredientPhrase('a pinch of salt');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('pinch');
      expect(p.normalized_name).toBe('salt');
      expect(p.quantity_source).toBe('count_inferred');
      expect(p.parse_confidence).toBe('medium');
    });

    test('a dash of vanilla extract → 1 dash', () => {
      const p = parseIngredientPhrase('a dash of vanilla extract');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('dash');
      expect(p.normalized_name).toBe('vanilla extract');
    });

    test('a handful of fresh herbs → 1 handful, size word demoted', () => {
      const p = parseIngredientPhrase('a handful of fresh herbs');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('handful');
      // `fresh` is a pre-existing size adjective and is demoted to
      // the prep note by the shared splitLeadingSizeAdjective pass.
      expect(p.normalized_name).toBe('herbs');
      expect(p.preparation_note).toContain('fresh');
    });

    test('a handful of parsley (no size word) → 1 handful parsley', () => {
      const p = parseIngredientPhrase('a handful of parsley');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('handful');
      expect(p.normalized_name).toBe('parsley');
    });

    test('"an" article works too', () => {
      const p = parseIngredientPhrase('an handful of parsley');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('handful');
      expect(p.normalized_name).toBe('parsley');
    });

    test('Packet 34 — a splash of milk → 1 splash', () => {
      const p = parseIngredientPhrase('a splash of milk');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('splash');
      expect(p.normalized_name).toBe('milk');
      expect(p.quantity_source).toBe('count_inferred');
      expect(p.parse_confidence).toBe('medium');
    });

    test('Packet 34 — a splash of olive oil', () => {
      const p = parseIngredientPhrase('a splash of olive oil');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('splash');
      expect(p.normalized_name).toBe('olive oil');
    });
  });

  describe('Packet 34 — range origin preserved in prep note', () => {
    test('"to" range surfaces original range in prep', () => {
      const p = parseIngredientPhrase('1/2 to 3/4 cup milk');
      // Packet 34 rounds to 2 decimals so the UI numeric input doesn't
      // surface synthetic precision like 0.625.
      expect(p.quantity_value).toBe(0.63);
      expect(p.quantity_source).toBe('range_midpoint');
      expect(p.preparation_note ?? '').toContain('1/2 to 3/4');
    });

    test('hyphen range surfaces original token in prep', () => {
      const p = parseIngredientPhrase('8-10 tomatoes');
      expect(p.quantity_value).toBe(9);
      expect(p.quantity_source).toBe('range_midpoint');
      expect(p.preparation_note ?? '').toContain('8-10');
      expect(p.normalized_name).toBe('tomatoes');
    });

    test('mixed fraction "to" range surfaces original range', () => {
      const p = parseIngredientPhrase('1 1/2 to 2 cups chicken stock');
      expect(p.quantity_value).toBeCloseTo(1.75);
      expect(p.preparation_note ?? '').toContain('1 1/2 to 2');
    });
  });

  describe('regressions — pre-Packet-33 behavior preserved', () => {
    test('1 (14 oz) can tomatoes still parses', () => {
      const p = parseIngredientPhrase('1 (14 oz) can tomatoes');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('can');
      expect(p.normalized_name).toBe('tomatoes');
    });

    test('300g chicken breasts → 300 g', () => {
      const p = parseIngredientPhrase('300g chicken breasts');
      expect(p.quantity_value).toBe(300);
      expect(p.quantity_unit).toBe('g');
      expect(p.normalized_name).toBe('chicken breasts');
    });

    test('1 large egg → count_inferred whole, size demoted', () => {
      const p = parseIngredientPhrase('1 large egg');
      expect(p.quantity_value).toBe(1);
      expect(p.quantity_unit).toBe('whole');
      expect(p.normalized_name).toBe('egg');
      expect(p.preparation_note).toContain('large');
    });

    test('1½ cups flour → 1.5 cups', () => {
      const p = parseIngredientPhrase('1½ cups flour');
      expect(p.quantity_value).toBeCloseTo(1.5);
      expect(p.quantity_unit).toBe('cups');
      expect(p.normalized_name).toBe('flour');
    });

    test('Juice of 1/2 lemon → 0.5 whole lemon', () => {
      const p = parseIngredientPhrase('Juice of 1/2 lemon');
      expect(p.quantity_value).toBeCloseTo(0.5);
      expect(p.quantity_unit).toBe('whole');
      expect(p.normalized_name).toBe('lemon');
    });
  });
});
