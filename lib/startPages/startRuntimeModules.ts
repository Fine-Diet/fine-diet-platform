import { z } from 'zod';

import { MODULE_CONTENT_SCHEMAS } from '@/lib/modules/schema';

/**
 * Runtime module zones that Start pages may render.
 *
 * These are presentation-only insertion points inside the hardened StartView.
 * Pricing, checkout, trial logic, offer routing, and entitlements remain owned by
 * the existing Start/Offers systems.
 */
export const START_RUNTIME_MODULE_ZONE_KEYS = [
  'afterHero',
  'afterSystemCards',
  'beforePricing',
  'afterPricing',
  'beforeFinalCta',
] as const;

export type StartRuntimeModuleZoneKey = (typeof START_RUNTIME_MODULE_ZONE_KEYS)[number];

/**
 * Safe reusable runtime modules for Start/Launch pages.
 *
 * Intentionally excludes pricing.tiers.v1, hero.offer-blur.v1, and
 * cta.program-offer.v1 so /start cannot override billing-adjacent controls or
 * replace the hardened Start hero/CTA behavior through config_json.
 */
export const START_RUNTIME_MODULE_TYPE_KEYS = [
  'process.timed-steps.v1',
  'process.numbered-cards.v1',
  'system.cards-scroller.v1',
  'persuasion.simple-cta.v1',
  'ambient.marquee-strip.v1',
  'case-study.scroll-cards.v1',
  'faq.accordion.v2',
  'feature.reasons-split.v1',
  'comparison.table.v1',
  'feature.icon-tiles.v1',
  'grid.program-cards.v1',
  'lead.waitlist-capture.v1',
  'access.code-gate.v1',
] as const;

export type StartRuntimeModuleTypeKey = (typeof START_RUNTIME_MODULE_TYPE_KEYS)[number];

export type StartRuntimeModuleBank = 'start' | 'programs' | 'integrative-care' | 'offer';

export interface StartRuntimeModuleTaxonomyItem {
  type: StartRuntimeModuleTypeKey;
  label: string;
  description: string;
  recommendedZones: StartRuntimeModuleZoneKey[];
  usefulFor: StartRuntimeModuleBank[];
}

export const START_RUNTIME_MODULE_TAXONOMY: StartRuntimeModuleTaxonomyItem[] = [
  {
    type: 'process.timed-steps.v1',
    label: 'Timed process steps',
    description: 'Compact how-it-works sequence for Start, program, or pathway education.',
    recommendedZones: ['afterHero', 'afterSystemCards', 'beforePricing'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
  {
    type: 'process.numbered-cards.v1',
    label: 'Numbered process cards',
    description: 'Start-style numbered process cards for trial, onboarding, pathway, or method steps.',
    recommendedZones: ['afterSystemCards', 'beforePricing', 'beforeFinalCta'],
    usefulFor: ['start', 'programs', 'integrative-care', 'offer'],
  },
  {
    type: 'system.cards-scroller.v1',
    label: 'System cards scroller',
    description: 'Start-style horizontal card rail for app/system capabilities, benefits, or proof cards.',
    recommendedZones: ['afterHero', 'afterSystemCards', 'beforePricing'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
  {
    type: 'persuasion.simple-cta.v1',
    label: 'Persuasion CTA block',
    description: 'Short persuasive copy block before or after a decision point.',
    recommendedZones: ['beforePricing', 'afterPricing', 'beforeFinalCta'],
    usefulFor: ['start', 'programs', 'integrative-care', 'offer'],
  },
  {
    type: 'ambient.marquee-strip.v1',
    label: 'Ambient marquee strip',
    description: 'Lightweight brand rhythm and repeated promise strip between sections.',
    recommendedZones: ['afterHero', 'afterSystemCards'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
  {
    type: 'case-study.scroll-cards.v1',
    label: 'Proof card rail',
    description: 'Horizontal proof, case-study, or featured-pathway cards.',
    recommendedZones: ['afterSystemCards', 'afterPricing', 'beforeFinalCta'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
  {
    type: 'faq.accordion.v2',
    label: 'Pathway FAQ',
    description: 'Accordion for objections, questions, or next-step clarity.',
    recommendedZones: ['afterPricing', 'beforeFinalCta'],
    usefulFor: ['start', 'programs', 'integrative-care', 'offer'],
  },
  {
    type: 'feature.reasons-split.v1',
    label: 'Reasons split feature',
    description: 'Image-and-reasons section for differentiators or why-it-works content.',
    recommendedZones: ['afterSystemCards', 'beforePricing'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
  {
    type: 'comparison.table.v1',
    label: 'Pathway comparison table',
    description: 'Structured comparison for programs, support levels, app access, or choices.',
    recommendedZones: ['beforePricing', 'afterPricing'],
    usefulFor: ['start', 'programs', 'integrative-care', 'offer'],
  },
  {
    type: 'feature.icon-tiles.v1',
    label: 'Benefit icon tiles',
    description: 'Tile grid for benefits, pillars, system capabilities, or differentiators.',
    recommendedZones: ['afterSystemCards', 'beforePricing'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
  {
    type: 'grid.program-cards.v1',
    label: 'Program card grid',
    description: 'Program catalogue grid; strongest fit for Start pages that route into Programs.',
    recommendedZones: ['afterSystemCards', 'beforeFinalCta'],
    usefulFor: ['start', 'programs'],
  },
  {
    type: 'lead.waitlist-capture.v1',
    label: 'Waitlist Capture',
    description:
      'Conversion-safe lead/waitlist form with SMS consent. Lead capture only — does not touch billing, checkout, trials, or offer truth. Variants map to backend captureMode (simple / priority / concierge).',
    recommendedZones: ['beforePricing', 'afterPricing', 'beforeFinalCta', 'afterHero'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
  {
    type: 'access.code-gate.v1',
    label: 'Access Code Gate',
    description:
      'Access-code entry + frontend-safe verification. Submits to POST /api/access-codes/verify and reveals a safe relative CTA on success. Does not touch billing, checkout, trials, entitlements, or offer truth — it never grants access.',
    recommendedZones: ['beforePricing', 'afterPricing', 'beforeFinalCta', 'afterHero'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
];

export function getStartRuntimeModuleTaxonomy(
  type: StartRuntimeModuleTypeKey,
): StartRuntimeModuleTaxonomyItem | undefined {
  return START_RUNTIME_MODULE_TAXONOMY.find((item) => item.type === type);
}

const STARTER_IMAGE =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg';

export function createStartRuntimeModuleStarterContent(
  type: StartRuntimeModuleTypeKey,
): Record<string, unknown> {
  switch (type) {
    case 'process.timed-steps.v1':
      return {
        heading: 'A clear sequence for getting started',
        steps: [
          {
            stepNumber: 1,
            label: 'Step 1',
            title: 'Choose your starting point',
            description: 'Pick the path that matches what the visitor is trying to accomplish.',
          },
          {
            stepNumber: 2,
            label: 'Step 2',
            title: 'Build a repeatable rhythm',
            description: 'Use the system to create logs, plans, and habits that can actually repeat.',
          },
          {
            stepNumber: 3,
            label: 'Step 3',
            title: 'Decide the next best step',
            description: 'Use patterns and progress to continue, adjust, or choose a focused program.',
          },
        ],
      };
    case 'process.numbered-cards.v1':
      return {
        eyebrow: 'How it works',
        heading: 'A simple process visitors can follow.',
        intro:
          'Use this Start-style process block for onboarding, program steps, trial education, or method explanation.',
        surface: 'dark',
        steps: [
          {
            number: '01',
            title: 'Choose the right path',
            body: 'Explain how the visitor selects the program, offer, or support path that fits their current goal.',
          },
          {
            number: '02',
            title: 'Create a practical rhythm',
            body: 'Show how the system helps turn the choice into repeatable actions and useful feedback.',
          },
          {
            number: '03',
            title: 'Use what you learn',
            body: 'Describe how observations become a clearer next step instead of another restart.',
          },
          {
            number: '04',
            title: 'Continue or adjust',
            body: 'Give visitors a safe, generic explanation of what happens after the first stage.',
          },
        ],
      };
    case 'system.cards-scroller.v1':
      return {
        heading: 'Everything works together in one system.',
        intro:
          'Use this card rail for app capabilities, pathway benefits, proof points, or feature education.',
        surface: 'dark',
        cards: [
          {
            id: 'card-one',
            eyebrow: 'Plan',
            headline: 'Turn scattered intentions into a rhythm.',
            description:
              'Explain how this page, program, or offer helps people create a practical structure they can repeat.',
            image: STARTER_IMAGE,
            imageAlt: 'Fine Diet preview image',
          },
          {
            id: 'card-two',
            eyebrow: 'Log',
            headline: 'Capture context as you go.',
            description:
              'Show how meals, timing, symptoms, routines, or notes can become easier to understand together.',
            image: STARTER_IMAGE,
            imageAlt: 'Fine Diet preview image',
          },
          {
            id: 'card-three',
            eyebrow: 'Learn',
            headline: 'Use patterns to choose the next step.',
            description:
              'Explain how the system helps users move from guessing to a more specific next action.',
            image: STARTER_IMAGE,
            imageAlt: 'Fine Diet preview image',
          },
        ],
      };
    case 'persuasion.simple-cta.v1':
      return {
        heading: 'Make the next step feel obvious.',
        intro: 'Use this block to explain why this page is the right starting point.',
        items: ['Clarify the promise.', 'Reduce uncertainty.', 'Point toward the next action.'],
        ctaLabel: 'Continue',
        ctaHref: '#plans',
        variant: 'list',
      };
    case 'ambient.marquee-strip.v1':
      return {
        text: 'Plan better • Log with context • Learn your rhythm • Repeat what works •',
        speed: 32,
        direction: 'left',
        pauseOnHover: true,
      };
    case 'case-study.scroll-cards.v1':
      return {
        sectionHeading: 'What becomes clearer with a system',
        cards: [
          {
            id: 'proof-one',
            imageDesktop: STARTER_IMAGE,
            imageMobile: STARTER_IMAGE,
            imageAlt: 'Fine Diet preview card',
            before: 'Before: meals and symptoms felt disconnected.',
            breakthrough: 'Breakthrough: patterns became easier to see.',
            after: 'After: the next step felt more specific.',
          },
          {
            id: 'proof-two',
            imageDesktop: STARTER_IMAGE,
            imageMobile: STARTER_IMAGE,
            imageAlt: 'Fine Diet preview card',
            before: 'Before: each week started from scratch.',
            breakthrough: 'Breakthrough: repeatable templates reduced decisions.',
            after: 'After: consistency became easier to maintain.',
          },
        ],
      };
    case 'faq.accordion.v2':
      return {
        title: 'Questions before you start',
        defaultOpenIndex: 0,
        items: [
          {
            id: 'faq-one',
            question: 'Where does this fit?',
            answer: 'Use this section to answer the most important question before the visitor chooses a next step.',
          },
          {
            id: 'faq-two',
            question: 'Can this content be edited?',
            answer: 'Yes. Edit the question and answer fields for the specific Start page.',
          },
        ],
      };
    case 'feature.reasons-split.v1':
      return {
        heading: 'Why this path works better than guessing.',
        body: 'Use this section to explain the main reasons behind the offer, program, or pathway.',
        items: [
          { label: '01', sentence: 'It starts from the visitor’s real rhythm.' },
          { label: '02', sentence: 'It turns repeated patterns into practical next steps.' },
          { label: '03', sentence: 'It keeps the decision focused instead of overwhelming.' },
        ],
        imageDesktop: STARTER_IMAGE,
        imageMobile: STARTER_IMAGE,
        imageAlt: 'Fine Diet preview image',
        ctaLabel: 'See plans',
        ctaHref: '#plans',
        ctaTone: 'denim',
      };
    case 'comparison.table.v1':
      return {
        heading: 'A clearer way to choose your nutrition path',
        columns: { left: 'Fine Diet', right: 'Generic tracking' },
        rows: [
          {
            label: 'Starting point',
            left: 'Uses your logs, rhythm, and real life.',
            right: 'Starts from a generic template.',
          },
          {
            label: 'Next step',
            left: 'Routes toward the right program or support level.',
            right: 'Leaves the next decision unclear.',
          },
        ],
      };
    case 'feature.icon-tiles.v1':
      return {
        heading: 'What users get from the system',
        intro: 'Use these tiles for benefits, pillars, or app capabilities.',
        surface: 'dark',
        tiles: [
          {
            icon: 'notebook',
            title: 'Guided logging',
            description: 'Capture meals and body signals with context.',
          },
          {
            icon: 'insights',
            title: 'Pattern clarity',
            description: 'Turn repeated logs into useful next steps.',
          },
          {
            icon: 'programs',
            title: 'Programs',
            description: 'Follow staged pathways as they become available.',
          },
        ],
      };
    case 'grid.program-cards.v1':
      return {
        collectionSlug: 'nutrition',
        heading: 'Nutrition Foundations',
        subhead: 'A resolver-driven grid that routes visitors into the program catalogue.',
      };
    case 'lead.waitlist-capture.v1':
      return createLeadWaitlistCaptureStarterContent('simple');
    case 'access.code-gate.v1':
      return createAccessCodeGateStarterContent('simple');
    default:
      return {};
  }
}

/**
 * Starter content for each `lead.waitlist-capture.v1` variant.
 *
 * The default builder flow adds the `simple` variant; editors switch the
 * `variant` select in the field editor to get priority/concierge field
 * requirements. `variant` maps 1:1 to the backend `captureMode`.
 */
export function createLeadWaitlistCaptureStarterContent(
  variant: 'simple' | 'priority' | 'concierge',
): Record<string, unknown> {
  const base = {
    eyebrow: 'Waitlist',
    title: 'Join the app waitlist',
    description:
      'Join the Fine Diet waitlist for launch updates, early access invitations, and first notice when the app opens to new users.',
    phonePrompt: 'Add your phone number for priority updates.',
    nameLabel: 'Name',
    firstNameLabel: 'First Name',
    lastNameLabel: 'Last Name',
    emailLabel: 'Email',
    phoneLabel: 'Phone',
    smsConsentLabel:
      'I agree to receive SMS updates from Fine Diet about this offer. Msg & data rates may apply. Reply STOP to opt out.',
    smsConsentVersion: 'waitlist-sms-v1',
    ctaLabel: 'Join The Waitlist',
    submittingLabel: 'Saving your spot…',
    successTitle: "You're on the list.",
    successBody: "We'll contact you when this opens.",
    successSmsNote:
      'If you added your phone number, we may text you with priority updates. Reply STOP to opt out.',
    errorFallback: 'Something went wrong. Please try again.',
    campaignKey: 'waitlist_capture_v1',
    source: 'start_waitlist',
    programSlug: null,
    offerKey: null,
    startPageSlug: null,
    redirectPath: null,
    layout: 'banded',
    backgroundTone: 'blue',
    railEnabled: true,
    railText: 'JOIN THE WAITLIST',
    anchorId: 'waitlist',
  };

  if (variant === 'priority') {
    return {
      ...base,
      variant: 'priority',
      title: 'Get priority access',
      description:
        'Join the priority list and we will reach out the moment this opens. Phone helps us reach you faster.',
      preferredChannelLabel: 'Preferred contact method',
      preferredChannel: 'sms',
      ctaLabel: 'Reserve my spot',
    };
  }

  if (variant === 'concierge') {
    return {
      ...base,
      variant: 'concierge',
      title: 'Talk to us before you start',
      description:
        'Tell us a little about what you are looking for and we will reach out personally.',
      goalLabel: 'What are you interested in?',
      preferredChannelLabel: 'Preferred contact method',
      preferredChannel: 'either',
      ctaLabel: 'Request concierge access',
    };
  }

  return {
    ...base,
    variant: 'simple',
    preferredChannel: 'either',
  };
}

/**
 * Starter content for each `access.code-gate.v1` variant.
 *
 * The default builder flow adds the `simple` variant; editors switch the
 * `variant` select to `private_offer` / `cohort` for presentation changes only.
 * Validation behavior is identical across variants. The success CTA is always
 * a safe relative URL — the module never calls checkout or grants access.
 */
export function createAccessCodeGateStarterContent(
  variant: 'simple' | 'private_offer' | 'cohort',
): Record<string, unknown> {
  const base = {
    eyebrow: 'Private access',
    title: 'Enter Your Access Code',
    description: 'Enter the code you received to unlock access.',
    codeLabel: 'Access code',
    codePlaceholder: 'Enter Access Code',
    collectEmail: false,
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    ctaLabel: 'Unlock Access',
    submittingLabel: 'Checking code…',
    successTitle: 'Access unlocked.',
    successBody: 'You can continue from here.',
    successCtaLabel: 'Continue',
    successCtaHref: '#pricing',
    invalidMessage: 'That code does not look valid. Check it and try again.',
    expiredMessage: 'That code is no longer active.',
    helpText: 'We respect your privacy. We don’t store or share codes.',
    source: 'start_access_code_gate',
    campaignKey: 'access_code_gate_v1',
    startPageSlug: null,
    programSlug: null,
    productSlug: null,
    offerKey: null,
    codeKey: null,
    layout: 'banded',
    backgroundTone: 'blue',
    railEnabled: true,
    railText: 'ENTER ACCESS CODE',
    anchorId: 'access-code',
  };

  if (variant === 'private_offer') {
    return {
      ...base,
      variant: 'private_offer',
      eyebrow: 'Private offer',
      title: 'Enter your private offer code',
      description: 'Use the private offer code you received to see your options.',
      collectEmail: true,
      ctaLabel: 'Reveal my offer',
      successCtaHref: '#pricing',
    };
  }

  if (variant === 'cohort') {
    return {
      ...base,
      variant: 'cohort',
      eyebrow: 'Cohort access',
      title: 'Enter your cohort code',
      description: 'Use the cohort code you received to join your group.',
      collectEmail: true,
      ctaLabel: 'Continue to my cohort',
      successCtaHref: '#pricing',
    };
  }

  return { ...base, variant: 'simple' };
}

export interface StartRuntimeModuleInstance {
  id: string;
  type: StartRuntimeModuleTypeKey;
  content: Record<string, unknown>;
}

export type StartRuntimeModuleZones = Partial<
  Record<StartRuntimeModuleZoneKey, StartRuntimeModuleInstance[]>
>;

const startRuntimeModuleTypeSchema = z.enum(START_RUNTIME_MODULE_TYPE_KEYS);

export const startRuntimeModuleInstanceSchema = z
  .object({
    id: z.string().min(1),
    type: startRuntimeModuleTypeSchema,
    content: z.record(z.string(), z.unknown()),
  })
  .strip()
  .superRefine((module, ctx) => {
    const schema = MODULE_CONTENT_SCHEMAS[module.type];
    const validation = schema.safeParse(module.content);
    if (!validation.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid content for ${module.type}: ${validation.error.message}`,
      });
    }
  });

export const startRuntimeModuleZonesSchema = z
  .object({
    afterHero: z.array(startRuntimeModuleInstanceSchema).optional(),
    afterSystemCards: z.array(startRuntimeModuleInstanceSchema).optional(),
    beforePricing: z.array(startRuntimeModuleInstanceSchema).optional(),
    afterPricing: z.array(startRuntimeModuleInstanceSchema).optional(),
    beforeFinalCta: z.array(startRuntimeModuleInstanceSchema).optional(),
  })
  .strip();
