/**
 * App Home adapters — NDS rail, Rhythm VM, Food card, Programs primary slide.
 */

import type { DailyNdsState } from '@/lib/nds/dailyNdsState';
import type { NDSData } from '@/lib/nds/useNDS';
import { buildHeroViewModelFromRuntime } from '@/lib/programs/home/adapters';
import type { ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';
import {
  readinessGroceryHref,
  type PantryReadinessLoadState,
} from '@/lib/plans/usePantryReadiness';
import type { PantryReadinessSummary } from '@/lib/plans/types';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { PROGRAMS_HOME_BASELINE_DEFAULT_COPY } from '@/lib/programs/home/seeds';

import {
  buildGreeting,
  buildWelcomeSupportCopy,
  formatSlotTimeLabel,
  resolveNextMeal,
  type NextMealResolverOutcome,
} from './nextMealResolver';
import type {
  AppHomeFoodViewModel,
  AppHomeNdsViewModel,
  AppHomeProgramsViewModel,
  AppHomeRhythmSlot,
  AppHomeRhythmViewModel,
  AppHomeWelcomeViewModel,
} from './types';

export const APP_HOME_FOOD_IMAGE_URL =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1779826953239-building-blocks.jpg';

export const APP_HOME_PROGRAMS_IMAGE_URL =
  PROGRAMS_HOME_BASELINE_DEFAULT_COPY.imageUrl;

const NO_INPUT = '–';

export function buildWelcomeViewModel({
  firstName,
  outcome,
  loading = false,
  error = false,
}: {
  firstName?: string | null;
  outcome: NextMealResolverOutcome | null;
  loading?: boolean;
  error?: boolean;
}): AppHomeWelcomeViewModel {
  const greeting = buildGreeting(firstName);

  if (loading) {
    return {
      status: 'loading',
      greeting,
      supportCopy: '',
      ctaLabel: '',
      ctaHref: APP_ROUTES.log,
      actionableSlotKey: null,
    };
  }

  if (error || !outcome) {
    return {
      status: 'error',
      greeting,
      supportCopy: 'We couldn’t load today’s guidance. You can still open your log.',
      ctaLabel: 'Open Log',
      ctaHref: APP_ROUTES.log,
      actionableSlotKey: null,
    };
  }

  const support = buildWelcomeSupportCopy(outcome);
  return {
    status:
      outcome.kind === 'next_meal'
        ? 'next_meal'
        : outcome.kind === 'all_logged'
          ? 'all_logged'
          : 'no_schedule',
    greeting,
    ...support,
  };
}

/** Every metric reads the same when there is no number behind any of them. */
function uniformNdsMetrics(value: string): AppHomeNdsViewModel['metrics'] {
  return [
    { id: 'overall', label: 'Overall Score', value },
    { id: 'wfr', label: 'Whole Food Ratio', value },
    { id: 'ps', label: 'Protein Sufficiency', value },
    { id: 'fiber', label: 'Fiber', value },
  ];
}

/**
 * NDS Integrity v1: the rail branches on the server's state rather than on
 * whether a number happened to be greater than zero.
 *
 * The old `hasInput` heuristic treated a score of 0 as proof that nothing was
 * logged, so a genuinely poor day and an empty day rendered identically, and a
 * failed computation rendered as an empty day too. Each of those is now its own
 * branch with its own words.
 */
export function buildNdsViewModel({
  data,
  isLoading,
  error,
  state,
}: {
  data: NDSData | null;
  isLoading: boolean;
  error?: boolean;
  /** The server's state. Omitted only by fixtures, which supply `data` directly. */
  state?: DailyNdsState | null;
}): AppHomeNdsViewModel {
  if (isLoading) {
    return { status: 'loading', metrics: uniformNdsMetrics('Pending') };
  }

  // `error` is a failure to reach the score; `unavailable` is the server telling
  // us it could not produce one. Both mean the same thing to a reader.
  if (error || state?.state === 'unavailable') {
    return {
      status: 'error',
      metrics: uniformNdsMetrics('Unavailable'),
      errorMessage: 'Nutrition density is temporarily unavailable.',
    };
  }

  if (state?.state === 'insufficient_data') {
    return {
      status: 'empty',
      metrics: uniformNdsMetrics('Not scored'),
      // Says whose gap it is. Presenting this as a low score would blame the
      // person for missing data on our side.
      errorMessage: "Today's entries don't yet include enough detail to score.",
    };
  }

  if (!data) {
    return { status: 'empty', metrics: uniformNdsMetrics(NO_INPUT) };
  }

  const overall = Math.round(data.nds_score_100);
  const wfr = data.readings?.wfr_percent;
  const protein = data.readings?.protein_score_10 ?? data.subscores_10.ps;
  const fiber = data.readings?.fiber_g;

  return {
    status: 'populated',
    // A score computed before the newest entry is labelled, not passed off as
    // current. The number is real; it is just not caught up yet.
    note: data.is_provisional ? 'Updating with your latest entry.' : undefined,
    metrics: [
      { id: 'overall', label: 'Overall Score', value: String(overall) },
      {
        id: 'wfr',
        label: 'Whole Food Ratio',
        value:
          wfr === null || wfr === undefined || Number.isNaN(wfr)
            ? NO_INPUT
            : `${Math.round(wfr)}%`,
      },
      {
        id: 'ps',
        label: 'Protein Sufficiency',
        value:
          protein === null || protein === undefined || Number.isNaN(protein)
            ? NO_INPUT
            : `${Number.isInteger(protein) ? protein : protein.toFixed(1)}/10`,
      },
      {
        id: 'fiber',
        label: 'Fiber',
        // No fall back to the fiber SUBSCORE when the gram figure is unknown.
        // The subscore is derived from the grams, so printing it here would
        // present a number computed from an absent measurement.
        value:
          fiber !== null && fiber !== undefined && !Number.isNaN(fiber)
            ? `${Number.isInteger(fiber) ? fiber : Number(fiber).toFixed(1)}g`
            : NO_INPUT,
      },
    ],
  };
}

export function buildRhythmViewModel({
  outcome,
  loading = false,
  error = false,
  now = new Date(),
}: {
  outcome: NextMealResolverOutcome | null;
  loading?: boolean;
  error?: boolean;
  now?: Date;
}): AppHomeRhythmViewModel {
  if (loading) {
    return {
      status: 'loading',
      slots: [],
      actionableSlotKey: null,
      setupHref: APP_ROUTES.profile,
    };
  }

  if (error) {
    return {
      status: 'error',
      slots: [],
      actionableSlotKey: null,
      setupHref: APP_ROUTES.profile,
    };
  }

  if (!outcome || outcome.kind === 'no_schedule') {
    return {
      status: 'no_schedule',
      slots: [],
      actionableSlotKey: null,
      setupHref: APP_ROUTES.profile,
    };
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const slots: AppHomeRhythmSlot[] = outcome.slots.map((slot) => {
    const [h, m] = slot.targetTime.split(':').map(Number);
    const slotMinutes = (h ?? 0) * 60 + (m ?? 0);
    let state: AppHomeRhythmSlot['state'];
    if (slot.logged) state = 'logged';
    else if (slot.actionable) state = 'actionable';
    else if (slotMinutes < nowMinutes) state = 'past_unlogged';
    else state = 'future_unlogged';

    return {
      slotKey: slot.slotKey,
      label: slot.slotLabel,
      targetTime: slot.targetTime,
      targetTimeLabel: formatSlotTimeLabel(slot.targetTime),
      state,
      entryId: slot.entryId,
      href: slot.logged && slot.editHref ? slot.editHref : slot.logHref,
      actionable: slot.actionable,
    };
  });

  return {
    status: 'ready',
    slots,
    actionableSlotKey:
      outcome.kind === 'next_meal' ? outcome.actionable.slotKey : null,
    setupHref: APP_ROUTES.profile,
  };
}

export function buildProgramsViewModelFromRuntime({
  hasAccess,
  summary,
  loading = false,
  errorMessage,
}: {
  hasAccess: boolean;
  summary: ProgramRuntimeSummary | null;
  loading?: boolean;
  errorMessage?: string;
}): AppHomeProgramsViewModel {
  const hero = buildHeroViewModelFromRuntime({
    hasAccess,
    summary,
    loading,
    errorMessage,
  });

  if (hero.status === 'loading') {
    return { status: 'loading', primarySlide: hero.slides[0] ?? null };
  }

  if (hero.status === 'runtime_error') {
    return {
      status: 'runtime_error',
      primarySlide: hero.slides[0] ?? null,
      errorMessage: hero.errorMessage,
    };
  }

  return {
    status: 'ready',
    primarySlide: hero.slides[0] ?? null,
  };
}

export function buildFoodViewModel({
  state,
  summary,
}: {
  state: PantryReadinessLoadState | 'fixture';
  summary: PantryReadinessSummary | null;
}): AppHomeFoodViewModel {
  const base = {
    eyebrow: 'Food' as const,
    imageUrl: '/images/home/health-reset-desktop.jpg',
  };

  if (state === 'loading') {
    return {
      ...base,
      status: 'loading',
      title: 'Preparing your food readiness…',
      description: 'Checking plan, Pantry, and grocery context.',
      ctaLabel: 'Open Food',
      ctaHref: APP_ROUTES.food,
    };
  }

  if (state === 'error') {
    return {
      ...base,
      status: 'error',
      title: 'Food readiness is temporarily unavailable',
      description: 'You can still open Food to manage Pantry and grocery lists.',
      ctaLabel: 'Open Food',
      ctaHref: APP_ROUTES.food,
    };
  }

  if (!summary || summary.state === 'no_plan') {
    return {
      ...base,
      status: 'no_plan',
      title: 'Connect a plan to guide grocery readiness',
      description:
        'Start or open a plan so Pantry and grocery prep can align with what you intend to cook.',
      ctaLabel: 'Open Plans',
      ctaHref: APP_ROUTES.plans,
    };
  }

  if (summary.state === 'no_pantry') {
    return {
      ...base,
      status: 'no_pantry',
      title: 'Add what you already have in Pantry',
      description:
        'Saving on-hand items helps Fine Diet reduce what you still need to buy for upcoming lists.',
      ctaLabel: 'Open Pantry',
      ctaHref: APP_ROUTES.foodPantry,
    };
  }

  if (summary.state === 'no_grocery_list') {
    return {
      ...base,
      status: 'no_list',
      title: 'Generate your next grocery list',
      description:
        'Create or open a grocery list so haul prep can stay aligned with your active plan.',
      ctaLabel: 'Open Food',
      ctaHref: APP_ROUTES.foodLists,
    };
  }

  const groceryHref = readinessGroceryHref(summary) ?? APP_ROUTES.foodLists;
  const needsReview = summary.coverage
    ? summary.coverage.rows_unit_or_amount_review +
      summary.coverage.rows_unresolved_identity
    : 0;

  return {
    ...base,
    status: 'ready',
    title:
      'Prepare for scheduled grocery hauls and quick pickups that align with your plans.',
    description:
      needsReview > 0
        ? 'Some grocery rows need review before Pantry can apply. Stay current on essentials, perishables, and list items.'
        : 'Stay up to date with your essential, perishable and additional items or generate your next grocery list.',
    ctaLabel: needsReview > 0 ? 'Review List' : 'Get Ready',
    ctaHref: groceryHref,
  };
}

// Re-export for fixtures that need Programs fixture slides
export { buildHeroViewModelFromRuntime, buildBaselineHeroSlides } from '@/lib/programs/home/adapters';
export { resolveNextMeal } from './nextMealResolver';
