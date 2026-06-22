/**
 * Public program category content — typed, code-owned section content for the
 * `/programs/[category-slug]` surface (e.g. `/programs/nutrition`).
 *
 * This is a typed module-content contract, NOT a no-code page builder:
 *   - Each category route resolves a single `ProgramCategoryContent` object.
 *   - Specific categories are authored in `CATEGORY_CONTENT`.
 *   - Unknown / future categories get a SAFE FALLBACK derived from the series
 *     definition so the page always renders something coherent.
 *
 * The program sequence itself is NOT stored here — it stays input-defined from
 * the series catalogue / offer tree and is rendered by `ProgramCardGrid`.
 */

import type { ProgramSeriesDefinition } from './programSeriesTypes';

export interface CategoryProcessStep {
  stepNumber: number;
  /** Short timing/label, e.g. "Day 1" or "Week 1". */
  label: string;
  title: string;
  description: string;
}

export interface CategoryDifferentiator {
  title: string;
  description: string;
}

export interface CategoryComparisonRow {
  aspect: string;
  fineDiet: string;
  typical: string;
}

export interface CategoryFaqItem {
  question: string;
  answer: string;
}

export interface CategoryAppIntegration {
  heading: string;
  body: string;
  reasons: Array<{ label: string; sentence: string }>;
  /**
   * Optional supporting image. When absent, the section renders the
   * reasons-only ("reasons-split fallback") layout.
   */
  imageUrl?: string;
  imageAlt?: string;
}

export interface ProgramCategoryContent {
  eyebrow: string;
  heroHeadline: string;
  heroSubhead: string;
  howItWorksHeading: string;
  process: CategoryProcessStep[];
  introHeading: string;
  introBody: string;
  cardGridHeading: string;
  cardGridSubhead?: string;
  differentiatorsHeading: string;
  differentiators: CategoryDifferentiator[];
  appIntegration: CategoryAppIntegration;
  comparisonHeading: string;
  comparison: CategoryComparisonRow[];
  faqHeading: string;
  faq: CategoryFaqItem[];
  finalCtaHeadline: string;
  finalCtaBody?: string;
}

const APP_INTEGRATION_IMAGE_URL =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg';

const NUTRITION_CATEGORY_CONTENT: ProgramCategoryContent = {
  eyebrow: 'Nutrition category',
  heroHeadline: 'The most comprehensive,\nself-led nutrition program',
  heroSubhead:
    'Nutrition Foundations is a staged pathway built on The Fine Diet Method. Start with Baseline, then extend into focused programs as they fit your goals.',
  howItWorksHeading: 'How this program works',
  process: [
    {
      stepNumber: 1,
      label: 'Days 1–21',
      title: 'Establish your Baseline',
      description:
        'Follow a practical 21-day rhythm and observe food, routine, and body-signal patterns before changing anything drastic.',
    },
    {
      stepNumber: 2,
      label: 'After Baseline',
      title: 'Read your signals',
      description:
        'Use what Baseline revealed to choose a focused next program instead of guessing or restarting from scratch.',
    },
    {
      stepNumber: 3,
      label: 'Ongoing',
      title: 'Extend what works',
      description:
        'Move into digestion, protein, sugar, or inflammation programs as they fit — each one builds on the last.',
    },
  ],
  introHeading: 'Start by building a foundation you can extend',
  introBody:
    'Most plans hand you one rigid protocol. Nutrition Foundations begins with a shared Baseline, then lets you add focused programs over time so progress compounds instead of resetting.',
  cardGridHeading: 'The Nutrition Foundations sequence',
  cardGridSubhead:
    'Everyone starts with Baseline. Each later program is a public overview here — delivery happens in the signed-in app.',
  differentiatorsHeading: 'What makes Nutrition Foundations different',
  differentiators: [
    {
      title: 'Self-led, not hand-held',
      description:
        'You move at your own pace with clear structure, instead of waiting on weekly check-ins to make progress.',
    },
    {
      title: 'Pattern-first',
      description:
        'Baseline gives you a real starting point, so later choices are based on your signals — not a generic template.',
    },
    {
      title: 'Built to compound',
      description:
        'Each program extends the last, so you keep what works instead of starting over every few weeks.',
    },
  ],
  appIntegration: {
    heading: 'Built to live in the Fine Diet App',
    body:
      'Public program pages are overviews. Inside the app, programs connect to your journal so structure and tracking work together.',
    reasons: [
      {
        label: 'Journal-connected',
        sentence:
          'Programs read from the same journal you already use to log meals and signals.',
      },
      {
        label: 'Delivery in the app',
        sentence:
          'Enrollment, check-ins, and weekly guidance live in the signed-in app, not on these public pages.',
      },
      {
        label: 'No auto-enroll',
        sentence:
          'Browsing here never changes your account — you choose when to start.',
      },
    ],
    imageUrl: APP_INTEGRATION_IMAGE_URL,
    imageAlt: 'The Fine Diet app on a tablet',
  },
  comparisonHeading: 'Built differently than most nutrition programs',
  comparison: [
    {
      aspect: 'Starting point',
      fineDiet: 'A shared Baseline you observe before changing things',
      typical: 'A fixed protocol from day one',
    },
    {
      aspect: 'Path',
      fineDiet: 'Staged programs you add as they fit',
      typical: 'One plan, all-or-nothing',
    },
    {
      aspect: 'Progress',
      fineDiet: 'Compounds — each program builds on the last',
      typical: 'Resets when the plan ends',
    },
    {
      aspect: 'Pace',
      fineDiet: 'Self-led, on your schedule',
      typical: 'Tied to coaching cadence',
    },
  ],
  faqHeading: 'Frequently asked',
  faq: [
    {
      question: 'Where do I start?',
      answer:
        'Everyone starts with Baseline, the first program in Nutrition Foundations. It establishes a 21-day rhythm and a starting point future programs build from.',
    },
    {
      question: 'Is this a restriction diet?',
      answer:
        'No. You add structure and observe patterns before deciding whether a more focused program fits. Nothing is removed all at once.',
    },
    {
      question: 'Do I need the app?',
      answer:
        'These pages are public overviews. Active enrollment, check-ins, and delivery happen in the signed-in Fine Diet app once you have access.',
    },
    {
      question: 'When are the later programs available?',
      answer:
        'Baseline is available now. Digestion, protein, sugar, and inflammation programs are staged and roll out over time.',
    },
  ],
  finalCtaHeadline: 'Your nutrition will never need another restart',
  finalCtaBody:
    'Start with Baseline and build a foundation you can extend.',
};

const CATEGORY_CONTENT: Record<string, ProgramCategoryContent> = {
  nutrition: NUTRITION_CATEGORY_CONTENT,
};

/**
 * Safe fallback — derive coherent category content from the series definition
 * so any future / DB-authored category route still renders without bespoke copy.
 */
function buildFallbackContent(
  series: ProgramSeriesDefinition,
): ProgramCategoryContent {
  const reasons = series.whatYouWillDo.slice(0, 3).map((sentence, i) => ({
    label: `Step ${i + 1}`,
    sentence,
  }));

  return {
    eyebrow: 'Program category',
    heroHeadline: series.title,
    heroSubhead: series.subtitle || series.description,
    howItWorksHeading: 'How this program works',
    process: series.whatYouWillDo.slice(0, 3).map((description, i) => ({
      stepNumber: i + 1,
      label: `Step ${i + 1}`,
      title: `Step ${i + 1}`,
      description,
    })),
    introHeading: 'What this pathway covers',
    introBody: series.description,
    cardGridHeading: `The ${series.title} sequence`,
    cardGridSubhead:
      'Each program is a public overview — delivery happens in the signed-in app.',
    differentiatorsHeading: `What makes ${series.title} different`,
    differentiators: series.whoFor.slice(0, 3).map((description) => ({
      title: 'Who it is for',
      description,
    })),
    appIntegration: {
      heading: 'Built to live in the Fine Diet App',
      body:
        'Public program pages are overviews. Enrollment, check-ins, and delivery live in the signed-in app.',
      reasons:
        reasons.length > 0
          ? reasons
          : [
              {
                label: 'In the app',
                sentence:
                  'Enrollment, check-ins, and weekly guidance live in the signed-in app.',
              },
            ],
    },
    comparisonHeading: 'Built differently than most programs',
    comparison: [
      {
        aspect: 'Path',
        fineDiet: 'Staged programs you add as they fit',
        typical: 'One plan, all-or-nothing',
      },
      {
        aspect: 'Progress',
        fineDiet: 'Compounds across programs',
        typical: 'Resets when the plan ends',
      },
    ],
    faqHeading: 'Frequently asked',
    faq: [
      {
        question: 'Where do I start?',
        answer:
          series.programs.length > 0
            ? `Start with ${series.programs[0].title}, the first program in ${series.title}.`
            : `Start with the first program in ${series.title}.`,
      },
      {
        question: 'Do I need the app?',
        answer:
          'These pages are public overviews. Active enrollment and delivery happen in the signed-in app.',
      },
    ],
    finalCtaHeadline: series.title,
    finalCtaBody: series.subtitle || undefined,
  };
}

export function resolveProgramCategoryContent(
  series: ProgramSeriesDefinition,
): ProgramCategoryContent {
  return CATEGORY_CONTENT[series.slug] ?? buildFallbackContent(series);
}
