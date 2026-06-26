/**
 * Storage-aligned marketing types for the Programs hierarchy.
 *
 * These `ProgramSeries*` names map 1:1 to the `program_series` /
 * `program_series_items` storage tables and are retained as the storage-aligned
 * layer. New code/UI should prefer the canonical "Collection" names re-exported
 * from ./programCollectionTypes (Category -> Collection -> Program -> Version ->
 * Module). The `@deprecated` tags below are migration signals only — the names
 * remain fully supported.
 */
import type { ProgramStatus } from './contentTypes';

/** @deprecated Use `ProgramCollectionCategory` from ./programCollectionTypes. */
export type ProgramSeriesCategory =
  | 'nutrition'
  | 'dietary'
  | 'lifestyle'
  | 'advanced'
  | 'support';

/** @deprecated Use `ProgramCollectionProgramStatus` from ./programCollectionTypes. */
export type ProgramSeriesProgramStatus =
  | 'available'
  | 'coming_soon'
  | 'planned';

/** @deprecated Use `ProgramCollectionCtaConfig` from ./programCollectionTypes. */
export interface ProgramSeriesCtaConfig {
  label: string;
  href?: string;
  offerKey?: string;
  disabled?: boolean;
  helperText?: string;
}

/** @deprecated Use `ProgramCollectionProgramDefinition` from ./programCollectionTypes. */
export interface ProgramSeriesProgramDefinition {
  slug: string;
  title: string;
  subtitle?: string;
  description: string;
  lengthLabel?: string;
  status: ProgramSeriesProgramStatus;
  objective?: string;
  whoFor?: string[];
  whatYouWillDo?: string[];
  cta?: ProgramSeriesCtaConfig;
  /**
   * Optional public marketing image for the program card. Additive + optional:
   * when absent, card surfaces fall back to the series hero image. Has no
   * effect on app runtime, offers, entitlements, or delivery.
   */
  imageUrl?: string;
}

/** @deprecated Use `ProgramCollectionProgramResolution` from ./programCollectionTypes. */
export interface ProgramSeriesProgramResolution {
  series: ProgramSeriesDefinition;
  program: ProgramSeriesProgramDefinition;
  index: number;
  previousProgram: ProgramSeriesProgramDefinition | null;
  nextProgram: ProgramSeriesProgramDefinition | null;
}

export type ProgramMarketingCtaKind =
  | 'checkout_link'
  | 'internal_link'
  | 'account_start'
  | 'disabled';

export interface ProgramMarketingCtaResolution {
  kind: ProgramMarketingCtaKind;
  label: string;
  href: string | null;
  offerKey: string | null;
  disabled: boolean;
  helperText?: string;
  secondaryLabel: string;
  secondaryHref: string;
}

/** @deprecated Use `ProgramCollectionDefinition` from ./programCollectionTypes. */
export interface ProgramSeriesDefinition {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: ProgramSeriesCategory;
  programSlugs: string[];
  programs: ProgramSeriesProgramDefinition[];
  heroImageUrl: string;
  status: ProgramStatus;
  displayOrder: number;
  cta: ProgramSeriesCtaConfig;
  secondaryCta?: ProgramSeriesCtaConfig;
  whoFor: string[];
  whatYouWillDo: string[];
  metadata: Record<string, unknown>;
}
