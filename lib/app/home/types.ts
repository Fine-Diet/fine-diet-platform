/**
 * Main App Home typed view models.
 * Live adapters and presentation fixtures both render through these contracts.
 */

import type { ProgramsHomeHeroSlide } from '@/lib/programs/home/types';

export type AppHomeFixtureId =
  | 'default'
  | 'loading'
  | 'next_meal'
  | 'all_logged'
  | 'no_schedule'
  | 'home_error'
  | 'nds_empty'
  | 'nds_error'
  | 'program_start_ready'
  | 'program_active'
  | 'program_recommendation'
  | 'program_recommendation_pending'
  | 'food_ready'
  | 'food_no_plan'
  | 'food_no_pantry'
  | 'food_no_list'
  | 'food_error';

export type AppHomeWelcomeStatus =
  | 'loading'
  | 'next_meal'
  | 'all_logged'
  | 'no_schedule'
  | 'error';

export type AppHomeRhythmSlotState =
  | 'logged'
  | 'actionable'
  | 'future_unlogged'
  | 'past_unlogged';

export type AppHomeNdsStatus = 'loading' | 'populated' | 'empty' | 'error';

export type AppHomeProgramsStatus =
  | 'loading'
  | 'ready'
  | 'runtime_error';

export type AppHomeFoodStatus =
  | 'loading'
  | 'ready'
  | 'no_plan'
  | 'no_pantry'
  | 'no_list'
  | 'error';

export interface AppHomeWelcomeViewModel {
  status: AppHomeWelcomeStatus;
  greeting: string;
  supportCopy: string;
  ctaLabel: string;
  ctaHref: string;
  /** Slot key when status is next_meal — must match Rhythm actionable slot. */
  actionableSlotKey: string | null;
}

export interface AppHomeNdsMetric {
  id: string;
  label: string;
  value: string;
}

export interface AppHomeNdsViewModel {
  status: AppHomeNdsStatus;
  metrics: AppHomeNdsMetric[];
  errorMessage?: string;
}

export interface AppHomeRhythmSlot {
  slotKey: string;
  label: string;
  targetTime: string; // HH:mm
  targetTimeLabel: string; // display
  state: AppHomeRhythmSlotState;
  entryId: string | null;
  href: string;
  actionable: boolean;
}

export interface AppHomeRhythmViewModel {
  status: 'loading' | 'ready' | 'no_schedule' | 'error';
  slots: AppHomeRhythmSlot[];
  actionableSlotKey: string | null;
  setupHref: string;
}

export interface AppHomeProgramsViewModel {
  status: AppHomeProgramsStatus;
  /** Primary slide from Programs Home hero resolver (carousel-capable later). */
  primarySlide: ProgramsHomeHeroSlide | null;
  errorMessage?: string;
}

export interface AppHomeFoodViewModel {
  status: AppHomeFoodStatus;
  eyebrow: 'Food';
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  imageUrl: string;
}

export interface AppHomeViewModel {
  fixtureId: AppHomeFixtureId | 'live';
  welcome: AppHomeWelcomeViewModel;
  nds: AppHomeNdsViewModel;
  rhythm: AppHomeRhythmViewModel;
  programs: AppHomeProgramsViewModel;
  food: AppHomeFoodViewModel;
}
