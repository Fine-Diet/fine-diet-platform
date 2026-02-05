/**
 * Tests for Natural Case apostrophe/contraction fixing
 */

import { fixApostropheCasing } from '../naturalCase';

describe('fixApostropheCasing', () => {
  describe('Possessive apostrophe-s', () => {
    it('should fix possessive S after brand name (Wendy\'s)', () => {
      // After title-casing, WENDY'S becomes Wendy'S
      expect(fixApostropheCasing("Wendy'S")).toBe("Wendy's");
    });

    it('should fix possessive S after brand name (McDonald\'s)', () => {
      expect(fixApostropheCasing("McDonald'S")).toBe("McDonald's");
    });

    it('should fix full menu item with possessive', () => {
      // Simulates: WENDY'S, DOUBLE STACK → Wendy'S, Double Stack → Wendy's, Double Stack
      expect(fixApostropheCasing("Wendy'S, Double Stack")).toBe("Wendy's, Double Stack");
    });

    it('should fix multiple possessives in same string', () => {
      expect(fixApostropheCasing("Wendy'S And McDonald'S")).toBe("Wendy's And McDonald's");
    });
  });

  describe('Common contractions', () => {
    it('should fix can\'t contraction', () => {
      expect(fixApostropheCasing("Can'T")).toBe("Can't");
    });

    it('should fix we\'re contraction', () => {
      expect(fixApostropheCasing("We'Re")).toBe("We're");
    });

    it('should fix I\'ve contraction', () => {
      expect(fixApostropheCasing("I'Ve")).toBe("I've");
    });

    it('should fix I\'ll contraction', () => {
      expect(fixApostropheCasing("I'Ll")).toBe("I'll");
    });

    it('should fix I\'d contraction', () => {
      expect(fixApostropheCasing("I'D")).toBe("I'd");
    });

    it('should fix I\'m contraction', () => {
      expect(fixApostropheCasing("I'M")).toBe("I'm");
    });
  });

  describe('Irish/name-style prefixes (should NOT change)', () => {
    it('should preserve O\'Reilly (capital R after O\')', () => {
      // After title-casing, O'REILLY becomes O'Reilly - should stay O'Reilly
      expect(fixApostropheCasing("O'Reilly")).toBe("O'Reilly");
    });

    it('should preserve full name O\'Reilly Auto Parts', () => {
      expect(fixApostropheCasing("O'Reilly Auto Parts")).toBe("O'Reilly Auto Parts");
    });

    it('should preserve D\'Angelo', () => {
      expect(fixApostropheCasing("D'Angelo")).toBe("D'Angelo");
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      expect(fixApostropheCasing('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(fixApostropheCasing(null as any)).toBe(null);
      expect(fixApostropheCasing(undefined as any)).toBe(undefined);
    });

    it('should handle string without apostrophes', () => {
      expect(fixApostropheCasing('Big Mac')).toBe('Big Mac');
    });

    it('should handle multiple issues in one string', () => {
      // Wendy'S + contraction
      expect(fixApostropheCasing("Wendy'S, I'M Lovin'T It")).toBe("Wendy's, I'm Lovin't It");
    });
  });

  describe('Integration: Full title-case simulation', () => {
    // These simulate what happens when USDA all-caps names go through
    // title-casing (toLowerCase + capitalize word boundaries) then our fix

    function simulateTitleCase(input: string): string {
      // This is what normalizeName does before our fix
      let name = input.trim().replace(/\s+/g, ' ');
      name = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      name = name.replace(/,\s*/g, ', ');
      return fixApostropheCasing(name);
    }

    it('should handle WENDY\'S, DOUBLE STACK', () => {
      expect(simulateTitleCase("WENDY'S, DOUBLE STACK")).toBe("Wendy's, Double Stack");
    });

    it('should handle MCDONALD\'S BIG MAC', () => {
      // Note: The title-casing doesn't specially handle "Mc" prefixes,
      // so "MCDONALD'S" → "Mcdonald's" (not "McDonald's")
      // The apostrophe fix is working correctly: 'S → 's
      expect(simulateTitleCase("MCDONALD'S BIG MAC")).toBe("Mcdonald's Big Mac");
    });

    it('should handle O\'REILLY AUTO PARTS', () => {
      expect(simulateTitleCase("O'REILLY AUTO PARTS")).toBe("O'Reilly Auto Parts");
    });

    it('should handle regular food without apostrophes (no regression)', () => {
      expect(simulateTitleCase("APPLE, RAW")).toBe("Apple, Raw");
    });

    it('should handle BARQ\'S ROOT BEER', () => {
      expect(simulateTitleCase("BARQ'S ROOT BEER")).toBe("Barq's Root Beer");
    });
  });
});
