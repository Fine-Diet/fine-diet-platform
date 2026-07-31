/**
 * Programs Home hero + category adapters.
 *
 * Live Baseline entitlement/runtime truth maps into typed hero slides.
 * Recommendation copy comes only from existing recommendation output.
 */

import type { ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';
import {
  formatRecommendedStepLabel,
  getRecommendationRevealDetails,
  resolveProgramCardRuntimeState,
  type ProgramCardRuntimeState,
} from '@/lib/programs/runtimeUi';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

import {
  PROGRAMS_HOME_BASELINE_DEFAULT_COPY,
  PROGRAMS_HOME_CATALOGUE_SEEDS,
  PROGRAMS_HOME_CATEGORIES,
  PROGRAMS_HOME_FEATURED_SEEDS,
} from './seeds';
import type {
  ProgramsHomeCatalogueItem,
  ProgramsHomeCategoryViewModel,
  ProgramsHomeFeaturedViewModel,
  ProgramsHomeHeroSlide,
  ProgramsHomeHeroViewModel,
  ProgramsHomePreviewItem,
} from './types';

const BASELINE_HREF = '/app/programs/baseline';
const PUBLIC_PROGRAMS_HREF = '/programs';

export function hasBaselineAccessFromLibrary(entry: {
  has_entitlement?: boolean;
  access_state?: string;
} | null): boolean {
  if (!entry) return false;
  return (
    Boolean(entry.has_entitlement) || entry.access_state === 'assigned_only'
  );
}

function baselineSlide(
  partial: Partial<ProgramsHomeHeroSlide> &
    Pick<ProgramsHomeHeroSlide, 'id' | 'cta'>,
): ProgramsHomeHeroSlide {
  return {
    source: 'baseline_runtime',
    eyebrow: PROGRAMS_HOME_BASELINE_DEFAULT_COPY.eyebrow,
    metaLabel: PROGRAMS_HOME_BASELINE_DEFAULT_COPY.metaLabel,
    title: PROGRAMS_HOME_BASELINE_DEFAULT_COPY.title,
    description: PROGRAMS_HOME_BASELINE_DEFAULT_COPY.description,
    imageUrl: PROGRAMS_HOME_BASELINE_DEFAULT_COPY.imageUrl,
    priority: 100,
    ...partial,
  };
}

export function buildBaselineHeroSlides({
  cardState,
  summary,
  source = 'baseline_runtime',
}: {
  cardState: ProgramCardRuntimeState;
  summary: ProgramRuntimeSummary | null;
  source?: ProgramsHomeHeroSlide['source'];
}): ProgramsHomeHeroSlide[] {
  const completedSlide = baselineSlide({
    id: 'baseline-completed',
    source,
    title: 'Baseline complete',
    description:
      'Your Baseline window is complete. Review your recommendation and next step when ready.',
    cta: {
      label: 'Review Baseline',
      href: BASELINE_HREF,
      action: 'navigate',
    },
    priority: 50,
  });

  if (cardState === 'completed') {
    const details = getRecommendationRevealDetails(
      summary?.latest_recommendation ?? null,
    );

    if (details?.recommendedStep || details?.reasonSnippet) {
      const recommendationSlide: ProgramsHomeHeroSlide = {
        id: 'baseline-recommendation',
        source: source === 'fixture' ? 'fixture' : 'recommendation',
        eyebrow: 'Your Recommendation',
        metaLabel: 'After Baseline',
        title: formatRecommendedStepLabel(details.recommendedStep),
        description:
          details.reasonSnippet ??
          'A stored recommendation is available from your Baseline completion.',
        imageUrl: PROGRAMS_HOME_BASELINE_DEFAULT_COPY.imageUrl,
        cta: {
          label: 'Review next step',
          href: BASELINE_HREF,
          action: 'navigate',
        },
        priority: 10,
      };
      return [recommendationSlide, completedSlide];
    }

    return [
      baselineSlide({
        id: 'baseline-recommendation-pending',
        source,
        eyebrow: 'Baseline',
        metaLabel: 'Recommendation pending',
        title: 'Your recommendation is being prepared',
        description:
          'Fine Diet will use your Baseline signals to suggest the next best path. Check Baseline for updates.',
        cta: {
          label: 'Open Baseline',
          href: BASELINE_HREF,
          action: 'navigate',
        },
        priority: 10,
      }),
    ];
  }

  switch (cardState) {
    case 'locked':
      return [
        baselineSlide({
          id: 'baseline-no-entitlement',
          source,
          cta: {
            label: 'Get Started',
            href: PUBLIC_PROGRAMS_HREF,
            action: 'navigate',
          },
          priority: 10,
        }),
      ];
    case 'start_ready':
      return [
        baselineSlide({
          id: 'baseline-start-ready',
          source,
          cta: {
            label: 'Get Started',
            action: 'open_start_flow',
          },
          priority: 10,
        }),
      ];
    case 'pre_start':
      return [
        baselineSlide({
          id: 'baseline-pre-start',
          source,
          description:
            summary?.enrollment.selected_start_date
              ? `Baseline begins on ${summary.enrollment.selected_start_date}. Prepare your setup before day one.`
              : 'Prepare your setup before Baseline day one begins.',
          cta: {
            label: 'Prepare for Baseline',
            href: BASELINE_HREF,
            action: 'navigate',
          },
          priority: 10,
        }),
      ];
    case 'active':
      return [
        baselineSlide({
          id: 'baseline-active',
          source,
          metaLabel:
            summary?.current_day && summary.current_day > 0
              ? `Day ${summary.current_day} of 21`
              : PROGRAMS_HOME_BASELINE_DEFAULT_COPY.metaLabel,
          description:
            'Continue your Baseline rhythm. Keep inputs steady and complete check-ins as they arrive.',
          cta: {
            label: 'Continue Baseline',
            href: BASELINE_HREF,
            action: 'navigate',
          },
          priority: 10,
        }),
      ];
    case 'paused':
      return [
        baselineSlide({
          id: 'baseline-paused',
          source,
          description:
            'Baseline is paused. Resume from the program detail when you are ready to continue.',
          cta: {
            label: 'Paused',
            href: BASELINE_HREF,
            action: 'navigate',
            disabled: true,
          },
          priority: 10,
        }),
      ];
    case 'cancelled':
      return [
        baselineSlide({
          id: 'baseline-cancelled',
          source,
          description:
            'This Baseline enrollment is closed. Start again from Programs when access remains available.',
          cta: {
            label: 'Enrollment closed',
            disabled: true,
            action: 'none',
          },
          priority: 10,
        }),
      ];
    default:
      return [
        baselineSlide({
          id: 'baseline-default',
          source,
          cta: {
            label: 'Get Started',
            action: 'open_start_flow',
          },
          priority: 10,
        }),
      ];
  }
}

export function buildHeroViewModelFromRuntime({
  hasAccess,
  summary,
  startFlowOpen = false,
  loading = false,
  errorMessage,
}: {
  hasAccess: boolean;
  summary: ProgramRuntimeSummary | null;
  startFlowOpen?: boolean;
  loading?: boolean;
  errorMessage?: string;
}): ProgramsHomeHeroViewModel {
  if (loading) {
    return {
      status: 'loading',
      slides: [
        baselineSlide({
          id: 'baseline-loading',
          source: 'baseline_runtime',
          title: 'Loading your programs…',
          description: 'Checking Baseline access and runtime state.',
          cta: { label: 'Loading', disabled: true, action: 'none' },
          priority: 10,
        }),
      ],
      startFlowOpen: false,
    };
  }

  if (errorMessage) {
    return {
      status: 'runtime_error',
      slides: [
        baselineSlide({
          id: 'baseline-runtime-error',
          source: 'baseline_runtime',
          title: 'Programs could not load',
          description: errorMessage,
          cta: {
            label: 'Retry',
            href: APP_ROUTES.programs,
            action: 'navigate',
          },
          priority: 10,
        }),
      ],
      startFlowOpen: false,
      errorMessage,
    };
  }

  const cardState = resolveProgramCardRuntimeState({ hasAccess, summary });
  return {
    status: 'ready',
    slides: buildBaselineHeroSlides({ cardState, summary }),
    startFlowOpen,
  };
}

export function buildFeaturedViewModel(
  items: typeof PROGRAMS_HOME_FEATURED_SEEDS = PROGRAMS_HOME_FEATURED_SEEDS,
): ProgramsHomeFeaturedViewModel {
  if (items.length === 0) {
    return { status: 'empty', items: [] };
  }
  return { status: 'populated', items };
}

export function filterCatalogueItems({
  items,
  categoryKey,
  searchQuery,
}: {
  items: ProgramsHomeCatalogueItem[];
  categoryKey: string;
  searchQuery: string;
}): {
  visibleItems: ProgramsHomeCatalogueItem[];
  listStatus: ProgramsHomeCategoryViewModel['listStatus'];
} {
  const category = PROGRAMS_HOME_CATEGORIES.find((c) => c.key === categoryKey);
  const query = searchQuery.trim().toLowerCase();

  if (query) {
    const visibleItems = items.filter((item) => {
      const haystack = `${item.title} ${item.description}`.toLowerCase();
      return haystack.includes(query);
    });
    return {
      visibleItems,
      listStatus: visibleItems.length > 0 ? 'results' : 'no_results',
    };
  }

  if (category?.status === 'coming_soon') {
    const visibleItems = items.filter((item) => item.categoryKey === categoryKey);
    return {
      visibleItems,
      listStatus: visibleItems.length > 0 ? 'idle' : 'coming_soon',
    };
  }

  const visibleItems = items.filter((item) => item.categoryKey === categoryKey);
  return {
    visibleItems,
    listStatus: visibleItems.length > 0 ? 'idle' : 'empty_category',
  };
}

export function buildCategoryViewModel({
  selectedCategoryKey = 'nutrition',
  searchQuery = '',
  items = PROGRAMS_HOME_CATALOGUE_SEEDS,
}: {
  selectedCategoryKey?: string;
  searchQuery?: string;
  items?: ProgramsHomeCatalogueItem[];
} = {}): ProgramsHomeCategoryViewModel {
  const knownKeys = new Set(PROGRAMS_HOME_CATEGORIES.map((c) => c.key));
  const resolvedKey = knownKeys.has(selectedCategoryKey)
    ? selectedCategoryKey
    : 'nutrition';
  const { visibleItems, listStatus } = filterCatalogueItems({
    items,
    categoryKey: resolvedKey,
    searchQuery,
  });

  return {
    categories: [...PROGRAMS_HOME_CATEGORIES].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    ),
    selectedCategoryKey: resolvedKey,
    searchQuery,
    items,
    visibleItems,
    listStatus,
  };
}

export function previewFromFeatured(
  item: (typeof PROGRAMS_HOME_FEATURED_SEEDS)[number],
): ProgramsHomePreviewItem {
  return {
    id: item.id,
    slug: item.slug,
    categoryLabel: 'Featured',
    title: item.title,
    description:
      item.description ??
      'Program details will attach when the signed-in catalogue is connected.',
    imageUrl: item.imageUrl,
    availability: item.availability,
    actionLabel: item.disabled ? item.ctaLabel : 'Preview only',
    actionDisabled: true,
  };
}

export function previewFromCatalogue(
  item: ProgramsHomeCatalogueItem,
): ProgramsHomePreviewItem {
  const category =
    PROGRAMS_HOME_CATEGORIES.find((c) => c.key === item.categoryKey)?.label ??
    item.categoryKey;
  return {
    id: item.id,
    slug: item.slug,
    categoryLabel: category,
    title: item.title,
    description: item.description,
    imageUrl: item.imageUrl,
    availability: item.availability,
    actionLabel:
      item.availability === 'coming_soon' ? 'Coming Soon' : 'Preview only',
    actionDisabled: true,
  };
}

export { resolveProgramCardRuntimeState };
