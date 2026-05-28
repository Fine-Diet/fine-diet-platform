import type { ProgramStatus } from './contentTypes';

export type ProgramSeriesCategory =
  | 'dietary'
  | 'lifestyle'
  | 'advanced'
  | 'support';

export type ProgramSeriesProgramStatus =
  | 'available'
  | 'coming_soon'
  | 'planned';

export interface ProgramSeriesCtaConfig {
  label: string;
  href?: string;
  offerKey?: string;
  disabled?: boolean;
  helperText?: string;
}

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
}

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
