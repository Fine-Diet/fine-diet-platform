/**
 * Tests for Natural Case utilities
 * - fixApostropheCasing: apostrophe/contraction casing
 * - sanitizeDisplayName: USDA brand-owner identifier cleanup
 */

import { fixApostropheCasing, sanitizeDisplayName } from '../naturalCase';

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

describe('sanitizeDisplayName', () => {
  describe('USDA brand-owner identifier stripping', () => {
    it('should strip long numeric suffix from Coca-Cola example', () => {
      const input = "Barq's Root Beer Bottle, 24 fl oz (The Coca-Cola Company-0049000000016)";
      const expected = "Barq's Root Beer Bottle, 24 fl oz (The Coca-Cola Company)";
      expect(sanitizeDisplayName(input)).toBe(expected);
    });

    it('should strip 10-digit identifier', () => {
      const input = "Product Name (Brand-1234567890)";
      const expected = "Product Name (Brand)";
      expect(sanitizeDisplayName(input)).toBe(expected);
    });

    it('should strip 16-digit identifier (GTIN format)', () => {
      const input = "Chips (Frito-Lay-0012345678901234)";
      const expected = "Chips (Frito-Lay)";
      expect(sanitizeDisplayName(input)).toBe(expected);
    });

    it('should handle identifier at 8-digit threshold', () => {
      const input = "Product (Brand-12345678)";
      const expected = "Product (Brand)";
      expect(sanitizeDisplayName(input)).toBe(expected);
    });
  });

  describe('Should NOT strip short identifiers', () => {
    it('should NOT strip 2-digit suffix like (Brand-2)', () => {
      const input = "Product (Brand-2)";
      expect(sanitizeDisplayName(input)).toBe(input);
    });

    it('should NOT strip 7-digit suffix (below threshold)', () => {
      const input = "Product (Foo-1234567)";
      expect(sanitizeDisplayName(input)).toBe(input);
    });

    it('should NOT strip 5-digit suffix', () => {
      const input = "Product (Company-12345)";
      expect(sanitizeDisplayName(input)).toBe(input);
    });
  });

  describe('Should NOT change strings without matching pattern', () => {
    it('should NOT change string without trailing parentheses', () => {
      const input = "Big Mac";
      expect(sanitizeDisplayName(input)).toBe(input);
    });

    it('should NOT change string with parentheses in middle', () => {
      const input = "Big Mac (Large) Meal";
      expect(sanitizeDisplayName(input)).toBe(input);
    });

    it('should NOT change string with parentheses but no numeric suffix', () => {
      const input = "Product (Brand Name)";
      expect(sanitizeDisplayName(input)).toBe(input);
    });

    it('should NOT change string with hyphen but no digits', () => {
      const input = "Product (Brand-Name)";
      expect(sanitizeDisplayName(input)).toBe(input);
    });

    it('should NOT change string where hyphen-digits is not at end of parens', () => {
      const input = "Product (Brand-12345678-Variant)";
      expect(sanitizeDisplayName(input)).toBe(input);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      expect(sanitizeDisplayName('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeDisplayName(null as any)).toBe(null);
      expect(sanitizeDisplayName(undefined as any)).toBe(undefined);
    });

    it('should handle empty parentheses result (remove parens entirely)', () => {
      // If the entire paren content is just the identifier
      const input = "Product (-12345678901234)";
      expect(sanitizeDisplayName(input)).toBe("Product");
    });

    it('should trim trailing whitespace', () => {
      const input = "Product (Brand-12345678)  ";
      expect(sanitizeDisplayName(input)).toBe("Product (Brand)");
    });

    it('should handle multiple parenthetical groups (only affect last)', () => {
      const input = "Product (Size) (Brand-0049000000016)";
      const expected = "Product (Size) (Brand)";
      expect(sanitizeDisplayName(input)).toBe(expected);
    });

    it('should preserve internal content with spaces', () => {
      const input = "Barq's Root Beer (The Coca-Cola Company USA-0049000000016)";
      const expected = "Barq's Root Beer (The Coca-Cola Company USA)";
      expect(sanitizeDisplayName(input)).toBe(expected);
    });
  });

  describe('Real-world USDA examples', () => {
    it('should clean PepsiCo identifier', () => {
      const input = "Mountain Dew, 12 fl oz (PepsiCo, Inc.-0012000001512)";
      const expected = "Mountain Dew, 12 fl oz (PepsiCo, Inc.)";
      expect(sanitizeDisplayName(input)).toBe(expected);
    });

    it('should clean Kraft identifier', () => {
      const input = "Kraft Macaroni & Cheese (Kraft Heinz Company-0021000658831)";
      const expected = "Kraft Macaroni & Cheese (Kraft Heinz Company)";
      expect(sanitizeDisplayName(input)).toBe(expected);
    });

    it('should handle identifier with leading zeros', () => {
      const input = "Sprite (The Coca-Cola Company-0000000000123)";
      const expected = "Sprite (The Coca-Cola Company)";
      expect(sanitizeDisplayName(input)).toBe(expected);
    });
  });

  describe('Logged item display (stored payload.name)', () => {
    // These tests simulate sanitizing stored entry names that were saved
    // before sanitizeDisplayName was wired into the save path.

    it('should sanitize logged item with full USDA brand-owner string', () => {
      // This is what gets stored in journal_entries.payload.name
      const storedName = "Barq's Red Creme Soda Bottle, 12 fl oz (The Coca-Cola Company-0049000000016)";
      const displayed = sanitizeDisplayName(storedName);
      expect(displayed).toBe("Barq's Red Creme Soda Bottle, 12 fl oz (The Coca-Cola Company)");
      expect(displayed).not.toContain('0049000000016');
    });

    it('should be idempotent (already clean name stays clean)', () => {
      const alreadyClean = "Barq's Root Beer (The Coca-Cola Company)";
      expect(sanitizeDisplayName(alreadyClean)).toBe(alreadyClean);
    });

    it('should handle Untitled fallback gracefully', () => {
      expect(sanitizeDisplayName('Untitled')).toBe('Untitled');
    });
  });
});
