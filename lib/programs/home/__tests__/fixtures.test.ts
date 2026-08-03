import {
  buildBaselineHeroSlides,
  buildCategoryViewModel,
  filterCatalogueItems,
} from '../adapters';
import {
  getProgramsHomeFixture,
  parseProgramsHomeFixtureId,
  PROGRAMS_HOME_FIXTURES,
} from '../fixtures';
import { PROGRAMS_HOME_CATEGORIES } from '../seeds';

describe('Programs Home fixtures', () => {
  test('parseProgramsHomeFixtureId accepts known ids only', () => {
    expect(parseProgramsHomeFixtureId('default')).toBe('default');
    expect(parseProgramsHomeFixtureId('completed_recommendation')).toBe(
      'completed_recommendation',
    );
    expect(parseProgramsHomeFixtureId('nope')).toBeNull();
    expect(parseProgramsHomeFixtureId(undefined)).toBeNull();
  });

  test('all fixture catalog entries are keyed and self-identified', () => {
    for (const [id, model] of Object.entries(PROGRAMS_HOME_FIXTURES)) {
      expect(model.fixtureId).toBe(id);
      expect(model.hero.slides.length).toBeGreaterThan(0);
    }
  });

  test('completed recommendation fixture places recommendation first', () => {
    const model = getProgramsHomeFixture('completed_recommendation');
    expect(model.hero.slides[0]?.id).toBe('fixture-recommendation');
    expect(model.hero.slides).toHaveLength(2);
  });

  test('recommendation pending fixture is honest and routes to Baseline', () => {
    const model = getProgramsHomeFixture('recommendation_pending');
    expect(model.hero.slides[0]?.title).toMatch(/being prepared/i);
    expect(model.hero.slides[0]?.cta.href).toBe('/app/programs/baseline');
  });

  test('multi_slide exposes carousel controls via multiple slides', () => {
    const model = getProgramsHomeFixture('multi_slide');
    expect(model.hero.slides.length).toBeGreaterThan(1);
  });
});

describe('Programs Home adapters', () => {
  test('categories include Advanced and remain extensible', () => {
    expect(PROGRAMS_HOME_CATEGORIES.map((c) => c.key)).toEqual([
      'nutrition',
      'lifestyle',
      'advanced',
    ]);
    expect(PROGRAMS_HOME_CATEGORIES.find((c) => c.label === 'Specialty')).toBeUndefined();
  });

  test('active Baseline slide uses Continue Baseline', () => {
    const slides = buildBaselineHeroSlides({
      cardState: 'active',
      summary: { current_day: 5 } as never,
    });
    expect(slides[0]?.cta.label).toBe('Continue Baseline');
  });

  test('search filters title and description client-side', () => {
    const model = buildCategoryViewModel({
      selectedCategoryKey: 'nutrition',
      searchQuery: 'balanced',
    });
    expect(model.listStatus).toBe('results');
    expect(model.visibleItems.map((i) => i.slug)).toEqual(['balanced']);
  });

  test('empty search restores category list', () => {
    const { listStatus, visibleItems } = filterCatalogueItems({
      items: buildCategoryViewModel().items,
      categoryKey: 'nutrition',
      searchQuery: '',
    });
    expect(listStatus).toBe('idle');
    expect(visibleItems).toHaveLength(4);
  });

  test('lifestyle and advanced report coming soon when empty', () => {
    expect(buildCategoryViewModel({ selectedCategoryKey: 'lifestyle' }).listStatus).toBe(
      'coming_soon',
    );
    expect(buildCategoryViewModel({ selectedCategoryKey: 'advanced' }).listStatus).toBe(
      'coming_soon',
    );
  });
});
