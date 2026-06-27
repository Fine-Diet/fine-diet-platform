/**
 * Programs Marketing — Code-backed reusable starting templates (PR-B)
 *
 * MVP, code-owned starting points for the Programs marketing composition editor.
 * Each template is a known-good ordered array of typed module instances using the
 * existing module types + content schemas (lib/modules/types.ts + schema.ts).
 *
 * Design notes:
 *   - Templates are typed as `ModuleInstance[]`, so the TypeScript compiler
 *     enforces schema-shaped content at authoring time, and a focused test
 *     re-checks every template against the PR-A runtime inspector
 *     (inspectModules) so applied templates never introduce validation errors
 *     by default.
 *   - This registry is PURE DATA. Importing it never reads/writes Supabase,
 *     `site_content`, or any other store — there is no auto-seeding. Templates
 *     only populate the editor draft; admins still Save draft / Publish through
 *     the existing endpoints.
 *   - Resolver-driven modules (grid.program-cards / nav.program-pathway /
 *     cta.program-offer) carry PLACEHOLDER slugs (`collection-slug` /
 *     `program-slug`) that the admin replaces with real Collection/Program
 *     slugs. They are schema-valid strings, so the template is valid by default.
 *   - Domain vocabulary: Category → Collection → Program → Version → Module.
 *     No season/episode language.
 *
 * Future (approval-gated, NOT implemented here): a persistent DB-backed template
 * library and any template-publishing endpoint. See PR-B report follow-ups.
 */

import type { ModuleInstance } from './types';

/** Placeholder slugs admins replace with real catalogue slugs after applying. */
const PLACEHOLDER_COLLECTION_SLUG = 'collection-slug';
const PLACEHOLDER_PROGRAM_SLUG = 'program-slug';

/** Neutral placeholder image used by templated hero/feature modules. */
const PLACEHOLDER_IMAGE =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg';

/** Which authoring surface a template is shaped for. */
export type ProgramsTemplateKind = 'collection' | 'program' | 'starter';

export interface ProgramsCompositionTemplate {
  /** Stable registry id (used as the picker option value). */
  id: string;
  /** Human-readable name shown in the editor picker. */
  name: string;
  /** Short description of what the template scaffolds. */
  description: string;
  /** Authoring surface this template targets. */
  kind: ProgramsTemplateKind;
  /** Ordered, known-good module instances populated into the editor draft. */
  modules: ModuleInstance[];
}

// ── Templates ────────────────────────────────────────────────────────────────

/**
 * Collection landing page — mirrors the shape of a Collection overview
 * (e.g. the Nutrition Foundations landing): hero, collection offer, how-it-works
 * process, the resolver-driven Program sequence grid, app integration, ambient
 * strip, differentiators, comparison, FAQ, and a closing offer.
 */
const collectionLandingTemplate: ProgramsCompositionTemplate = {
  id: 'programs-collection-landing',
  name: 'Collection landing page',
  description:
    'Full Collection overview: hero, offer band, how-it-works, Program sequence grid, differentiators, comparison, FAQ, and closing CTA.',
  kind: 'collection',
  modules: [
    {
      id: 'hero',
      type: 'hero.standard.v1',
      content: {
        headline: 'Collection headline goes here',
        subheadline:
          'One-sentence description of this Collection and the staged pathway it offers.',
        images: {
          desktop: PLACEHOLDER_IMAGE,
          mobile: PLACEHOLDER_IMAGE,
          alt: 'Collection hero image',
        },
        height: 'medium',
      },
    },
    {
      id: 'collection-cta',
      type: 'cta.program-offer.v1',
      content: {
        collectionSlug: PLACEHOLDER_COLLECTION_SLUG,
        eyebrow: 'Collection',
        heading: 'Start by building a foundation you can extend',
        body: 'Explain how this Collection begins with a shared starting point, then lets members add focused Programs over time.',
        align: 'center',
        surface: 'light',
      },
    },
    {
      id: 'how-it-works',
      type: 'process.slide-stack.v1',
      content: {
        heading: 'How this Collection works',
        defaultOpenIndex: 0,
        steps: [
          {
            stepNumber: 1,
            label: 'Step one',
            title: 'Establish your starting point',
            lines: ['Describe the first stage members complete in this Collection.'],
            imageDesktop: PLACEHOLDER_IMAGE,
            imageMobile: PLACEHOLDER_IMAGE,
          },
          {
            stepNumber: 2,
            label: 'Step two',
            title: 'Read your signals',
            lines: ['Describe how members use what they learned to choose the next Program.'],
            imageDesktop: PLACEHOLDER_IMAGE,
            imageMobile: PLACEHOLDER_IMAGE,
          },
          {
            stepNumber: 3,
            label: 'Ongoing',
            title: 'Extend what works',
            lines: ['Describe how later Programs build on the earlier ones.'],
            imageDesktop: PLACEHOLDER_IMAGE,
            imageMobile: PLACEHOLDER_IMAGE,
          },
        ],
      },
    },
    {
      id: 'program-sequence',
      type: 'grid.program-cards.v1',
      content: {
        collectionSlug: PLACEHOLDER_COLLECTION_SLUG,
        heading: 'The Program sequence',
        subhead:
          'Replace the collection slug above with a real Collection. Cards, order, and links are resolved from the catalogue.',
      },
    },
    {
      id: 'app-integration',
      type: 'feature.reasons-split.v1',
      content: {
        heading: 'Every Program works with your journal',
        items: [
          { label: 'Plan', sentence: 'Set a realistic weekly rhythm around the Program you are running.' },
          { label: 'Log', sentence: 'Capture meals, timing, and how your body responded as you go.' },
          { label: 'Learn', sentence: 'See the patterns your starting Program surfaces so the next step is informed.' },
          { label: 'Repeat', sentence: 'Keep what works and extend it into the next focused Program.' },
        ],
        imageDesktop: PLACEHOLDER_IMAGE,
        imageMobile: PLACEHOLDER_IMAGE,
        imageAlt: 'The app on a tablet',
      },
    },
    {
      id: 'marquee',
      type: 'ambient.marquee-strip.v1',
      content: {
        text: 'EDIT THIS STRIP — SHORT, PUNCHY, ALL CAPS.',
        speed: 50,
        direction: 'left',
        pauseOnHover: true,
      },
    },
    {
      id: 'differentiators',
      type: 'feature.icon-tiles.v1',
      content: {
        heading: 'What makes this Collection different',
        intro: 'Explain the core philosophy behind this Collection in one short paragraph.',
        surface: 'dark',
        tiles: [
          { icon: 'programs', title: 'Stabilize first', description: 'Describe the first differentiator.' },
          { icon: 'notebook', title: 'Follow the signal', description: 'Describe the second differentiator.' },
          { icon: 'quadrants', title: 'Built into your journal', description: 'Describe the third differentiator.' },
        ],
      },
    },
    {
      id: 'comparison',
      type: 'comparison.table.v1',
      content: {
        heading: 'Built differently than most programs',
        columns: { left: 'Our Programs', right: 'Most Programs' },
        rows: [
          { left: 'A shared starting point you observe before changing things', right: 'A fixed protocol from day one' },
          { left: 'Staged Programs you add as they fit', right: 'One plan, all-or-nothing' },
          { left: 'Compounds — each Program builds on the last', right: 'Resets when the plan ends' },
          { left: 'Self-led, on your schedule', right: 'Tied to coaching cadence' },
        ],
      },
    },
    {
      id: 'faq',
      type: 'faq.accordion.v2',
      content: {
        title: 'Frequently asked',
        defaultOpenIndex: 0,
        items: [
          { id: 'faq-0', question: 'Where do I start?', answer: 'Answer the most common first question here.' },
          { id: 'faq-1', question: 'Is this a restriction plan?', answer: 'Clarify the approach here.' },
          { id: 'faq-2', question: 'Do I need the app?', answer: 'Explain how delivery works in the signed-in app.' },
        ],
      },
    },
    {
      id: 'final-cta',
      type: 'cta.program-offer.v1',
      content: {
        collectionSlug: PLACEHOLDER_COLLECTION_SLUG,
        heading: 'Closing call to action',
        body: 'One closing sentence that reinforces the Collection promise.',
        align: 'center',
        surface: 'dark',
      },
    },
  ],
};

/**
 * Program detail page — mirrors the shape of a single Program page
 * (e.g. a Baseline Program): hero, program offer, resolver-driven pathway nav,
 * "who it is for" + "what you will do" card grids, and a closing offer.
 */
const programDetailTemplate: ProgramsCompositionTemplate = {
  id: 'programs-program-detail',
  name: 'Program detail page',
  description:
    'Single Program page: hero, Program offer band, pathway navigation, who-it-is-for and what-you-will-do grids, and closing CTA.',
  kind: 'program',
  modules: [
    {
      id: 'hero',
      type: 'hero.standard.v1',
      content: {
        headline: 'Program name',
        subheadline: 'A short tagline for this Program.',
        body: 'One or two sentences describing what this Program helps members accomplish.',
        images: {
          desktop: PLACEHOLDER_IMAGE,
          mobile: PLACEHOLDER_IMAGE,
          alt: 'Program hero image',
        },
        height: 'medium',
      },
    },
    {
      id: 'program-cta',
      type: 'cta.program-offer.v1',
      content: {
        collectionSlug: PLACEHOLDER_COLLECTION_SLUG,
        programSlug: PLACEHOLDER_PROGRAM_SLUG,
        eyebrow: 'Program',
        heading: 'Program name',
        body: 'Describe the offer and what starting this Program involves.',
        align: 'left',
        surface: 'light',
      },
    },
    {
      id: 'pathway',
      type: 'nav.program-pathway.v1',
      content: {
        collectionSlug: PLACEHOLDER_COLLECTION_SLUG,
        programSlug: PLACEHOLDER_PROGRAM_SLUG,
      },
    },
    {
      id: 'who-for',
      type: 'grid.cards.v1',
      content: {
        title: 'Who it is for',
        items: [
          { id: 'who-0', title: 'Describe the first type of member this Program fits.' },
          { id: 'who-1', title: 'Describe the second type of member this Program fits.' },
          { id: 'who-2', title: 'Describe the third type of member this Program fits.' },
        ],
      },
    },
    {
      id: 'what-you-will-do',
      type: 'grid.cards.v1',
      content: {
        title: 'What you will do',
        items: [
          { id: 'do-0', title: 'Describe the first thing members do in this Program.' },
          { id: 'do-1', title: 'Describe the second thing members do in this Program.' },
          { id: 'do-2', title: 'Describe the third thing members do in this Program.' },
        ],
      },
    },
    {
      id: 'final-cta',
      type: 'cta.program-offer.v1',
      content: {
        collectionSlug: PLACEHOLDER_COLLECTION_SLUG,
        programSlug: PLACEHOLDER_PROGRAM_SLUG,
        heading: 'Start this Program',
        body: 'One closing sentence that motivates the member to begin.',
        align: 'center',
        surface: 'dark',
      },
    },
  ],
};

/**
 * Minimal starter — the smallest valid scaffold (hero + offer band + FAQ) for
 * authors who prefer to build up from a clean base.
 */
const minimalStarterTemplate: ProgramsCompositionTemplate = {
  id: 'programs-minimal-starter',
  name: 'Minimal starter',
  description: 'A clean base: a hero, a single CTA band, and a short FAQ.',
  kind: 'starter',
  modules: [
    {
      id: 'hero',
      type: 'hero.standard.v1',
      content: {
        headline: 'Headline goes here',
        subheadline: 'A short supporting subheadline.',
        images: {
          desktop: PLACEHOLDER_IMAGE,
          mobile: PLACEHOLDER_IMAGE,
          alt: 'Hero image',
        },
        height: 'medium',
      },
    },
    {
      id: 'cta',
      type: 'cta.band.v1',
      content: {
        headline: 'Call to action headline',
        body: 'One supporting sentence for the call to action.',
        button: { label: 'Learn more', href: '#', variant: 'primary' },
      },
    },
    {
      id: 'faq',
      type: 'faq.accordion.v2',
      content: {
        title: 'Frequently asked',
        items: [
          { id: 'faq-0', question: 'First question?', answer: 'First answer.' },
          { id: 'faq-1', question: 'Second question?', answer: 'Second answer.' },
        ],
      },
    },
  ],
};

/**
 * Nutrition Foundations page (legacy JSON order) — the older
 * data/compositions/programs--nutrition.json shape.
 *
 * Source: data/compositions/programs--nutrition.json (also mirrored in
 * scripts/sql/seedProgramsMarketingDraftContent.sql). This JSON order does NOT
 * match the rendered preview-era static /programs/nutrition page (it placed the
 * offer band before how-it-works and app-integration before marquee/
 * differentiators). Retained for reference/back-compat; for parity with the live
 * preview prefer `nutritionFoundationsPreviewTemplate` below.
 *
 * Module order (10): hero, collection-cta, how-it-works, program-sequence,
 * app-integration, marquee, differentiators, comparison, faq, final-cta.
 */
const nutritionFoundationsTemplate: ProgramsCompositionTemplate = {
  id: 'programs-nutrition-foundations',
  name: 'Nutrition Foundations page (legacy JSON order)',
  description:
    'Older data/compositions JSON order: hero, offer band, how-it-works, Program sequence, journal integration, marquee, differentiators, comparison, FAQ, closing CTA. Prefer the preview-parity template for the live /programs/nutrition section order.',
  kind: 'collection',
  modules: [
    {
      id: 'hero',
      type: 'hero.standard.v1',
      content: {
        headline: 'The most comprehensive,\nself-led nutrition program',
        subheadline:
          'Nutrition Foundations is a staged pathway built on The Fine Diet Method. Start with Baseline, then extend into focused programs as they fit your goals.',
        images: {
          desktop: PLACEHOLDER_IMAGE,
          mobile: PLACEHOLDER_IMAGE,
          alt: 'Fine Diet Nutrition Foundations',
        },
        height: 'medium',
      },
    },
    {
      id: 'collection-cta',
      type: 'cta.program-offer.v1',
      content: {
        collectionSlug: 'nutrition',
        eyebrow: 'Nutrition Foundations',
        heading: 'Start by building a foundation you can extend',
        body: 'Most plans hand you one rigid protocol. Nutrition Foundations begins with a shared Baseline, then lets you add focused programs over time so progress compounds instead of resetting.',
        align: 'center',
        surface: 'light',
      },
    },
    {
      id: 'how-it-works',
      type: 'process.slide-stack.v1',
      content: {
        heading: 'How this program works',
        defaultOpenIndex: 0,
        steps: [
          {
            stepNumber: 1,
            label: 'Days 1–21',
            title: 'Establish your Baseline',
            lines: [
              'Follow a practical 21-day rhythm and observe food, routine, and body-signal patterns before changing anything drastic.',
            ],
            imageDesktop: PLACEHOLDER_IMAGE,
            imageMobile: PLACEHOLDER_IMAGE,
          },
          {
            stepNumber: 2,
            label: 'After Baseline',
            title: 'Read your signals',
            lines: [
              'Use what Baseline revealed to choose a focused next program instead of guessing or restarting from scratch.',
            ],
            imageDesktop: PLACEHOLDER_IMAGE,
            imageMobile: PLACEHOLDER_IMAGE,
          },
          {
            stepNumber: 3,
            label: 'Ongoing',
            title: 'Extend what works',
            lines: [
              'Move into digestion, protein, sugar, or inflammation programs as they fit — each one builds on the last.',
            ],
            imageDesktop: PLACEHOLDER_IMAGE,
            imageMobile: PLACEHOLDER_IMAGE,
          },
        ],
      },
    },
    {
      id: 'program-sequence',
      type: 'grid.program-cards.v1',
      content: {
        collectionSlug: 'nutrition',
        heading: 'The Nutrition Foundations sequence',
        subhead:
          'Everyone starts with Baseline. Each later program is a public overview here — delivery happens in the signed-in app.',
      },
    },
    {
      id: 'app-integration',
      type: 'feature.reasons-split.v1',
      content: {
        heading: 'Every program works with your journal',
        items: [
          { label: 'Plan', sentence: 'Set a realistic weekly rhythm around the program you are running.' },
          { label: 'Log', sentence: 'Capture meals, timing, and how your body responded as you go.' },
          { label: 'Learn', sentence: 'See the patterns Baseline surfaces so the next step is informed.' },
          { label: 'Repeat', sentence: 'Keep what works and extend it into the next focused program.' },
        ],
        imageDesktop: PLACEHOLDER_IMAGE,
        imageMobile: PLACEHOLDER_IMAGE,
        imageAlt: 'The Fine Diet app on a tablet',
      },
    },
    {
      id: 'marquee',
      type: 'ambient.marquee-strip.v1',
      content: {
        text: 'NOT A DETOX. NOT A DIET CHALLENGE. NOT ANOTHER TRACKER.',
        speed: 50,
        direction: 'left',
        pauseOnHover: true,
      },
    },
    {
      id: 'differentiators',
      type: 'feature.icon-tiles.v1',
      content: {
        heading: 'What makes Nutrition Foundations different',
        intro:
          'Most nutrition programs ask you to change too much before you understand what is actually driving the pattern. The goal is not to do more. The goal is to create enough structure that your body feedback becomes useful.',
        surface: 'dark',
        tiles: [
          { icon: 'programs', title: 'Stabilize first', description: 'Build meal rhythm before making advanced changes.' },
          { icon: 'notebook', title: 'Follow the signal', description: 'Use check-ins to understand what your body needs next.' },
          { icon: 'quadrants', title: 'Built into your journal', description: 'Plan, track, and repeat what works—all in one place.' },
        ],
      },
    },
    {
      id: 'comparison',
      type: 'comparison.table.v1',
      content: {
        heading: 'Built differently than most nutrition programs',
        columns: { left: 'Fine Diet Programs', right: 'Most Programs' },
        rows: [
          { left: 'A shared Baseline you observe before changing things', right: 'A fixed protocol from day one' },
          { left: 'Staged programs you add as they fit', right: 'One plan, all-or-nothing' },
          { left: 'Compounds — each program builds on the last', right: 'Resets when the plan ends' },
          { left: 'Self-led, on your schedule', right: 'Tied to coaching cadence' },
        ],
      },
    },
    {
      id: 'faq',
      type: 'faq.accordion.v2',
      content: {
        title: 'Frequently asked',
        defaultOpenIndex: 0,
        items: [
          {
            id: 'faq-0',
            question: 'Where do I start?',
            answer:
              'Everyone starts with Baseline, the first program in Nutrition Foundations. It establishes a 21-day rhythm and a starting point future programs build from.',
          },
          {
            id: 'faq-1',
            question: 'Is this a restriction diet?',
            answer:
              'No. You add structure and observe patterns before deciding whether a more focused program fits. Nothing is removed all at once.',
          },
          {
            id: 'faq-2',
            question: 'Do I need the app?',
            answer:
              'These pages are public overviews. Active enrollment, check-ins, and delivery happen in the signed-in Fine Diet app once you have access.',
          },
          {
            id: 'faq-3',
            question: 'When are the later programs available?',
            answer:
              'Baseline is available now. Digestion, protein, sugar, and inflammation programs are staged and roll out over time.',
          },
        ],
      },
    },
    {
      id: 'final-cta',
      type: 'cta.program-offer.v1',
      content: {
        collectionSlug: 'nutrition',
        heading: 'Your nutrition will never need another restart',
        body: 'Start with Baseline and build a foundation you can extend.',
        align: 'center',
        surface: 'dark',
      },
    },
  ],
};

/**
 * Nutrition Foundations page (preview parity) — reconstructs the preview-era
 * static /programs/nutrition page as rendered by the code-owned
 * `ProgramCategoryView`, using `NUTRITION_CATEGORY_CONTENT` as the copy source.
 *
 * Source of truth (NOT the JSON composition):
 *   - components/programs/ProgramCategoryView.tsx (render/section order)
 *   - lib/programs/programCategoryContent.ts (NUTRITION_CATEGORY_CONTENT copy)
 *
 * Section → module mapping:
 *   CategoryHero            → hero               (hero.standard.v1)
 *   TimedProcessSteps       → how-it-works       (process.slide-stack.v1)
 *   CategoryIntro           → intro              (cta.program-offer.v1, left)
 *   ProgramCardGrid         → program-sequence   (grid.program-cards.v1)
 *   AmbientMarqueeStripV1   → marquee            (ambient.marquee-strip.v1)
 *   CategoryDifferentiators → differentiators    (feature.icon-tiles.v1)
 *   CategoryAppIntegration  → app-integration    (feature.reasons-split.v1)
 *   CategoryComparison      → comparison         (comparison.table.v1)
 *   CategoryFaq             → faq                (faq.accordion.v2)
 *   CategoryFinalCta        → final-cta          (cta.program-offer.v1, center)
 *
 * Note on `intro`: the distinct CategoryIntro section (heading + body + a
 * centrally-resolved CTA) is represented with `cta.program-offer.v1` (align
 * left) — an existing module that accurately models a heading/body/resolved-CTA
 * band — so no new module type is introduced. The differentiators copy mirrors
 * what the static `CategoryDifferentiators` actually renders.
 *
 * Module order (10): hero, how-it-works, intro, program-sequence, marquee,
 * differentiators, app-integration, comparison, faq, final-cta.
 */
const nutritionFoundationsPreviewTemplate: ProgramsCompositionTemplate = {
  id: 'programs-nutrition-foundations-preview',
  name: 'Nutrition Foundations page (preview parity)',
  description:
    'Matches the live preview /programs/nutrition section order (source: ProgramCategoryView + NUTRITION_CATEGORY_CONTENT): hero, how-it-works, intro, Program sequence, marquee, differentiators, journal integration, comparison, FAQ, closing CTA.',
  kind: 'collection',
  modules: [
    {
      id: 'hero',
      type: 'hero.standard.v1',
      content: {
        headline: 'The most comprehensive,\nself-led nutrition program',
        subheadline:
          'Nutrition Foundations is a staged pathway built on The Fine Diet Method. Start with Baseline, then extend into focused programs as they fit your goals.',
        images: {
          desktop: PLACEHOLDER_IMAGE,
          mobile: PLACEHOLDER_IMAGE,
          alt: 'Fine Diet Nutrition Foundations',
        },
        height: 'full',
      },
    },
    {
      // Table-style "how it works" process section — renders the code-owned
      // TimedProcessSteps visual (rows of number · title · description), matching
      // the static /programs/[category-slug] prototype. NOT the image slideshow
      // (process.slide-stack.v1).
      id: 'how-it-works',
      type: 'process.timed-steps.v1',
      content: {
        heading: 'How this program works',
        steps: [
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
      },
    },
    {
      // CategoryIntro parity: heading + body + ONE primary CTA. `ctaStyle:
      // 'primary-only'` suppresses the secondary link/helper that the generic
      // offer band would otherwise add, matching the preview-era static section.
      // Heading copy follows the founder's prototype ("...you can sustain").
      id: 'intro',
      type: 'cta.program-offer.v1',
      content: {
        collectionSlug: 'nutrition',
        heading: 'Start by building a foundation you can sustain',
        body: 'Most plans hand you one rigid protocol. Nutrition Foundations begins with a shared Baseline, then lets you add focused programs over time so progress compounds instead of resetting.',
        align: 'left',
        surface: 'light',
        ctaStyle: 'primary-only',
      },
    },
    {
      id: 'program-sequence',
      type: 'grid.program-cards.v1',
      content: {
        collectionSlug: 'nutrition',
        heading: 'The Nutrition Foundations sequence',
        subhead:
          'Everyone starts with Baseline. Each later program is a public overview here — delivery happens in the signed-in app.',
      },
    },
    {
      id: 'marquee',
      type: 'ambient.marquee-strip.v1',
      content: {
        text: 'NOT A DETOX. NOT A DIET CHALLENGE. NOT ANOTHER TRACKER.',
        speed: 50,
        direction: 'left',
        pauseOnHover: true,
      },
    },
    {
      id: 'differentiators',
      type: 'feature.icon-tiles.v1',
      content: {
        heading: 'What makes Nutrition Foundations different',
        intro:
          'Most nutrition programs ask you to change too much before you understand what is actually driving the pattern. The goal is not to do more. The goal is to create enough structure that your body feedback becomes useful.',
        surface: 'dark',
        tiles: [
          { icon: 'programs', title: 'Stabilize first', description: 'Build meal rhythm before making advanced changes.' },
          { icon: 'notebook', title: 'Follow the signal', description: 'Use check-ins to understand what your body needs next.' },
          { icon: 'quadrants', title: 'Built into your journal', description: 'Plan, track, and repeat what works—all in one place.' },
        ],
      },
    },
    {
      id: 'app-integration',
      type: 'feature.reasons-split.v1',
      content: {
        heading: 'Every program works with your journal',
        items: [
          { label: 'Plan', sentence: 'Set a realistic weekly rhythm around the program you are running.' },
          { label: 'Log', sentence: 'Capture meals, timing, and how your body responded as you go.' },
          { label: 'Learn', sentence: 'See the patterns Baseline surfaces so the next step is informed.' },
          { label: 'Repeat', sentence: 'Keep what works and extend it into the next focused program.' },
        ],
        imageDesktop: PLACEHOLDER_IMAGE,
        imageMobile: PLACEHOLDER_IMAGE,
        imageAlt: 'The Fine Diet app on a tablet',
      },
    },
    {
      id: 'comparison',
      type: 'comparison.table.v1',
      content: {
        heading: 'Built differently than most nutrition programs',
        columns: { left: 'Fine Diet Programs', right: 'Most Programs' },
        rows: [
          { left: 'A shared Baseline you observe before changing things', right: 'A fixed protocol from day one' },
          { left: 'Staged programs you add as they fit', right: 'One plan, all-or-nothing' },
          { left: 'Compounds — each program builds on the last', right: 'Resets when the plan ends' },
          { left: 'Self-led, on your schedule', right: 'Tied to coaching cadence' },
        ],
      },
    },
    {
      id: 'faq',
      type: 'faq.accordion.v2',
      content: {
        title: 'Frequently asked',
        defaultOpenIndex: 0,
        items: [
          {
            id: 'faq-0',
            question: 'Where do I start?',
            answer:
              'Everyone starts with Baseline, the first program in Nutrition Foundations. It establishes a 21-day rhythm and a starting point future programs build from.',
          },
          {
            id: 'faq-1',
            question: 'Is this a restriction diet?',
            answer:
              'No. You add structure and observe patterns before deciding whether a more focused program fits. Nothing is removed all at once.',
          },
          {
            id: 'faq-2',
            question: 'Do I need the app?',
            answer:
              'These pages are public overviews. Active enrollment, check-ins, and delivery happen in the signed-in Fine Diet app once you have access.',
          },
          {
            id: 'faq-3',
            question: 'When are the later programs available?',
            answer:
              'Baseline is available now. Digestion, protein, sugar, and inflammation programs are staged and roll out over time.',
          },
        ],
      },
    },
    {
      id: 'final-cta',
      type: 'cta.program-offer.v1',
      content: {
        collectionSlug: 'nutrition',
        heading: 'Your nutrition will never need another restart',
        body: 'Start with Baseline and build a foundation you can extend.',
        align: 'center',
        surface: 'dark',
      },
    },
  ],
};

// ── Registry ─────────────────────────────────────────────────────────────────

/** All code-backed templates, in picker display order. */
export const PROGRAMS_COMPOSITION_TEMPLATES: readonly ProgramsCompositionTemplate[] = [
  nutritionFoundationsPreviewTemplate,
  nutritionFoundationsTemplate,
  collectionLandingTemplate,
  programDetailTemplate,
  minimalStarterTemplate,
] as const;

/** Lightweight option shape for editor pickers (no module payload). */
export interface ProgramsTemplateOption {
  id: string;
  name: string;
  description: string;
  kind: ProgramsTemplateKind;
  moduleCount: number;
}

/** Picker-friendly summaries (id/name/description/count) without module bodies. */
export function listProgramsTemplateOptions(): ProgramsTemplateOption[] {
  return PROGRAMS_COMPOSITION_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    kind: t.kind,
    moduleCount: t.modules.length,
  }));
}

export function getProgramsCompositionTemplate(
  id: string,
): ProgramsCompositionTemplate | undefined {
  return PROGRAMS_COMPOSITION_TEMPLATES.find((t) => t.id === id);
}

/**
 * Instantiate a template's modules as a fresh, deep-cloned array suitable for
 * dropping into the editor draft. Each module gets a unique id (templateModuleId
 * + timestamp suffix) so applying a template never collides with React keys or
 * with modules the admin may keep.
 */
export function instantiateTemplateModules(
  template: ProgramsCompositionTemplate,
): Array<{ id: string; type: string; content: Record<string, unknown> }> {
  const stamp = Date.now();
  return template.modules.map((mod, index) => ({
    id: `${mod.id}-${stamp}-${index}`,
    type: mod.type,
    // Deep clone so editor mutations never touch the shared registry object.
    content: JSON.parse(JSON.stringify(mod.content)) as Record<string, unknown>,
  }));
}
