'use client';

/**
 * Programs Home presentation composition.
 *
 * Carousel hero + Featured Programs + Programs by Category.
 * Live Baseline entitlement/runtime adapters attach on /app/programs.
 * Deterministic fixtures drive /dev/programs-home review.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { BaselineStartFlowPanel } from '@/components/programs/home/BaselineStartFlowPanel';
import { FeaturedProgramsModule } from '@/components/programs/home/FeaturedProgramsModule';
import { ProgrammePreviewSheet } from '@/components/programs/home/ProgrammePreviewSheet';
import { ProgramsByCategoryModule } from '@/components/programs/home/ProgramsByCategoryModule';
import { ProgramsHomeHero } from '@/components/programs/home/ProgramsHomeHero';
import {
  buildCategoryViewModel,
  buildFeaturedViewModel,
  buildHeroViewModelFromRuntime,
  buildLiveCatalogueFromAvailability,
  buildLiveFeaturedFromAvailability,
  hasBaselineAccessFromLibrary,
  previewFromCatalogue,
  previewFromFeatured,
} from '@/lib/programs/home/adapters';
import {
  getProgramsHomeFixture,
  parseProgramsHomeFixtureId,
  programsHomeFixturesAllowed,
} from '@/lib/programs/home/fixtures';
import {
  PROGRAMS_HOME_CATALOGUE_SEEDS,
} from '@/lib/programs/home/seeds';
import type {
  ProgramsHomeCatalogueItem,
  ProgramsHomeFeaturedItem,
  ProgramsHomePreviewItem,
  ProgramsHomeViewModel,
} from '@/lib/programs/home/types';
import type { ProgramLibrary } from '@/lib/programs/programLibraryServerService';
import { selectDisplayRuntimeSummaryForSlug } from '@/lib/programs/runtimeUi';
import type {
  ProgramRuntimeSummaryList,
} from '@/lib/programs/runtimeTypes';
import { stackedLayerClasses } from '@/components/layout/StackedPageSection';
import { cn } from '@/lib/utils';

const BASELINE_SLUG = 'baseline';

function resolveFixtureModel(fixtureQuery: unknown): ProgramsHomeViewModel | null {
  if (!programsHomeFixturesAllowed()) return null;
  const fixtureId = parseProgramsHomeFixtureId(fixtureQuery);
  if (!fixtureId) return null;
  return getProgramsHomeFixture(fixtureId);
}

function categoryKeyFromQuery(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'nutrition';
}

function searchFromQuery(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function ProgramsHomeView({
  hideFooter = false,
  preferFixtures = false,
}: {
  /** Dev preview hides footer so it does not obscure prototype comparison. */
  hideFooter?: boolean;
  /** Force fixture mode even without ?fixture= (dev preview default). */
  preferFixtures?: boolean;
}) {
  const router = useRouter();
  const fixtureModel = useMemo(
    () => resolveFixtureModel(router.query.fixture),
    [router.query.fixture],
  );

  const useFixtures =
    Boolean(fixtureModel) ||
    (preferFixtures && programsHomeFixturesAllowed());

  const baseFixture = useMemo(() => {
    if (fixtureModel) return fixtureModel;
    if (preferFixtures && programsHomeFixturesAllowed()) {
      return getProgramsHomeFixture('default');
    }
    return null;
  }, [fixtureModel, preferFixtures]);

  const queryCategory = categoryKeyFromQuery(router.query.category);
  const querySearch = searchFromQuery(router.query.q);

  const [liveHero, setLiveHero] = useState(() =>
    buildHeroViewModelFromRuntime({ hasAccess: false, summary: null, loading: true }),
  );
  const [liveFeatured, setLiveFeatured] = useState(() =>
    buildFeaturedViewModel([]),
  );
  const [liveCatalogueItems, setLiveCatalogueItems] = useState<
    ProgramsHomeCatalogueItem[]
  >([]);
  const [startFlowOpen, setStartFlowOpen] = useState(false);
  const [preview, setPreview] = useState<ProgramsHomePreviewItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(queryCategory);
  const [searchQuery, setSearchQuery] = useState(querySearch);

  useEffect(() => {
    setSelectedCategory(queryCategory);
  }, [queryCategory]);

  useEffect(() => {
    setSearchQuery(querySearch);
  }, [querySearch]);

  useEffect(() => {
    if (baseFixture?.hero.startFlowOpen) {
      setStartFlowOpen(true);
    }
  }, [baseFixture?.fixtureId, baseFixture?.hero.startFlowOpen]);

  const loadLive = useCallback(async () => {
    setLiveHero(
      buildHeroViewModelFromRuntime({
        hasAccess: false,
        summary: null,
        loading: true,
      }),
    );
    try {
      const [runtimeResp, libraryResp] = await Promise.all([
        fetch('/api/journal/programs/runtime-summary'),
        fetch('/api/journal/programs/library'),
      ]);
      if (!runtimeResp.ok || !libraryResp.ok) {
        throw new Error('Could not load program runtime state.');
      }
      const runtimeJson = (await runtimeResp.json()) as ProgramRuntimeSummaryList;
      const libraryJson = (await libraryResp.json()) as ProgramLibrary;
      const summary = selectDisplayRuntimeSummaryForSlug(
        runtimeJson.summaries,
        BASELINE_SLUG,
      );
      const libraryEntry =
        libraryJson.entries.find(
          (entry) => entry.slug.toLowerCase() === BASELINE_SLUG,
        ) ?? null;
      const hasAccess =
        hasBaselineAccessFromLibrary(libraryEntry) || Boolean(summary);
      setLiveHero(
        buildHeroViewModelFromRuntime({
          hasAccess,
          summary,
          startFlowOpen: false,
        }),
      );
      setLiveFeatured(buildLiveFeaturedFromAvailability(libraryJson.availability));
      setLiveCatalogueItems(
        buildLiveCatalogueFromAvailability(libraryJson.availability),
      );
    } catch (err) {
      setLiveHero(
        buildHeroViewModelFromRuntime({
          hasAccess: false,
          summary: null,
          errorMessage:
            err instanceof Error
              ? err.message
              : 'Could not load program runtime state.',
        }),
      );
      setLiveFeatured({
        status: 'error',
        items: [],
        errorMessage: 'Could not load program availability.',
      });
      setLiveCatalogueItems([]);
    }
  }, []);

  useEffect(() => {
    if (useFixtures) return;
    void loadLive();
  }, [useFixtures, loadLive]);

  const featured = useFixtures
    ? baseFixture!.featured
    : liveFeatured;

  const category = useMemo(() => {
    if (useFixtures && baseFixture) {
      const fixtureCategory = baseFixture.category;
      const categoryKey =
        typeof router.query.category === 'string'
          ? selectedCategory
          : fixtureCategory.selectedCategoryKey;
      const q =
        typeof router.query.q === 'string' ? searchQuery : fixtureCategory.searchQuery;
      return buildCategoryViewModel({
        selectedCategoryKey: categoryKey,
        searchQuery: q,
        items: fixtureCategory.items,
      });
    }
    return buildCategoryViewModel({
      selectedCategoryKey: selectedCategory,
      searchQuery,
      items:
        liveCatalogueItems.length > 0
          ? liveCatalogueItems
          : PROGRAMS_HOME_CATALOGUE_SEEDS,
    });
  }, [
    useFixtures,
    baseFixture,
    selectedCategory,
    searchQuery,
    router.query.category,
    router.query.q,
    liveCatalogueItems,
  ]);

  const hero = useMemo(() => {
    if (useFixtures && baseFixture) {
      return {
        ...baseFixture.hero,
        startFlowOpen,
      };
    }
    return {
      ...liveHero,
      startFlowOpen,
    };
  }, [useFixtures, baseFixture, liveHero, startFlowOpen]);

  const replaceQuery = useCallback(
    (patch: Record<string, string | undefined>) => {
      const nextQuery: Record<string, string> = {};
      for (const [key, value] of Object.entries(router.query)) {
        if (key in patch) continue;
        if (typeof value === 'string' && value.length > 0) {
          nextQuery[key] = value;
        }
      }
      for (const [key, value] of Object.entries(patch)) {
        if (typeof value === 'string' && value.length > 0) {
          nextQuery[key] = value;
        }
      }
      void router.replace(
        { pathname: router.pathname, query: nextQuery },
        undefined,
        { shallow: true },
      );
    },
    [router],
  );

  const handleSelectCategory = useCallback(
    (key: string) => {
      setSelectedCategory(key);
      setSearchQuery('');
      replaceQuery({ category: key, q: '' });
    },
    [replaceQuery],
  );

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      replaceQuery({
        category: selectedCategory,
        q: query.trim() ? query : '',
      });
    },
    [replaceQuery, selectedCategory],
  );

  const handleFeaturedActivate = useCallback(
    (item: ProgramsHomeFeaturedItem) => {
      if (item.href && !item.disabled) {
        void router.push(item.href);
        return;
      }
      setPreview(previewFromFeatured(item));
    },
    [router],
  );

  const handleOpenCatalogue = useCallback(
    (item: ProgramsHomeCatalogueItem) => {
      if (item.href) {
        void router.push(item.href);
        return;
      }
      setPreview(previewFromCatalogue(item));
    },
    [router],
  );

  const handlePreviewAction = useCallback(() => {
    if (!preview || preview.actionDisabled) return;
    const href = `/app/programs/${preview.slug}`;
    setPreview(null);
    void router.push(href);
  }, [preview, router]);

  return (
    <div className="min-h-screen bg-[#16110d] text-white">
      <ProgramsHomeHero
        hero={hero}
        onOpenStartFlow={() => setStartFlowOpen(true)}
        startFlowSlot={
          <BaselineStartFlowPanel
            disabled={useFixtures}
            onCancel={() => setStartFlowOpen(false)}
            onStarted={async () => {
              setStartFlowOpen(false);
              if (!useFixtures) await loadLive();
            }}
          />
        }
      />

      <section
        className={cn(
          stackedLayerClasses(1, 'bg-[#16110d] pb-24 pt-8 sm:pt-10'),
          hideFooter ? 'pb-10' : 'pb-[120px]',
        )}
      >
        <div className="mx-auto w-full max-w-[1000px] px-4 sm:px-5">
          <FeaturedProgramsModule
            featured={featured}
            onActivate={handleFeaturedActivate}
          />
          <ProgramsByCategoryModule
            category={category}
            onSelectCategory={handleSelectCategory}
            onSearchChange={handleSearchChange}
            onOpenItem={handleOpenCatalogue}
          />
        </div>
      </section>

      <ProgrammePreviewSheet
        item={preview}
        onClose={() => setPreview(null)}
        onAction={handlePreviewAction}
      />

      {!hideFooter ? <JournalFooterNav /> : null}
    </div>
  );
}

