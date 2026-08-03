/**
 * App Home adapters — NDS rail, Rhythm VM, Food card, Programs primary slide.
 */

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

export function buildNdsViewModel({
  data,
  isLoading,
  error,
}: {
  data: NDSData | null;
  isLoading: boolean;
  error?: boolean;
}): AppHomeNdsViewModel {
  if (isLoading) {
    return {
      status: 'loading',
      metrics: [
        { id: 'overall', label: 'Overall Score', value: 'Pending' },
        { id: 'wfr', label: 'Whole Food Ratio', value: 'Pending' },
        { id: 'ps', label: 'Protein Sufficiency', value: 'Pending' },
      ],
    };
  }

  if (error) {
    return {
      status: 'error',
      metrics: [
        { id: 'overall', label: 'Overall Score', value: 'Unavailable' },
        { id: 'wfr', label: 'Whole Food Ratio', value: 'Unavailable' },
        { id: 'ps', label: 'Protein Sufficiency', value: 'Unavailable' },
      ],
      errorMessage: 'Nutrition density is temporarily unavailable.',
    };
  }

  const hasInput = Boolean(
    (data?._meta?.intake_count ?? 0) > 0 ||
      (data?._meta?.meal_count ?? 0) > 0 ||
      (data?.nds_score_100 ?? 0) > 0,
  );

  if (!data || !hasInput) {
    return {
      status: 'empty',
      metrics: [
        { id: 'overall', label: 'Overall Score', value: NO_INPUT },
        { id: 'wfr', label: 'Whole Food Ratio', value: NO_INPUT },
        { id: 'ps', label: 'Protein Sufficiency', value: NO_INPUT },
        { id: 'fiber', label: 'Fiber', value: NO_INPUT },
      ],
    };
  }

  const overall = Math.round(data.nds_score_100);
  const wfr = data.readings?.wfr_percent;
  const protein = data.readings?.protein_score_10 ?? data.subscores_10.ps;
  const fiber = data.readings?.fiber_g;
  const fiberSub = data.subscores_10?.fp;

  return {
    status: 'populated',
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
        value:
          fiber !== null && fiber !== undefined && !Number.isNaN(fiber)
            ? `${Number.isInteger(fiber) ? fiber : Number(fiber).toFixed(1)}g`
            : fiberSub !== null && fiberSub !== undefined && !Number.isNaN(fiberSub)
              ? `${fiberSub}/10`
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
      ctaHref: APP_ROUTES.foodGroceries,
    };
  }

  const groceryHref = readinessGroceryHref(summary) ?? APP_ROUTES.foodGroceries;
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
