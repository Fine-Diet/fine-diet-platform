import type {
  ProgramMarketingCtaResolution,
  ProgramSeriesProgramDefinition,
  ProgramSeriesProgramResolution,
  ProgramSeriesCategory,
  ProgramSeriesDefinition,
} from './programSeriesTypes';

const SHARED_SERIES_IMAGE_URL =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1776806738515-Navigation-Featured-Image-Intensive.jpg';
const BASELINE_IMAGE_URL =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg';
const LIFESTYLE_IMAGE_URL =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1779826859288-woman-in-hunter-green_copy.jpg';
const ADVANCED_IMAGE_URL =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1779826953239-building-blocks.jpg';

export const PROGRAM_SERIES_CATALOGUE: ProgramSeriesDefinition[] = [
  {
    slug: 'nutrition',
    title: 'Nutrition Foundations',
    subtitle: 'A staged nutrition pathway that starts with Baseline.',
    description:
      'Built on The Fine Diet Method, Nutrition Foundations moves from a practical Baseline rhythm into focused nutrition experiments that help clarify what supports your body best.',
    category: 'nutrition',
    programSlugs: [
      'baseline',
      'digestive-foundations',
      'protein-sufficiency',
      'sugar-stability',
      'inflammation-regulation',
      'gluten-response',
      'dairy-response',
    ],
    programs: [
      {
        slug: 'baseline',
        title: 'Baseline',
        subtitle: 'Your 21-day starting rhythm',
        description:
          'Establish meal rhythm, observe patterns, and create a starting point for future recommendations.',
        lengthLabel: '21 days',
        status: 'available',
        cta: {
          label: 'Get Baseline access',
          offerKey: 'journal-annual',
          helperText:
            'Baseline access currently starts through the existing Fine Diet Journal offer path or a staff grant.',
        },
        objective:
          'Create a practical starting rhythm and observe food, routine, and body-signal patterns before choosing a more focused path.',
        whoFor: [
          'People beginning the Fine Diet Method for the first time.',
          'Members who want structure without jumping into a specialized protocol.',
          'Anyone who needs a clearer starting point before comparing future changes.',
        ],
        whatYouWillDo: [
          'Follow a simple 21-day meal and reflection rhythm.',
          'Track repeatable signals that can inform the next program choice.',
          'Use the baseline period to notice patterns without diagnosing or over-correcting.',
        ],
      },
      {
        slug: 'digestive-foundations',
        title: 'Digestive Reset',
        subtitle: 'Steadier digestion through simple routines',
        description:
          'Support digestive consistency with simple food-quality and routine adjustments.',
        lengthLabel: 'Planned',
        status: 'coming_soon',
        objective:
          'Build steadier digestive routines through practical food-quality, timing, and observation steps.',
        whoFor: [
          'Members who completed Baseline and want a digestion-focused next step.',
          'People looking for routine support before considering more specialized experiments.',
          'Users who want to notice digestive patterns without making broad claims or diagnoses.',
        ],
        whatYouWillDo: [
          'Review the patterns that showed up during Baseline.',
          'Practice simple meal-quality and routine adjustments.',
          'Use guided reflection to decide whether to continue, pause, or move to another pathway.',
        ],
      },
      {
        slug: 'protein-sufficiency',
        title: 'Protein Optimization',
        subtitle: 'Repeatable meals that hit your protein',
        description:
          'Build repeatable meals that make adequate protein easier to achieve.',
        lengthLabel: 'Planned',
        status: 'coming_soon',
        objective:
          'Make protein planning more repeatable with meals that fit the user’s routine and preferences.',
        whoFor: [
          'Members who want a clearer protein structure after establishing baseline habits.',
          'People who find it difficult to build satisfying meals consistently.',
          'Users who want practical meal planning support without performance guarantees.',
        ],
        whatYouWillDo: [
          'Identify current meal patterns that make protein easier or harder.',
          'Build repeatable meal templates around preferred foods.',
          'Practice adjusting portions and timing in a measured, sustainable way.',
        ],
      },
      {
        slug: 'sugar-stability',
        title: 'Sugar Stability',
        subtitle: 'Reduce sugar reliance without white-knuckling',
        description:
          'Build steadier energy by reducing sugar reliance while keeping meals practical and enjoyable.',
        lengthLabel: 'Planned',
        status: 'coming_soon',
        objective:
          'Reduce sugar dependence through practical swaps and meal structure, observing energy and routine without rigid restriction.',
        whoFor: [
          'Members who want steadier energy after establishing baseline habits.',
          'People who notice sugar-driven swings and want a measured approach.',
          'Users who want structure without an all-or-nothing sugar cut.',
        ],
        whatYouWillDo: [
          'Review where added sugar shows up across a typical day.',
          'Practice satisfying swaps and meal structure that reduce reliance.',
          'Reflect on energy and routine fit before deciding the next step.',
        ],
      },
      {
        slug: 'inflammation-regulation',
        title: 'Inflammation Control',
        subtitle: 'Patterns that support steadier recovery',
        description:
          'Explore dietary patterns that may support steadier energy and recovery.',
        lengthLabel: 'Planned',
        status: 'coming_soon',
        objective:
          'Explore food-pattern consistency, recovery support, and reflection without promising clinical outcomes.',
        whoFor: [
          'Members ready for a focused pattern experiment after foundational work.',
          'People who want to compare how different meals and routines feel over time.',
          'Users who need clear guardrails before changing several habits at once.',
        ],
        whatYouWillDo: [
          'Review baseline observations and choose a focused experiment.',
          'Practice consistent meals and routines that support steadier daily inputs.',
          'Reflect on energy, recovery, and routine fit before deciding the next step.',
        ],
      },
      {
        slug: 'gluten-response',
        title: 'Gluten Response',
        description:
          'A guided response pathway for understanding personal gluten tolerance signals.',
        lengthLabel: 'Planned',
        status: 'planned',
      },
      {
        slug: 'dairy-response',
        title: 'Dairy Response',
        description:
          'A guided response pathway for understanding personal dairy tolerance signals.',
        lengthLabel: 'Planned',
        status: 'planned',
      },
    ],
    heroImageUrl: BASELINE_IMAGE_URL,
    status: 'published',
    displayOrder: 10,
    cta: {
      label: 'Start with Baseline',
      href: '/programs/nutrition/baseline',
      helperText:
        'Baseline access is currently handled through existing Fine Diet Journal offers and admin grants.',
    },
    secondaryCta: {
      label: 'Manage my programs',
      href: '/app/programs',
    },
    whoFor: [
      'People who want a structured starting point before choosing a specialized nutrition path.',
      'Members who want program recommendations to build from observed patterns instead of guesswork.',
      'Anyone who wants food structure without jumping straight into restriction.',
    ],
    whatYouWillDo: [
      'Start with a 21-day Baseline rhythm.',
      'Track signals that can guide the next program choice.',
      'Move into focused pathways for digestion, protein, inflammation, or response testing as they become available.',
    ],
    metadata: {
      ownership: 'code_owned',
      futureAdminManaged: true,
    },
  },
  {
    slug: 'lifestyle',
    title: 'Lifestyle',
    subtitle: 'Programs for body composition, strength, and sustainable support.',
    description:
      'Lifestyle programs organize nutrition and daily habits around goals like leaning out, building, and maintaining support.',
    category: 'lifestyle',
    programSlugs: ['lean', 'build', 'support'],
    programs: [
      {
        slug: 'lean',
        title: 'Lean',
        description:
          'A future pathway for fat-loss support without collapsing into short-term dieting.',
        lengthLabel: 'Planned',
        status: 'planned',
      },
      {
        slug: 'build',
        title: 'Build',
        description:
          'A future pathway for strength, protein, and meal structure during building phases.',
        lengthLabel: 'Planned',
        status: 'planned',
      },
      {
        slug: 'support',
        title: 'Support',
        description:
          'A future pathway for maintenance, consistency, and daily-life nutrition support.',
        lengthLabel: 'Planned',
        status: 'planned',
      },
    ],
    heroImageUrl: LIFESTYLE_IMAGE_URL,
    status: 'published',
    displayOrder: 20,
    cta: {
      label: 'View Lifestyle pathway',
      href: '/programs/lifestyle/lean',
      disabled: false,
      helperText: 'Lifestyle programs are structure-first placeholders for now.',
    },
    secondaryCta: {
      label: 'Manage my programs',
      href: '/app/programs',
    },
    whoFor: [
      'Members with body-composition or performance-adjacent goals.',
      'People who need daily structure that can flex with training and life demands.',
      'Anyone who wants support after completing foundational nutrition work.',
    ],
    whatYouWillDo: [
      'Choose a goal-oriented pathway.',
      'Use nutrition structure to support the goal without replacing personal context.',
      'Return to Support when the goal is maintenance and consistency.',
    ],
    metadata: {
      ownership: 'code_owned',
      futureAdminManaged: true,
    },
  },
  {
    slug: 'advanced',
    title: 'Advanced',
    subtitle: 'Specialized pathways for deeper dietary experiments.',
    description:
      'Advanced programs are reserved for higher-intent protocols that need clearer guidance, safety notes, and readiness checks.',
    category: 'advanced',
    programSlugs: [
      'elimination-protocol',
      'low-fodmap',
      'sugar-reset',
      'flare-control',
    ],
    programs: [
      {
        slug: 'elimination-protocol',
        title: 'Elimination Protocol',
        description:
          'A future structured protocol for carefully removing and reintroducing selected foods.',
        lengthLabel: 'Planned',
        status: 'planned',
      },
      {
        slug: 'low-fodmap',
        title: 'Low FODMAP',
        description:
          'A future guided pathway for people ready for a more specialized digestive experiment.',
        lengthLabel: 'Planned',
        status: 'planned',
      },
      {
        slug: 'sugar-reset',
        title: 'Sugar Reset',
        description:
          'A future pathway for reducing sugar reliance while preserving practical meals.',
        lengthLabel: 'Planned',
        status: 'planned',
      },
      {
        slug: 'flare-control',
        title: 'Flare Control',
        description:
          'A future support pathway for navigating short-term symptom or routine disruption.',
        lengthLabel: 'Planned',
        status: 'planned',
      },
    ],
    heroImageUrl: ADVANCED_IMAGE_URL,
    status: 'published',
    displayOrder: 30,
    cta: {
      label: 'View Advanced pathway',
      href: '/programs/advanced/elimination-protocol',
      disabled: false,
      helperText: 'Advanced programs are placeholders until protocol details mature.',
    },
    secondaryCta: {
      label: 'Manage my programs',
      href: '/app/programs',
    },
    whoFor: [
      'Members who have already established a baseline and need a more focused protocol.',
      'People who want clear boundaries around dietary experiments.',
      'Users who need more support before changing several foods at once.',
    ],
    whatYouWillDo: [
      'Review readiness before beginning a specialized path.',
      'Follow a constrained experiment instead of making broad changes all at once.',
      'Use outcomes to decide whether to continue, pause, or return to foundational support.',
    ],
    metadata: {
      ownership: 'code_owned',
      futureAdminManaged: true,
    },
  },
];

export function getPublishedProgramSeries(): ProgramSeriesDefinition[] {
  return PROGRAM_SERIES_CATALOGUE.filter((series) => series.status === 'published')
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getProgramSeriesBySlug(
  slug: string,
): ProgramSeriesDefinition | null {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  return (
    PROGRAM_SERIES_CATALOGUE.find(
      (series) => series.slug === normalized && series.status === 'published',
    ) ?? null
  );
}

export function getProgramBySlugWithinSeries(
  series: ProgramSeriesDefinition,
  programSlug: string,
): ProgramSeriesProgramDefinition | null {
  const normalized = programSlug.trim().toLowerCase();
  if (!normalized) return null;
  return series.programs.find((program) => program.slug === normalized) ?? null;
}

export function getProgramSeriesProgramBySlugs(
  seriesSlug: string,
  programSlug: string,
): ProgramSeriesProgramResolution | null {
  const series = getProgramSeriesBySlug(seriesSlug);
  if (!series) return null;

  const program = getProgramBySlugWithinSeries(series, programSlug);
  if (!program) return null;

  const index = series.programs.findIndex((item) => item.slug === program.slug);

  return {
    series,
    program,
    index,
    previousProgram: index > 0 ? series.programs[index - 1] : null,
    nextProgram:
      index >= 0 && index < series.programs.length - 1
        ? series.programs[index + 1]
        : null,
  };
}

export function getProgramSeriesStaticPaths(): string[] {
  return getPublishedProgramSeries().map((series) => series.slug);
}

export function getProgramSeriesProgramStaticPaths(): Array<{
  series: string;
  program: string;
}> {
  return getPublishedProgramSeries().flatMap((series) =>
    series.programs.map((program) => ({
      series: series.slug,
      program: program.slug,
    })),
  );
}

function buildOfferCheckoutHref(
  offerKey: string,
  placement: string,
): string {
  const params = new URLSearchParams({
    placement,
    source: 'program_marketing',
  });
  return `/buy/${offerKey}?${params.toString()}`;
}

export function resolveProgramMarketingCta(params: {
  series: ProgramSeriesDefinition;
  program?: ProgramSeriesProgramDefinition | null;
}): ProgramMarketingCtaResolution {
  const { series, program } = params;
  const configuredCta = program?.cta ?? series.cta;
  const placement = program
    ? `program-${series.slug}-${program.slug}`
    : `program-series-${series.slug}`;
  const secondaryCta = series.secondaryCta ?? {
    label: 'Manage my programs',
    href: '/app/programs',
  };

  if (configuredCta.offerKey) {
    return {
      kind: 'checkout_link',
      label: configuredCta.label,
      href: buildOfferCheckoutHref(configuredCta.offerKey, placement),
      offerKey: configuredCta.offerKey,
      disabled: false,
      helperText: configuredCta.helperText,
      secondaryLabel: secondaryCta.label,
      secondaryHref: secondaryCta.href ?? '/app/programs',
    };
  }

  if (program && program.status !== 'available') {
    return {
      kind: 'disabled',
      label: program.status === 'coming_soon' ? 'Coming soon' : 'Planned',
      href: null,
      offerKey: null,
      disabled: true,
      helperText:
        'This program is available as a public overview while access remains closed.',
      secondaryLabel: secondaryCta.label,
      secondaryHref: secondaryCta.href ?? '/app/programs',
    };
  }

  if (configuredCta.href && !configuredCta.disabled) {
    return {
      kind: 'internal_link',
      label: configuredCta.label,
      href: configuredCta.href,
      offerKey: null,
      disabled: false,
      helperText: configuredCta.helperText,
      secondaryLabel: secondaryCta.label,
      secondaryHref: secondaryCta.href ?? '/app/programs',
    };
  }

  return {
    kind: 'account_start',
    label: configuredCta.label || 'Sign in to start',
    href: '/login?redirect=%2Fapp%2Fprograms',
    offerKey: null,
    disabled: false,
    helperText: configuredCta.helperText,
    secondaryLabel: secondaryCta.label,
    secondaryHref: secondaryCta.href ?? '/app/programs',
  };
}

export function getProgramSeriesByCategory(
  category: ProgramSeriesCategory,
): ProgramSeriesDefinition[] {
  return getPublishedProgramSeries().filter(
    (series) => series.category === category,
  );
}
