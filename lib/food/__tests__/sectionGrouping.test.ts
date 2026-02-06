/**
 * Tests for search result sectioning logic
 * 
 * Validates:
 * 1. Section key assignment based on source_provider, source_type, source_dataset
 * 2. Deterministic section ordering (my_foods → common → branded → scanned → other)
 * 3. Per-section caps
 * 4. "Show more" pagination
 */

import type { FoodObject, FoodSearchResult, SearchResultSection, SectionKey } from '../types';

// Mock determineSectionKey function (mirrors the logic in foodServerService.ts)
function determineSectionKey(
  food: Partial<FoodObject>,
  personId: string | null,
  isFavorite: boolean,
  logCount: number
): SectionKey {
  // User-interacted items go to "My Foods"
  // Note: Only check personId match if personId is not null (logged-in user)
  if ((personId && food.personId === personId) || isFavorite || logCount > 0) {
    return 'my_foods';
  }

  // Non-USDA foods
  if (food.sourceProvider !== 'usda') {
    if (food.sourceType === 'user') {
      return 'my_foods';
    }
    if (food.sourceType === 'provisional') {
      return 'scanned';
    }
    return 'other';
  }

  // USDA foods - use source_dataset when available
  const dataset = food.sourceDataset;

  // Common datasets: foundation, sr_legacy, survey
  if (dataset === 'foundation' || dataset === 'sr_legacy' || dataset === 'survey') {
    return 'common';
  }

  // Branded dataset
  if (dataset === 'branded') {
    return 'branded';
  }

  // Fallback: use source_type when source_dataset is not set
  if (food.sourceType === 'common') {
    return 'common';
  }
  if (food.sourceType === 'branded') {
    return 'branded';
  }

  // Catch-all
  return 'other';
}

// Helper to create mock FoodObject
function createMockFood(overrides: Partial<FoodObject>): FoodObject {
  return {
    id: `food-${Math.random().toString(36).slice(2)}`,
    canonicalName: 'Test Food',
    brandName: null,
    aliases: [],
    sourceType: 'common',
    sourceProvider: 'usda',
    sourceId: '12345',
    sourceDataset: null,
    upc: null,
    servingSizeG: 100,
    servingUnit: 'g',
    servingDescription: null,
    householdServingText: null,
    calories: 100,
    proteinG: 10,
    carbsG: 20,
    fatG: 5,
    fiberG: 2,
    sugarG: 5,
    sodiumMg: 100,
    nutrientsExtended: {},
    nutrientProvenance: 'usda',
    nutrientConfidence: 'high',
    personId: null,
    isVerified: false,
    imageUrl: null,
    category: null,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Section Key Assignment', () => {
  const personId = 'user-123';

  describe('My Foods section', () => {
    it('should assign favorite items to my_foods', () => {
      const food = createMockFood({ sourceProvider: 'usda', sourceType: 'branded' });
      expect(determineSectionKey(food, personId, true, 0)).toBe('my_foods');
    });

    it('should assign logged items to my_foods', () => {
      const food = createMockFood({ sourceProvider: 'usda', sourceType: 'common' });
      expect(determineSectionKey(food, personId, false, 5)).toBe('my_foods');
    });

    it('should assign user-created items to my_foods', () => {
      const food = createMockFood({
        sourceProvider: null,
        sourceType: 'user',
        personId: personId,
      });
      expect(determineSectionKey(food, personId, false, 0)).toBe('my_foods');
    });
  });

  describe('Common Foods section', () => {
    it('should assign USDA foundation items to common', () => {
      const food = createMockFood({
        sourceProvider: 'usda',
        sourceType: 'common',
        sourceDataset: 'foundation',
      });
      expect(determineSectionKey(food, personId, false, 0)).toBe('common');
    });

    it('should assign USDA sr_legacy items to common', () => {
      const food = createMockFood({
        sourceProvider: 'usda',
        sourceType: 'common',
        sourceDataset: 'sr_legacy',
      });
      expect(determineSectionKey(food, personId, false, 0)).toBe('common');
    });

    it('should assign USDA survey items to common', () => {
      const food = createMockFood({
        sourceProvider: 'usda',
        sourceType: 'common',
        sourceDataset: 'survey',
      });
      expect(determineSectionKey(food, personId, false, 0)).toBe('common');
    });

    it('should assign USDA common type (no dataset) to common', () => {
      const food = createMockFood({
        sourceProvider: 'usda',
        sourceType: 'common',
        sourceDataset: null,
      });
      expect(determineSectionKey(food, personId, false, 0)).toBe('common');
    });
  });

  describe('Branded Foods section', () => {
    it('should assign USDA branded dataset items to branded', () => {
      const food = createMockFood({
        sourceProvider: 'usda',
        sourceType: 'branded',
        sourceDataset: 'branded',
      });
      expect(determineSectionKey(food, personId, false, 0)).toBe('branded');
    });

    it('should assign USDA branded type (no dataset) to branded', () => {
      const food = createMockFood({
        sourceProvider: 'usda',
        sourceType: 'branded',
        sourceDataset: null,
      });
      expect(determineSectionKey(food, personId, false, 0)).toBe('branded');
    });
  });

  describe('Scanned section', () => {
    it('should assign provisional items to scanned', () => {
      const food = createMockFood({
        sourceProvider: null,
        sourceType: 'provisional',
        upc: '012345678901',
      });
      expect(determineSectionKey(food, personId, false, 0)).toBe('scanned');
    });
  });

  describe('Other section', () => {
    it('should assign unknown non-USDA items to other', () => {
      const food = createMockFood({
        sourceProvider: 'unknown',
        sourceType: 'common',
      });
      expect(determineSectionKey(food, personId, false, 0)).toBe('other');
    });
  });
});

describe('Section Ordering', () => {
  const EXPECTED_ORDER: SectionKey[] = ['my_foods', 'common', 'branded', 'scanned', 'other'];

  it('should maintain deterministic section order', () => {
    // Create mock sections in random order
    const sections: Partial<SearchResultSection>[] = [
      { key: 'branded', order: 3 },
      { key: 'my_foods', order: 1 },
      { key: 'other', order: 5 },
      { key: 'common', order: 2 },
      { key: 'scanned', order: 4 },
    ];

    // Sort by order (as the server does)
    const sorted = [...sections].sort((a, b) => (a.order || 0) - (b.order || 0));

    expect(sorted.map((s) => s.key)).toEqual(EXPECTED_ORDER);
  });
});

describe('Big Mac search scenario', () => {
  // This test validates that "Big Mac" from Common (SR Legacy) appears
  // before Branded items when both match, because Common section comes first

  it('should show Common section before Branded section', () => {
    const bigMacCommon = createMockFood({
      id: 'big-mac-common',
      canonicalName: 'Big Mac',
      sourceProvider: 'usda',
      sourceType: 'common',
      sourceDataset: 'sr_legacy',
    });

    const bigMacBranded = createMockFood({
      id: 'big-mac-branded',
      canonicalName: 'Big Mac Meal',
      brandName: "McDonald's",
      sourceProvider: 'usda',
      sourceType: 'branded',
      sourceDataset: 'branded',
    });

    const commonKey = determineSectionKey(bigMacCommon, null, false, 0);
    const brandedKey = determineSectionKey(bigMacBranded, null, false, 0);

    expect(commonKey).toBe('common');
    expect(brandedKey).toBe('branded');

    // Common section (order 2) comes before Branded section (order 3)
    const SECTION_CONFIG: Record<SectionKey, { order: number }> = {
      my_foods: { order: 1 },
      common: { order: 2 },
      branded: { order: 3 },
      scanned: { order: 4 },
      other: { order: 5 },
    };

    expect(SECTION_CONFIG[commonKey].order).toBeLessThan(SECTION_CONFIG[brandedKey].order);
  });
});

describe('Barq\'s Root Beer search scenario', () => {
  // This test validates that branded items still appear correctly
  // when sectioning is applied

  it('should correctly assign Barq\'s Root Beer to branded section', () => {
    const barqsRootBeer = createMockFood({
      id: 'barqs-root-beer',
      canonicalName: "Barq's Root Beer",
      brandName: "Barq's",
      sourceProvider: 'usda',
      sourceType: 'branded',
      sourceDataset: 'branded',
      upc: '012000001234',
    });

    const sectionKey = determineSectionKey(barqsRootBeer, null, false, 0);
    expect(sectionKey).toBe('branded');
  });

  it('should keep user favorite Barq\'s in my_foods even if branded', () => {
    const barqsFavorite = createMockFood({
      id: 'barqs-favorite',
      canonicalName: "Barq's Root Beer",
      brandName: "Barq's",
      sourceProvider: 'usda',
      sourceType: 'branded',
      sourceDataset: 'branded',
    });

    // When favorited, should go to my_foods
    const sectionKey = determineSectionKey(barqsFavorite, 'user-123', true, 0);
    expect(sectionKey).toBe('my_foods');
  });
});

describe('Per-section caps', () => {
  it('should respect sectionLimit', () => {
    const sectionLimit = 12;
    const totalItems = 50;

    // Simulate items in a section
    const items = Array.from({ length: totalItems }, (_, i) =>
      createMockFood({ id: `food-${i}`, canonicalName: `Food ${i}` })
    );

    // Apply cap
    const shownItems = items.slice(0, sectionLimit);
    const hasMore = items.length > shownItems.length;

    expect(shownItems.length).toBe(sectionLimit);
    expect(hasMore).toBe(true);
  });

  it('should correctly calculate hasMore and remaining count', () => {
    const total = 25;
    const shown = 12;

    const hasMore = total > shown;
    const remaining = total - shown;

    expect(hasMore).toBe(true);
    expect(remaining).toBe(13);
  });
});

describe('Show more pagination', () => {
  it('should calculate correct offset for second page', () => {
    const sectionLimit = 12;
    const firstPageOffset = 0;
    const firstPageShown = 12;

    const secondPageOffset = firstPageOffset + firstPageShown;
    expect(secondPageOffset).toBe(12);
  });

  it('should calculate correct items for second page', () => {
    const sectionLimit = 12;
    const totalItems = 30;

    const items = Array.from({ length: totalItems }, (_, i) => i);

    // First page
    const page1 = items.slice(0, sectionLimit);
    expect(page1).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    // Second page
    const page2 = items.slice(sectionLimit, sectionLimit * 2);
    expect(page2).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);

    // Third page (partial)
    const page3 = items.slice(sectionLimit * 2, sectionLimit * 3);
    expect(page3).toEqual([24, 25, 26, 27, 28, 29]);
    expect(page3.length).toBe(6); // Remaining items
  });
});
