/**
 * Deterministic App Home presentation fixtures.
 * Allowed only outside production. Persist no fake records.
 */

import { buildBaselineHeroSlides } from '@/lib/programs/home/adapters';
import { PROGRAMS_HOME_BASELINE_DEFAULT_COPY } from '@/lib/programs/home/seeds';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

import {
  buildFoodViewModel,
  buildNdsViewModel,
  buildRhythmViewModel,
  buildWelcomeViewModel,
} from './adapters';
import type { NextMealResolverOutcome, NextMealSlotResult } from './nextMealResolver';
import type { AppHomeFixtureId, AppHomeViewModel } from './types';

export const APP_HOME_FIXTURE_IDS: AppHomeFixtureId[] = [
  'default',
  'loading',
  'next_meal',
  'all_logged',
  'no_schedule',
  'home_error',
  'nds_empty',
  'nds_error',
  'program_start_ready',
  'program_active',
  'program_recommendation',
  'program_recommendation_pending',
  'food_ready',
  'food_no_plan',
  'food_no_pantry',
  'food_no_list',
  'food_error',
];

export function appHomeFixturesAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function parseAppHomeFixtureId(value: unknown): AppHomeFixtureId | null {
  if (typeof value !== 'string') return null;
  return (APP_HOME_FIXTURE_IDS as string[]).includes(value)
    ? (value as AppHomeFixtureId)
    : null;
}

function slot(
  partial: Omit<NextMealSlotResult, 'logHref' | 'editHref'> & {
    logHref?: string;
    editHref?: string | null;
  },
): NextMealSlotResult {
  return {
    logHref: `${APP_ROUTES.logNew}?tab=food&mealSlot=${partial.slotKey}&date=2026-07-30&time=${partial.targetTime}`,
    editHref: partial.entryId ? `/app/log/entry/${partial.entryId}` : null,
    ...partial,
  };
}

const nextMealOutcome: NextMealResolverOutcome = {
  kind: 'next_meal',
  actionable: slot({
    slotKey: 'afternoon_snack',
    slotLabel: 'Afternoon Mini-Meal',
    targetTime: '14:00',
    logged: false,
    actionable: true,
    entryId: null,
  }),
  slots: [
    slot({
      slotKey: 'breakfast',
      slotLabel: 'Breakfast',
      targetTime: '08:00',
      logged: true,
      actionable: false,
      entryId: 'fixture-entry-breakfast',
    }),
    slot({
      slotKey: 'lunch',
      slotLabel: 'Lunch',
      targetTime: '11:00',
      logged: false,
      actionable: false,
      entryId: null,
    }),
    slot({
      slotKey: 'afternoon_snack',
      slotLabel: 'Afternoon Mini-Meal',
      targetTime: '14:00',
      logged: false,
      actionable: true,
      entryId: null,
    }),
    slot({
      slotKey: 'dinner',
      slotLabel: 'Dinner',
      targetTime: '17:00',
      logged: false,
      actionable: false,
      entryId: null,
    }),
  ],
};

const allLoggedOutcome: NextMealResolverOutcome = {
  kind: 'all_logged',
  slots: nextMealOutcome.slots.map((s) =>
    slot({
      ...s,
      logged: true,
      actionable: false,
      entryId: `fixture-entry-${s.slotKey}`,
    }),
  ),
};

const noScheduleOutcome: NextMealResolverOutcome = {
  kind: 'no_schedule',
  slots: [],
};

function programSlide(
  cardState: Parameters<typeof buildBaselineHeroSlides>[0]['cardState'],
) {
  const slides = buildBaselineHeroSlides({
    cardState,
    summary:
      cardState === 'active'
        ? ({ current_day: 8 } as never)
        : cardState === 'completed'
          ? ({ latest_recommendation: null } as never)
          : null,
    source: 'fixture',
  });
  return slides[0] ?? null;
}

function baseModel(
  partial: Partial<AppHomeViewModel> & Pick<AppHomeViewModel, 'fixtureId'>,
): AppHomeViewModel {
  return {
    welcome: buildWelcomeViewModel({
      firstName: 'Jordan',
      outcome: nextMealOutcome,
    }),
    nds: buildNdsViewModel({
      data: {
        date_local: '2026-07-30',
        person_id: 'fixture',
        nds_score_100: 50,
        subscores_10: { wfr: 9.2, ps: 7, pnd: 6, fp: 5, as: 8, mnc: 6, ob: 5 },
        readings: {
          wfr_percent: 92,
          protein_score_10: 7,
          fiber_g: 18,
        },
        nds_version: 'fixture',
        classifier_version: 'fixture',
        _meta: { intake_count: 2, meal_count: 2 },
      },
      isLoading: false,
    }),
    rhythm: buildRhythmViewModel({
      outcome: nextMealOutcome,
      now: new Date('2026-07-30T13:30:00'),
    }),
    programs: {
      status: 'ready',
      primarySlide: programSlide('start_ready'),
    },
    food: buildFoodViewModel({
      state: 'ready',
      summary: {
        state: 'has_grocery',
        active_plan: { id: 'fixture-plan', title: 'Fixture Plan' },
        grocery_scope: { date_start: '2026-07-30', date_end: '2026-08-05' },
        coverage: {
          rows_covered_full: 4,
          rows_to_buy: 6,
          rows_unit_or_amount_review: 0,
          rows_unresolved_identity: 0,
        },
      } as never,
    }),
    ...partial,
  };
}

export const APP_HOME_FIXTURES: Record<AppHomeFixtureId, AppHomeViewModel> = {
  default: baseModel({ fixtureId: 'default' }),
  loading: baseModel({
    fixtureId: 'loading',
    welcome: buildWelcomeViewModel({
      firstName: 'Jordan',
      outcome: null,
      loading: true,
    }),
    nds: buildNdsViewModel({ data: null, isLoading: true }),
    rhythm: buildRhythmViewModel({ outcome: null, loading: true }),
    programs: { status: 'loading', primarySlide: null },
    food: buildFoodViewModel({ state: 'loading', summary: null }),
  }),
  next_meal: baseModel({ fixtureId: 'next_meal' }),
  all_logged: baseModel({
    fixtureId: 'all_logged',
    welcome: buildWelcomeViewModel({
      firstName: 'Jordan',
      outcome: allLoggedOutcome,
    }),
    rhythm: buildRhythmViewModel({
      outcome: allLoggedOutcome,
      now: new Date('2026-07-30T20:00:00'),
    }),
  }),
  no_schedule: baseModel({
    fixtureId: 'no_schedule',
    welcome: buildWelcomeViewModel({
      firstName: null,
      outcome: noScheduleOutcome,
    }),
    rhythm: buildRhythmViewModel({ outcome: noScheduleOutcome }),
  }),
  home_error: baseModel({
    fixtureId: 'home_error',
    welcome: buildWelcomeViewModel({
      firstName: 'Jordan',
      outcome: null,
      error: true,
    }),
    rhythm: buildRhythmViewModel({ outcome: null, error: true }),
  }),
  nds_empty: baseModel({
    fixtureId: 'nds_empty',
    nds: buildNdsViewModel({ data: null, isLoading: false }),
  }),
  nds_error: baseModel({
    fixtureId: 'nds_error',
    nds: buildNdsViewModel({ data: null, isLoading: false, error: true }),
  }),
  program_start_ready: baseModel({
    fixtureId: 'program_start_ready',
    programs: { status: 'ready', primarySlide: programSlide('start_ready') },
  }),
  program_active: baseModel({
    fixtureId: 'program_active',
    programs: { status: 'ready', primarySlide: programSlide('active') },
  }),
  program_recommendation: baseModel({
    fixtureId: 'program_recommendation',
    programs: {
      status: 'ready',
      primarySlide: {
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
      },
    },
  }),
  program_recommendation_pending: baseModel({
    fixtureId: 'program_recommendation_pending',
    programs: {
      status: 'ready',
      primarySlide: programSlide('completed'),
    },
  }),
  food_ready: baseModel({ fixtureId: 'food_ready' }),
  food_no_plan: baseModel({
    fixtureId: 'food_no_plan',
    food: buildFoodViewModel({
      state: 'ready',
      summary: { state: 'no_plan' } as never,
    }),
  }),
  food_no_pantry: baseModel({
    fixtureId: 'food_no_pantry',
    food: buildFoodViewModel({
      state: 'ready',
      summary: {
        state: 'no_pantry',
        active_plan: { id: 'fixture-plan', title: 'Fixture Plan' },
      } as never,
    }),
  }),
  food_no_list: baseModel({
    fixtureId: 'food_no_list',
    food: buildFoodViewModel({
      state: 'ready',
      summary: {
        state: 'no_grocery_list',
        active_plan: { id: 'fixture-plan', title: 'Fixture Plan' },
      } as never,
    }),
  }),
  food_error: baseModel({
    fixtureId: 'food_error',
    food: buildFoodViewModel({ state: 'error', summary: null }),
  }),
};

export function getAppHomeFixture(id: AppHomeFixtureId): AppHomeViewModel {
  return APP_HOME_FIXTURES[id];
}
