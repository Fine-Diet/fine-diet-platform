/**
 * Plans Phase 34 — End-to-end servings/yield recovery through the
 * full `runRecipeImport` pipeline.
 *
 * Packet 33 introduced the servings regex but the line was still
 * being double-consumed as a title or ingredient row when the
 * servings phrase appeared dominant on its own line, producing
 * ghost rows like `4 whole servings` in the draft. This suite
 * locks in the Packet 34 fix: dominant yield lines flow into the
 * `servings` field *and* are skipped from title / description /
 * ingredient handling.
 *
 * Also exercises `isDominantServingsLine` directly so regex changes
 * don't silently regress the guard surface.
 */

import {
  runRecipeImport,
  isDominantServingsLine,
} from '../recipeImporter';

describe('isDominantServingsLine — Packet 34 guard surface', () => {
  test('Serves 4', () => {
    expect(isDominantServingsLine('Serves 4')).toBe(true);
  });
  test('Servings: 6', () => {
    expect(isDominantServingsLine('Servings: 6')).toBe(true);
  });
  test('Makes 2 bowls', () => {
    expect(isDominantServingsLine('Makes 2 bowls')).toBe(true);
  });
  test('Yield: 2 loaves', () => {
    expect(isDominantServingsLine('Yield: 2 loaves')).toBe(true);
  });
  test('For 4 people', () => {
    expect(isDominantServingsLine('For 4 people')).toBe(true);
  });
  test('Serves 4-6', () => {
    expect(isDominantServingsLine('Serves 4-6')).toBe(true);
  });
  test('4 servings', () => {
    expect(isDominantServingsLine('4 servings')).toBe(true);
  });
  test('6 portions', () => {
    expect(isDominantServingsLine('6 portions')).toBe(true);
  });
  test('Serves 4.', () => {
    expect(isDominantServingsLine('Serves 4.')).toBe(true);
  });
  // Non-dominant — should return false (line keeps flowing).
  test('1 cup milk (serves 4) is not dominant', () => {
    expect(isDominantServingsLine('1 cup milk (serves 4)')).toBe(false);
  });
  test('My Recipe - Serves 4 is not dominant', () => {
    expect(isDominantServingsLine('My Recipe - Serves 4')).toBe(false);
  });
  test('cook for 4 hours is not a servings line', () => {
    expect(isDominantServingsLine('cook for 4 hours')).toBe(false);
  });
  test('4 eggs is not a servings line', () => {
    expect(isDominantServingsLine('4 eggs')).toBe(false);
  });
});

describe('runRecipeImport — Packet 34 end-to-end servings recovery', () => {
  test('"Serves 4" as leading line is captured AND does not become the title', () => {
    const out = runRecipeImport({
      text: 'Serves 4\nMy Recipe\n1 cup rice\n1 tsp salt',
    });
    expect(out.parsed_payload_json.servings).toBe(4);
    expect(out.parsed_payload_json.title).toBe('My Recipe');
    const rawTexts = out.parsed_payload_json.ingredients.map(
      (i) => i.raw_text,
    );
    expect(rawTexts).not.toContain('Serves 4');
  });

  test('"4 servings" between title and ingredients does not become a ghost ingredient', () => {
    const out = runRecipeImport({
      text: 'My Recipe\n4 servings\n1 cup rice\n1 tsp salt',
    });
    expect(out.parsed_payload_json.servings).toBe(4);
    expect(out.parsed_payload_json.title).toBe('My Recipe');
    const rawTexts = out.parsed_payload_json.ingredients.map(
      (i) => i.raw_text,
    );
    expect(rawTexts).not.toContain('4 servings');
    expect(rawTexts).toEqual(
      expect.arrayContaining(['1 cup rice', '1 tsp salt']),
    );
  });

  test('"Makes 2 bowls" is captured and the line is dropped from preamble', () => {
    const out = runRecipeImport({
      text: 'Smoothie Bowl\nMakes 2 bowls\nIngredients:\n1 banana\n1 cup yogurt',
    });
    expect(out.parsed_payload_json.servings).toBe(2);
    expect(out.parsed_payload_json.title).toBe('Smoothie Bowl');
    const desc = out.parsed_payload_json.description ?? '';
    expect(desc).not.toContain('Makes 2 bowls');
  });

  test('"Yield: 2 loaves" at the end of a paste is captured', () => {
    const out = runRecipeImport({
      text: 'Sourdough\nIngredients:\n500 g flour\n10 g salt\nYield: 2 loaves',
    });
    expect(out.parsed_payload_json.servings).toBe(2);
    const rawTexts = out.parsed_payload_json.ingredients.map(
      (i) => i.raw_text,
    );
    expect(rawTexts).not.toContain('Yield: 2 loaves');
  });

  test('"For 4 people" guards prose like "cook for 4 hours"', () => {
    const out = runRecipeImport({
      text: 'My Recipe\nFor 4 people\nIngredients:\n1 cup rice\nCook for 4 hours',
    });
    expect(out.parsed_payload_json.servings).toBe(4);
  });

  test('mid-line "(serves 4)" captures servings but keeps the ingredient row', () => {
    const out = runRecipeImport({
      text: 'Quick Rice\nIngredients:\n1 cup rice (serves 4)\n1 tsp salt',
    });
    expect(out.parsed_payload_json.servings).toBe(4);
    const rawTexts = out.parsed_payload_json.ingredients.map(
      (i) => i.raw_text,
    );
    expect(rawTexts).toEqual(
      expect.arrayContaining(['1 cup rice (serves 4)', '1 tsp salt']),
    );
  });

  test('no servings phrase → servings stays null', () => {
    const out = runRecipeImport({
      text: 'Quick Rice\nIngredients:\n1 cup rice\n1 tsp salt',
    });
    expect(out.parsed_payload_json.servings).toBeNull();
  });
});
