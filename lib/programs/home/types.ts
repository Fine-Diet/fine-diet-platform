/**
 * Programs Home typed view models.
 *
 * Live Baseline/runtime adapters and presentation fixtures both render
 * through these contracts. Seeded catalogue content is presentation-only.
 */

export type ProgramsHomeHeroSource =
  | 'baseline_runtime'
  | 'recommendation'
  | 'catalogue'
  | 'fixture';

export type ProgramsHomeHeroCtaAction =
  | 'open_start_flow'
  | 'navigate'
  | 'none';

export type ProgramsHomeHeroStatus =
  | 'loading'
  | 'ready'
  | 'runtime_error';

export type ProgramsHomeFeaturedAvailability =
  | 'available'
  | 'in_progress'
  | 'completed'
  | 'coming_soon'
  | 'locked';

export type ProgramsHomeCategoryStatus = 'active' | 'coming_soon';

export type ProgramsHomeFixtureId =
  | 'default'
  | 'no_entitlement'
  | 'start_ready'
  | 'pre_start'
  | 'active'
  | 'paused'
  | 'completed_recommendation'
  | 'recommendation_pending'
  | 'multi_slide'
  | 'runtime_error'
  | 'featured_empty'
  | 'category_lifestyle'
  | 'category_advanced'
  | 'search_results'
  | 'search_empty';

export interface ProgramsHomeHeroCta {
  label: string;
  href?: string;
  disabled?: boolean;
  action?: ProgramsHomeHeroCtaAction;
}

export interface ProgramsHomeHeroSlide {
  id: string;
  source: ProgramsHomeHeroSource;
  eyebrow: string;
  metaLabel?: string;
  title: string;
  description: string;
  imageUrl: string;
  cta: ProgramsHomeHeroCta;
  priority: number;
}

export interface ProgramsHomeHeroViewModel {
  status: ProgramsHomeHeroStatus;
  slides: ProgramsHomeHeroSlide[];
  /** When true, the Baseline start-date enrollment panel is visible. */
  startFlowOpen: boolean;
  errorMessage?: string;
}

export interface ProgramsHomeFeaturedItem {
  id: string;
  slug: string;
  eyebrow: string;
  title: string;
  description?: string;
  imageUrl: string;
  availability: ProgramsHomeFeaturedAvailability;
  ctaLabel: string;
  href?: string;
  disabled: boolean;
  source: 'runtime' | 'catalogue' | 'seed';
}

export interface ProgramsHomeFeaturedViewModel {
  status: 'populated' | 'empty' | 'error';
  items: ProgramsHomeFeaturedItem[];
  errorMessage?: string;
}

export interface ProgramsHomeCategory {
  key: string;
  label: string;
  sortOrder: number;
  status: ProgramsHomeCategoryStatus;
}

export interface ProgramsHomeCatalogueItem {
  id: string;
  slug: string;
  categoryKey: string;
  title: string;
  description: string;
  imageUrl: string;
  availability: ProgramsHomeFeaturedAvailability;
  href?: string;
  source: 'runtime' | 'catalogue' | 'seed';
}

export interface ProgramsHomeCategoryViewModel {
  categories: ProgramsHomeCategory[];
  selectedCategoryKey: string;
  searchQuery: string;
  items: ProgramsHomeCatalogueItem[];
  /** Items after category + search filtering. */
  visibleItems: ProgramsHomeCatalogueItem[];
  listStatus: 'idle' | 'results' | 'empty_category' | 'no_results' | 'coming_soon';
}

export interface ProgramsHomePreviewItem {
  id: string;
  slug: string;
  categoryLabel: string;
  title: string;
  description: string;
  imageUrl: string;
  availability: ProgramsHomeFeaturedAvailability;
  actionLabel: string;
  actionDisabled: boolean;
}

export interface ProgramsHomeViewModel {
  fixtureId: ProgramsHomeFixtureId | 'live';
  hero: ProgramsHomeHeroViewModel;
  featured: ProgramsHomeFeaturedViewModel;
  category: ProgramsHomeCategoryViewModel;
}
