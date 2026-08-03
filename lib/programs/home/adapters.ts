/**
 * Programs Home hero + category adapters.
 *
 * Live Baseline entitlement/runtime truth maps into typed hero slides.
 * Recommendation copy comes only from existing recommendation output.
 */

import { PROGRAMS_MVP_CATEGORIES } from '@/lib/programs/appProgramsMvp';
import type {
  ProgramAvailabilityEntry,
  ProgramAvailabilityState,
} from '@/lib/programs/programAvailabilityServerService';
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
  ProgramsHomeFeaturedAvailability,
  ProgramsHomeFeaturedItem,
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

export function mapAvailabilityStateToFeatured(
  state: ProgramAvailabilityState | undefined,
  canStart: boolean,
): {
  availability: ProgramsHomeFeaturedAvailability;
  ctaLabel: string;
  disabled: boolean;
} {
  switch (state) {
    case 'in_progress':
      return { availability: 'in_progress', ctaLabel: 'Continue', disabled: false };
    case 'completed':
      return {
        availability: 'completed',
        ctaLabel: canStart ? 'Start again' : 'Review',
        disabled: false,
      };
    case 'available':
      return { availability: 'available', ctaLabel: 'Open', disabled: false };
    case 'not_entitled':
      return { availability: 'locked', ctaLabel: 'Locked', disabled: true };
    case 'dependency_locked':
      return { availability: 'locked', ctaLabel: 'Locked', disabled: true };
    default:
      return { availability: 'coming_soon', ctaLabel: 'Coming Soon', disabled: true };
  }
}

/**
 * Map live Program Library availability onto the Programs Home catalogue
 * surface. Presentation copy still comes from the MVP registry; CTA truth
 * comes only from availability entries.
 */
export function buildLiveCatalogueFromAvailability(
  availability: ProgramAvailabilityEntry[],
): ProgramsHomeCatalogueItem[] {
  const bySlug = new Map(
    availability.map((entry) => [entry.slug.toLowerCase(), entry] as const),
  );
  const items: ProgramsHomeCatalogueItem[] = [];

  for (const category of PROGRAMS_MVP_CATEGORIES) {
    for (const series of category.series) {
      for (const program of series.programs) {
        if (program.status === 'tba') continue;
        const live = bySlug.get(program.slug.toLowerCase());
        const mapped = mapAvailabilityStateToFeatured(
          live?.state,
          Boolean(live?.can_start),
        );
        items.push({
          id: `live-${program.slug}`,
          slug: program.slug,
          categoryKey: category.key,
          title: program.name,
          description: program.objective,
          imageUrl: program.imageUrl,
          availability: mapped.availability,
          href:
            mapped.disabled || mapped.availability === 'coming_soon'
              ? undefined
              : `/app/programs/${program.slug}`,
          source: 'runtime',
        });
      }
    }
  }

  return items;
}

export function buildLiveFeaturedFromAvailability(
  availability: ProgramAvailabilityEntry[],
): ProgramsHomeFeaturedViewModel {
  const bySlug = new Map(
    availability.map((entry) => [entry.slug.toLowerCase(), entry] as const),
  );
  // Prefer Baseline + next nutrition pathway programs as featured cards.
  const featuredSlugs = ['baseline', 'digestive-foundations', 'protein-sufficiency'];
  const items: ProgramsHomeFeaturedItem[] = [];

  for (const slug of featuredSlugs) {
    let programDef: {
      slug: string;
      name: string;
      objective: string;
      imageUrl: string;
    } | null = null;
    for (const category of PROGRAMS_MVP_CATEGORIES) {
      for (const series of category.series) {
        const match = series.programs.find((p) => p.slug.toLowerCase() === slug);
        if (match) {
          programDef = match;
          break;
        }
      }
      if (programDef) break;
    }
    if (!programDef) continue;

    const live = bySlug.get(slug);
    const mapped = mapAvailabilityStateToFeatured(
      live?.state,
      Boolean(live?.can_start),
    );
    items.push({
      id: `featured-${slug}`,
      slug: programDef.slug,
      eyebrow:
        mapped.availability === 'coming_soon'
          ? 'Coming Soon'
          : mapped.availability === 'locked'
            ? 'Locked'
            : 'Program',
      title: programDef.name,
      description: programDef.objective,
      imageUrl: programDef.imageUrl,
      availability: mapped.availability,
      ctaLabel: mapped.ctaLabel,
      href:
        mapped.disabled || mapped.availability === 'coming_soon'
          ? undefined
          : `/app/programs/${programDef.slug}`,
      disabled: mapped.disabled,
      source: 'runtime',
    });
  }

  if (items.length === 0) {
    return { status: 'empty', items: [] };
  }
  return { status: 'populated', items };
}

export function previewFromFeatured(
  item: ProgramsHomeFeaturedItem,
): ProgramsHomePreviewItem {
  const canOpen = Boolean(item.href) && !item.disabled;
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
    actionLabel: canOpen ? item.ctaLabel : item.disabled ? item.ctaLabel : 'Coming Soon',
    actionDisabled: !canOpen,
  };
}

export function previewFromCatalogue(
  item: ProgramsHomeCatalogueItem,
): ProgramsHomePreviewItem {
  const category =
    PROGRAMS_HOME_CATEGORIES.find((c) => c.key === item.categoryKey)?.label ??
    item.categoryKey;
  const canOpen = Boolean(item.href) && item.availability !== 'coming_soon' && item.availability !== 'locked';
  return {
    id: item.id,
    slug: item.slug,
    categoryLabel: category,
    title: item.title,
    description: item.description,
    imageUrl: item.imageUrl,
    availability: item.availability,
    actionLabel: canOpen
      ? 'Open program'
      : item.availability === 'coming_soon'
        ? 'Coming Soon'
        : item.availability === 'locked'
          ? 'Locked'
          : 'Unavailable',
    actionDisabled: !canOpen,
  };
}

export { resolveProgramCardRuntimeState };
