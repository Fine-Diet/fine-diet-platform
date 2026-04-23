/**
 * Plans Phase 33 — `extractServings` regression suite.
 *
 * Exercises the prefix form ("Serves 4", "Makes 12 cookies",
 * "Yield: 2 loaves", "Portions: 6"), range collapse ("Serves 4-6",
 * "Serves 4 to 6"), the "For N people" guardrail, and the
 * leading-number fallback ("4 servings", "6 portions"). The cases
 * here are the smallest change surface that gives transcript-
 * recovered drafts better yield recovery without over-matching
 * ordinary cookbook prose.
 */

import { extractServings } from '../recipeImporter';

describe('extractServings — Packet 33 servings/yield patterns', () => {
  describe('prefix forms', () => {
    test('Serves 4', () => {
      expect(extractServings('Serves 4')).toBe(4);
    });
    test('serves: 4', () => {
      expect(extractServings('serves: 4')).toBe(4);
    });
    test('Servings: 6', () => {
      expect(extractServings('Servings: 6')).toBe(6);
    });
    test('Makes 12 cookies', () => {
      expect(extractServings('Makes 12 cookies')).toBe(12);
    });
    test('Yield: 2 loaves', () => {
      expect(extractServings('Yield: 2 loaves')).toBe(2);
    });
    test('Yields 8', () => {
      expect(extractServings('Yields 8')).toBe(8);
    });
    test('Portions: 6', () => {
      expect(extractServings('Portions: 6')).toBe(6);
    });
  });

  describe('range collapse', () => {
    test('Serves 4-6 → midpoint 5', () => {
      expect(extractServings('Serves 4-6')).toBe(5);
    });
    test('Serves 4 to 6 → midpoint 5', () => {
      expect(extractServings('Serves 4 to 6')).toBe(5);
    });
    test('Serves 4–6 (en-dash) → midpoint 5', () => {
      expect(extractServings('Serves 4–6')).toBe(5);
    });
    test('Makes 10-12 → midpoint 11', () => {
      expect(extractServings('Makes 10-12')).toBe(11);
    });
  });

  describe('"for N people" guardrail', () => {
    test('For 4 people → 4', () => {
      expect(extractServings('For 4 people')).toBe(4);
    });
    test('for 2 persons → 2', () => {
      expect(extractServings('for 2 persons')).toBe(2);
    });
    test('for 6 guests → 6', () => {
      expect(extractServings('for 6 guests')).toBe(6);
    });
    test('for 4 people, double for a crowd → 4', () => {
      expect(extractServings('for 4 people, double for a crowd')).toBe(4);
    });
    test('cook for 4 hours → null (no person noun)', () => {
      expect(extractServings('cook for 4 hours')).toBeNull();
    });
    test('let rest for 10 minutes → null', () => {
      expect(extractServings('let rest for 10 minutes')).toBeNull();
    });
  });

  describe('leading-number fallback', () => {
    test('4 servings', () => {
      expect(extractServings('4 servings')).toBe(4);
    });
    test('6 portions', () => {
      expect(extractServings('6 portions')).toBe(6);
    });
    test('1 serving', () => {
      expect(extractServings('1 serving')).toBe(1);
    });
  });

  describe('non-servings lines should not match', () => {
    test('4 eggs (ingredient row) → null', () => {
      expect(extractServings('4 eggs')).toBeNull();
    });
    test('2 cups flour → null', () => {
      expect(extractServings('2 cups flour')).toBeNull();
    });
    test('Preheat oven to 350 → null', () => {
      expect(extractServings('Preheat oven to 350')).toBeNull();
    });
    test('cook for 30 minutes → null', () => {
      expect(extractServings('cook for 30 minutes')).toBeNull();
    });
  });

  describe('sanity bounds', () => {
    test('reject 0 servings', () => {
      expect(extractServings('Serves 0')).toBeNull();
    });
    test('reject > 100 servings (obvious parse error)', () => {
      expect(extractServings('Makes 9999 cookies')).toBeNull();
    });
  });

  describe('Packet 34 — greediness fix and positive QA cases', () => {
    test('cook for 4 hours. Serves 4. → 4 (regression: for-hours must not swallow serves)', () => {
      expect(extractServings('cook for 4 hours. Serves 4.')).toBe(4);
    });

    test('Bake for 45 minutes. Makes 12 cookies. → 12', () => {
      expect(extractServings('Bake for 45 minutes. Makes 12 cookies.')).toBe(12);
    });

    test('Rest for 10 minutes before serving 4 → 4 (leading "for N minutes" ignored, trailing serves N wins)', () => {
      // The `for 10 minutes` arm fails the person-noun guard; the
      // trailing `serving 4` form matches `serving` prefix.
      expect(extractServings('Rest for 10 minutes before serving 4')).toBe(4);
    });

    test('Makes 2 bowls → 2 (QA positive case)', () => {
      expect(extractServings('Makes 2 bowls')).toBe(2);
    });

    test('This recipe makes 2 bowls → 2', () => {
      expect(extractServings('This recipe makes 2 bowls')).toBe(2);
    });

    test('Serves 4 generous portions → 4', () => {
      expect(extractServings('Serves 4 generous portions')).toBe(4);
    });

    test('cook for 4 hours (no trailing serves) → null', () => {
      expect(extractServings('cook for 4 hours')).toBeNull();
    });

    test('idempotent across multiple invocations (global regex lastIndex reset)', () => {
      // With SERVINGS_PREFIX_RE as /g, we must reset lastIndex on each
      // call or the second call returns the wrong value.
      expect(extractServings('Serves 4')).toBe(4);
      expect(extractServings('Serves 4')).toBe(4);
      expect(extractServings('Serves 4')).toBe(4);
    });
  });
});
