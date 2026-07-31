/**
 * Deterministic Programs Home presentation fixtures.
 * Allowed only outside production. Persist no fake records.
 */

import {
  buildBaselineHeroSlides,
  buildCategoryViewModel,
  buildFeaturedViewModel,
} from './adapters';
import {
  PROGRAMS_HOME_BASELINE_DEFAULT_COPY,
  PROGRAMS_HOME_CATALOGUE_SEEDS,
  PROGRAMS_HOME_FEATURED_SEEDS,
} from './seeds';
import type {
  ProgramsHomeFixtureId,
  ProgramsHomeHeroSlide,
  ProgramsHomeViewModel,
} from './types';

export const PROGRAMS_HOME_FIXTURE_IDS: ProgramsHomeFixtureId[] = [
  'default',
  'no_entitlement',
  'start_ready',
  'pre_start',
  'active',
  'paused',
  'completed_recommendation',
  'recommendation_pending',
  'multi_slide',
  'runtime_error',
  'featured_empty',
  'category_lifestyle',
  'category_advanced',
  'search_results',
  'search_empty',
];

export function programsHomeFixturesAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function parseProgramsHomeFixtureId(
  value: unknown,
): ProgramsHomeFixtureId | null {
  if (typeof value !== 'string') return null;
  return (PROGRAMS_HOME_FIXTURE_IDS as string[]).includes(value)
    ? (value as ProgramsHomeFixtureId)
    : null;
}

function heroReady(
  slides: ProgramsHomeHeroSlide[],
  startFlowOpen = false,
): ProgramsHomeViewModel['hero'] {
  return { status: 'ready', slides, startFlowOpen };
}

const fixtureRecommendationSlide: ProgramsHomeHeroSlide = {
  id: 'fixture-recommendation',
  source: 'fixture',
  eyebrow: 'Your Recommendation',
  metaLabel: 'After Baseline',
  title: 'Baseline Maintenance',
  description:
    'Baseline signals look steady enough to review. (Fixture — not live diagnosis.)',
  imageUrl: PROGRAMS_HOME_BASELINE_DEFAULT_COPY.imageUrl,
  cta: {
    label: 'Review next step',
    href: '/app/programs/baseline',
    action: 'navigate',
  },
  priority: 10,
};

const fixtureCompletedBaselineSlide: ProgramsHomeHeroSlide = {
  id: 'fixture-baseline-completed',
  source: 'fixture',
  eyebrow: PROGRAMS_HOME_BASELINE_DEFAULT_COPY.eyebrow,
  metaLabel: PROGRAMS_HOME_BASELINE_DEFAULT_COPY.metaLabel,
  title: 'Baseline complete',
  description:
    'Your Baseline window is complete. Review your recommendation and next step when ready.',
  imageUrl: PROGRAMS_HOME_BASELINE_DEFAULT_COPY.imageUrl,
  cta: {
    label: 'Review Baseline',
    href: '/app/programs/baseline',
    action: 'navigate',
  },
  priority: 50,
};

function baseModel(
  partial: Partial<ProgramsHomeViewModel> &
    Pick<ProgramsHomeViewModel, 'fixtureId' | 'hero'>,
): ProgramsHomeViewModel {
  return {
    featured: buildFeaturedViewModel(),
    category: buildCategoryViewModel(),
    ...partial,
  };
}

export const PROGRAMS_HOME_FIXTURES: Record<
  ProgramsHomeFixtureId,
  ProgramsHomeViewModel
> = {
  default: baseModel({
    fixtureId: 'default',
    hero: heroReady(
      buildBaselineHeroSlides({ cardState: 'start_ready', summary: null, source: 'fixture' }),
    ),
  }),
  no_entitlement: baseModel({
    fixtureId: 'no_entitlement',
    hero: heroReady(
      buildBaselineHeroSlides({ cardState: 'locked', summary: null, source: 'fixture' }),
    ),
  }),
  start_ready: baseModel({
    fixtureId: 'start_ready',
    hero: heroReady(
      buildBaselineHeroSlides({ cardState: 'start_ready', summary: null, source: 'fixture' }),
      true,
    ),
  }),
  pre_start: baseModel({
    fixtureId: 'pre_start',
    hero: heroReady(
      buildBaselineHeroSlides({ cardState: 'pre_start', summary: null, source: 'fixture' }),
    ),
  }),
  active: baseModel({
    fixtureId: 'active',
    hero: heroReady(
      buildBaselineHeroSlides({
        cardState: 'active',
        summary: {
          current_day: 8,
        } as never,
        source: 'fixture',
      }),
    ),
  }),
  paused: baseModel({
    fixtureId: 'paused',
    hero: heroReady(
      buildBaselineHeroSlides({ cardState: 'paused', summary: null, source: 'fixture' }),
    ),
  }),
  completed_recommendation: baseModel({
    fixtureId: 'completed_recommendation',
    hero: heroReady([fixtureRecommendationSlide, fixtureCompletedBaselineSlide]),
  }),
  recommendation_pending: baseModel({
    fixtureId: 'recommendation_pending',
    hero: heroReady(
      buildBaselineHeroSlides({
        cardState: 'completed',
        summary: { latest_recommendation: null } as never,
        source: 'fixture',
      }),
    ),
  }),
  multi_slide: baseModel({
    fixtureId: 'multi_slide',
    hero: heroReady([
      fixtureRecommendationSlide,
      fixtureCompletedBaselineSlide,
      {
        id: 'fixture-catalogue-slide',
        source: 'fixture',
        eyebrow: 'Featured',
        metaLabel: 'Coming soon',
        title: 'Nutrition Foundations preview',
        description:
          'Carousel shell demonstration slide. Seeded only — no enrollment.',
        imageUrl: '/images/programs/unlock-your-nutrition.jpg',
        cta: {
          label: 'Preview',
          action: 'none',
          disabled: true,
        },
        priority: 80,
      },
    ]),
  }),
  runtime_error: baseModel({
    fixtureId: 'runtime_error',
    hero: {
      status: 'runtime_error',
      slides: [
        {
          id: 'fixture-runtime-error',
          source: 'fixture',
          eyebrow: 'Programs',
          metaLabel: 'Runtime',
          title: 'Programs could not load',
          description: 'Fixture runtime error — recoverable. Retry when ready.',
          imageUrl: PROGRAMS_HOME_BASELINE_DEFAULT_COPY.imageUrl,
          cta: {
            label: 'Retry',
            href: '/app/programs',
            action: 'navigate',
          },
          priority: 10,
        },
      ],
      startFlowOpen: false,
      errorMessage: 'Fixture runtime error — recoverable. Retry when ready.',
    },
  }),
  featured_empty: baseModel({
    fixtureId: 'featured_empty',
    hero: heroReady(
      buildBaselineHeroSlides({ cardState: 'start_ready', summary: null, source: 'fixture' }),
    ),
    featured: buildFeaturedViewModel([]),
  }),
  category_lifestyle: baseModel({
    fixtureId: 'category_lifestyle',
    hero: heroReady(
      buildBaselineHeroSlides({ cardState: 'start_ready', summary: null, source: 'fixture' }),
    ),
    category: buildCategoryViewModel({ selectedCategoryKey: 'lifestyle' }),
  }),
  category_advanced: baseModel({
    fixtureId: 'category_advanced',
    hero: heroReady(
      buildBaselineHeroSlides({ cardState: 'start_ready', summary: null, source: 'fixture' }),
    ),
    category: buildCategoryViewModel({ selectedCategoryKey: 'advanced' }),
  }),
  search_results: baseModel({
    fixtureId: 'search_results',
    hero: heroReady(
      buildBaselineHeroSlides({ cardState: 'start_ready', summary: null, source: 'fixture' }),
    ),
    category: buildCategoryViewModel({
      selectedCategoryKey: 'nutrition',
      searchQuery: 'sport',
      items: PROGRAMS_HOME_CATALOGUE_SEEDS,
    }),
  }),
  search_empty: baseModel({
    fixtureId: 'search_empty',
    hero: heroReady(
      buildBaselineHeroSlides({ cardState: 'start_ready', summary: null, source: 'fixture' }),
    ),
    category: buildCategoryViewModel({
      selectedCategoryKey: 'nutrition',
      searchQuery: 'zzzz-no-match',
      items: PROGRAMS_HOME_CATALOGUE_SEEDS,
    }),
  }),
};

export function getProgramsHomeFixture(
  id: ProgramsHomeFixtureId,
): ProgramsHomeViewModel {
  return PROGRAMS_HOME_FIXTURES[id];
}

export { PROGRAMS_HOME_FEATURED_SEEDS, PROGRAMS_HOME_CATALOGUE_SEEDS };
