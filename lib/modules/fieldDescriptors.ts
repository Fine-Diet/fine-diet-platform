/**
 * Module Field Descriptors
 *
 * Defines the editor representation for every module type's content fields.
 * This is the source of truth for the admin composition editor — not Zod schemas.
 *
 * Zod schemas validate. Descriptors drive rendering.
 * Keep these in sync: when a schema field is added, add its descriptor here.
 *
 * Field type vocabulary:
 *   text         — single-line string input
 *   textarea     — multi-line string input
 *   url          — URL input (image paths, hrefs)
 *   number       — numeric input
 *   boolean      — checkbox
 *   select       — dropdown from fixed options[]
 *   string-list  — repeater of plain string inputs
 *   object-list  — repeater of sub-form rows (each row has its own fields[])
 *   object       — singleton grouped sub-form against ONE object value (fields[])
 *                  writes back an object, never an array. Use when a schema field
 *                  is a single nested record (e.g. { left, right }) rather than a
 *                  list. Distinct from object-list, which writes an array.
 *   image-slot   — structured sub-form: desktop URL + mobile URL + alt
 *   image-url    — single image URL backed by the media-library picker
 *                  (preview + manual entry + clear). Use ONLY for image fields;
 *                  CTA/page/href links stay 'url' so they keep a plain input.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'url'
  | 'number'
  | 'boolean'
  | 'select'
  | 'string-list'
  | 'object-list'
  | 'object'
  | 'image-slot'
  | 'image-url'
  | 'access-code-select';

export interface FieldDescriptor {
  /** JSON key in the content object (dot-notation for nested, but these are always top-level) */
  key: string;
  /** Human-readable label shown in the editor */
  label: string;
  /** Input type driving the renderer */
  type: FieldType;
  /** Whether the field can be omitted */
  optional?: boolean;
  /** Short helper text shown below the field */
  hint?: string;
  /** Input placeholder text */
  placeholder?: string;
  /** Groups related fields under a collapsible heading */
  group?: string;
  /** Whether this field's group starts collapsed */
  collapsedByDefault?: boolean;
  /** For 'select': allowed option values */
  options?: string[];
  /** For 'object-list' and 'object': descriptors for the sub-form field(s) */
  fields?: FieldDescriptor[];
}

export type ModuleFieldDescriptorMap = Record<string, FieldDescriptor[]>;

// ─── Shared sub-descriptors ───────────────────────────────────────────────────

const buttonSlotFields: FieldDescriptor[] = [
  { key: 'label', label: 'Button Label', type: 'text', placeholder: 'e.g. Choose Your Support' },
  { key: 'href', label: 'Link', type: 'url', placeholder: '/integrative-care#programs' },
  {
    key: 'variant',
    label: 'Style',
    type: 'select',
    optional: true,
    options: ['primary', 'secondary', 'tertiary', 'quaternary'],
  },
];

const imageSlotDescriptor = (key: string, label: string, optional = false): FieldDescriptor => ({
  key,
  label,
  type: 'image-slot',
  optional,
  hint: 'Desktop and mobile image paths. Use the asset library for URLs.',
});

// ─── Module field maps ────────────────────────────────────────────────────────

export const MODULE_FIELD_DESCRIPTORS: ModuleFieldDescriptorMap = {

  // ── hero.standard.v1 ────────────────────────────────────────────────────────
  'hero.standard.v1': [
    {
      key: 'headline',
      label: 'Headline',
      type: 'textarea',
      placeholder: 'Your headline here',
      hint: 'Use \\n for line breaks.',
    },
    {
      key: 'subheadline',
      label: 'Subheadline',
      type: 'textarea',
      optional: true,
      placeholder: 'Supporting line under the headline',
    },
    {
      key: 'body',
      label: 'Body copy',
      type: 'textarea',
      optional: true,
    },
    {
      key: 'eyebrow',
      label: 'Eyebrow',
      type: 'text',
      optional: true,
      group: 'Hero Copy',
      placeholder: 'e.g. Three goals',
      hint: 'Optional small label shown above the headline.',
    },
    {
      key: 'height',
      label: 'Hero height',
      type: 'select',
      optional: true,
      options: ['full', 'medium'],
      hint: 'full = 99vh. medium = 66vh.',
    },
    {
      key: 'overlayStrength',
      label: 'Overlay darkness',
      type: 'select',
      optional: true,
      group: 'Hero Display',
      options: ['light', 'medium', 'dark'],
      hint: 'Omitted = the default bg-black/30 overlay. dark = bg-black/60, medium = bg-black/40, light = bg-black/20.',
    },
    imageSlotDescriptor('images', 'Background image'),
    {
      key: 'ctaPrimaryLabel',
      label: 'Primary CTA label',
      type: 'text',
      optional: true,
      group: 'Hero CTA',
      placeholder: 'e.g. Start with Baseline',
      hint: 'Wide pill button. Takes precedence over the legacy CTA Buttons list below.',
    },
    {
      key: 'ctaPrimaryHref',
      label: 'Primary CTA link',
      type: 'url',
      optional: true,
      group: 'Hero CTA',
      placeholder: '/programs/nutrition/baseline',
    },
    {
      key: 'ctaSecondaryLabel',
      label: 'Secondary link label',
      type: 'text',
      optional: true,
      group: 'Hero CTA',
      placeholder: 'e.g. Manage my programs',
      hint: 'Plain copy/link shown beneath the primary CTA.',
    },
    {
      key: 'ctaSecondaryHref',
      label: 'Secondary link',
      type: 'url',
      optional: true,
      group: 'Hero CTA',
      placeholder: '/app/programs',
    },
    {
      key: 'ctaNote',
      label: 'CTA note',
      type: 'textarea',
      optional: true,
      group: 'Hero CTA',
      placeholder: 'e.g. Choose monthly or annual before checkout.',
      hint: 'Microcopy shown beneath the wide primary CTA. Renders only when the primary CTA is set.',
    },
    {
      key: 'buttons',
      label: 'CTA Buttons (legacy)',
      type: 'object-list',
      optional: true,
      group: 'CTAs',
      hint: 'Up to 2 buttons. Used only when the Hero CTA fields above are empty.',
      fields: buttonSlotFields,
    },
    {
      key: 'heroRailEnabled',
      label: 'Enable bottom rail',
      type: 'boolean',
      optional: true,
      group: 'Hero Bottom Rail',
      hint: 'Shows a marquee rail of short goal/value items at the bottom of the hero.',
    },
    {
      key: 'heroRailItems',
      label: 'Rail items',
      type: 'string-list',
      optional: true,
      group: 'Hero Bottom Rail',
      placeholder: 'Food clarity',
      hint: 'Short items. The rail renders only when "Enable bottom rail" is on and this list is non-empty.',
    },
  ],

  // ── hero.offer-blur.v1 ──────────────────────────────────────────────────────
  'hero.offer-blur.v1': [
    {
      key: 'title',
      label: 'Title',
      type: 'textarea',
      placeholder: 'Fine Diet™ 21-Day\nNutrition Intensive',
      hint: 'Use \\n to break the title across lines.',
    },
    {
      key: 'subtitle',
      label: 'Subtitle',
      type: 'textarea',
      optional: true,
      placeholder: 'Personalized nutrition, root-cause insight…',
    },
    {
      key: 'ctaLabel',
      label: 'CTA Label',
      type: 'text',
      placeholder: 'Choose Your Support',
    },
    {
      key: 'ctaHref',
      label: 'CTA Link',
      type: 'url',
      placeholder: '/integrative-care#programs',
    },
    {
      key: 'imageDesktop',
      label: 'Background image (desktop)',
      type: 'image-url',
      placeholder: '/images/category/integrative-care-hero.jpg',
    },
    {
      key: 'imageMobile',
      label: 'Background image (mobile)',
      type: 'image-url',
      placeholder: '/images/category/integrative-care-hero.jpg',
    },
    {
      key: 'overlayStrength',
      label: 'Overlay darkness',
      type: 'select',
      optional: true,
      options: ['light', 'medium', 'dark'],
      hint: 'dark is the default. Lighter overlays reveal more of the image.',
    },
  ],

  // ── process.slide-stack.v1 ──────────────────────────────────────────────────
  'process.slide-stack.v1': [
    {
      key: 'heading',
      label: 'Section heading',
      type: 'text',
      placeholder: 'How the process works',
    },
    {
      key: 'defaultOpenIndex',
      label: 'Default open step (0-based)',
      type: 'number',
      optional: true,
      hint: '0 = first step. Leave blank to default to 0.',
    },
    {
      key: 'steps',
      label: 'Process steps',
      type: 'object-list',
      hint: 'Each step becomes one tab panel. 3–5 steps recommended.',
      fields: [
        { key: 'stepNumber', label: 'Step number', type: 'number' },
        { key: 'label', label: 'Tab label', type: 'text', placeholder: 'Intake & Assessment' },
        { key: 'title', label: 'Panel title', type: 'text', optional: true },
        {
          key: 'lines',
          label: 'Bullet lines',
          type: 'string-list',
          hint: 'Each line appears as a dashed list item.',
          placeholder: 'We interpret symptoms, not ignore them',
        },
        {
          key: 'imageDesktop',
          label: 'Image (desktop)',
          type: 'image-url',
          placeholder: '/images/category/...',
        },
        {
          key: 'imageMobile',
          label: 'Image (mobile)',
          type: 'image-url',
          placeholder: '/images/category/...',
        },
      ],
    },
  ],

  // ── process.timed-steps.v1 ──────────────────────────────────────────────────
  'process.timed-steps.v1': [
    {
      key: 'heading',
      label: 'Section heading',
      type: 'text',
      placeholder: 'How this program works',
    },
    {
      key: 'steps',
      label: 'Process steps',
      type: 'object-list',
      hint: 'Table-style rows: step number, title, description. 3–5 steps recommended.',
      fields: [
        { key: 'stepNumber', label: 'Step number', type: 'number' },
        {
          key: 'label',
          label: 'Timing label',
          type: 'text',
          optional: true,
          placeholder: 'Days 1–21',
          hint: 'Optional timing label; not shown in the row body.',
        },
        { key: 'title', label: 'Title', type: 'text', placeholder: 'Establish your Baseline' },
        { key: 'description', label: 'Description', type: 'textarea' },
      ],
    },
  ],

  // ── process.numbered-cards.v1 ───────────────────────────────────────────────
  'process.numbered-cards.v1': [
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', optional: true, placeholder: 'How it works' },
    {
      key: 'heading',
      label: 'Heading',
      type: 'textarea',
      placeholder: 'A simple process visitors can follow.',
    },
    {
      key: 'intro',
      label: 'Intro',
      type: 'textarea',
      optional: true,
    },
    {
      key: 'surface',
      label: 'Surface',
      type: 'select',
      optional: true,
      options: ['dark', 'light'],
      hint: 'dark = neutral-950 band (default). light = pale band.',
    },
    {
      key: 'steps',
      label: 'Steps',
      type: 'object-list',
      hint: '2–4 numbered cards. Each card renders number, title, and body.',
      fields: [
        { key: 'number', label: 'Number', type: 'text', placeholder: '01' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'body', label: 'Body', type: 'textarea' },
      ],
    },
  ],

  // ── system.cards-scroller.v1 ────────────────────────────────────────────────
  'system.cards-scroller.v1': [
    {
      key: 'heading',
      label: 'Section heading',
      type: 'textarea',
      placeholder: 'Everything works together in one system.',
    },
    {
      key: 'intro',
      label: 'Intro',
      type: 'textarea',
      optional: true,
    },
    {
      key: 'surface',
      label: 'Surface',
      type: 'select',
      optional: true,
      options: ['dark', 'light'],
      hint: 'dark = neutral-950 band (default). light = pale band.',
    },
    {
      key: 'cards',
      label: 'Cards',
      type: 'object-list',
      hint: 'Horizontal scroller of system/capability cards. 3 cards is the sweet spot.',
      fields: [
        { key: 'id', label: 'Card id', type: 'text', optional: true, placeholder: 'card-one' },
        { key: 'eyebrow', label: 'Eyebrow', type: 'text', optional: true, placeholder: 'Plan' },
        { key: 'headline', label: 'Headline', type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'image', label: 'Image', type: 'image-url', placeholder: '/images/...' },
        { key: 'imageAlt', label: 'Image alt text', type: 'text', optional: true },
      ],
    },
  ],

  // ── persuasion.simple-cta.v1 ────────────────────────────────────────────────
  'persuasion.simple-cta.v1': [
    {
      key: 'heading',
      label: 'Heading',
      type: 'textarea',
      placeholder: "You've tried everything. Now try something built for you.",
    },
    {
      key: 'variant',
      label: 'Layout variant',
      type: 'select',
      optional: true,
      options: ['list', 'paragraph'],
      hint: '"list" shows bullet items. "paragraph" shows body paragraphs.',
    },
    {
      key: 'intro',
      label: 'Intro line (list variant)',
      type: 'text',
      optional: true,
      placeholder: 'Together we will:',
    },
    {
      key: 'items',
      label: 'List items',
      type: 'string-list',
      optional: true,
      group: 'List content',
      hint: 'Used when variant = "list".',
      placeholder: 'interpret symptoms and pinpoint patterns',
    },
    {
      key: 'bodyParagraphs',
      label: 'Body paragraphs',
      type: 'string-list',
      optional: true,
      group: 'Paragraph content',
      collapsedByDefault: true,
      hint: 'Used when variant = "paragraph". Each string = one paragraph.',
    },
    {
      key: 'ctaLabel',
      label: 'CTA label',
      type: 'text',
      placeholder: 'Choose Your Support',
    },
    {
      key: 'ctaHref',
      label: 'CTA link',
      type: 'url',
      placeholder: '/integrative-care#programs',
    },
  ],

  // ── ambient.marquee-strip.v1 ────────────────────────────────────────────────
  'ambient.marquee-strip.v1': [
    {
      key: 'text',
      label: 'Scrolling text',
      type: 'text',
      placeholder: "YOUR SYMPTOMS AREN'T RANDOM. LET'S GET CURIOUS.",
      hint: 'All caps recommended. The text repeats automatically.',
    },
    {
      key: 'speed',
      label: 'Scroll speed (px/s)',
      type: 'number',
      optional: true,
      hint: 'Default: 50. Higher = faster.',
    },
    {
      key: 'direction',
      label: 'Direction',
      type: 'select',
      optional: true,
      options: ['left', 'right'],
    },
    {
      key: 'pauseOnHover',
      label: 'Pause on hover',
      type: 'boolean',
      optional: true,
    },
  ],

  // ── case-study.scroll-cards.v1 ──────────────────────────────────────────────
  'case-study.scroll-cards.v1': [
    {
      key: 'sectionHeading',
      label: 'Section heading',
      type: 'text',
      placeholder: 'Client case studies',
    },
    {
      key: 'cards',
      label: 'Case study cards',
      type: 'object-list',
      hint: 'Each card scrolls horizontally. 3 cards is the sweet spot.',
      fields: [
        {
          key: 'imageDesktop',
          label: 'Image (desktop)',
          type: 'image-url',
          placeholder: '/images/category/...',
        },
        {
          key: 'imageMobile',
          label: 'Image (mobile)',
          type: 'image-url',
          placeholder: '/images/category/...',
        },
        { key: 'imageAlt', label: 'Image alt text', type: 'text', optional: true },
        {
          key: 'before',
          label: 'Before',
          type: 'textarea',
          optional: true,
          hint: '2–3 sentences about where the client started.',
        },
        {
          key: 'breakthrough',
          label: 'Breakthrough',
          type: 'textarea',
          optional: true,
          hint: 'The key shift or discovery moment.',
        },
        {
          key: 'after',
          label: 'After',
          type: 'textarea',
          optional: true,
          hint: 'What changed or improved.',
        },
      ],
    },
  ],

  // ── faq.accordion.v1 (original dark) ────────────────────────────────────────
  'faq.accordion.v1': [
    {
      key: 'title',
      label: 'Section title',
      type: 'text',
      optional: true,
      placeholder: 'FAQs',
    },
    {
      key: 'items',
      label: 'FAQ items',
      type: 'object-list',
      fields: [
        { key: 'question', label: 'Question', type: 'text', placeholder: 'How do I book and pay?' },
        {
          key: 'answer',
          label: 'Answer',
          type: 'textarea',
          placeholder: 'Just click the button for whatever offer fits you best…',
        },
      ],
    },
  ],

  // ── faq.accordion.v2 (premium bordered) ─────────────────────────────────────
  'faq.accordion.v2': [
    {
      key: 'title',
      label: 'Section title',
      type: 'text',
      placeholder: 'FAQs',
    },
    {
      key: 'defaultOpenIndex',
      label: 'Default open item (0-based)',
      type: 'number',
      optional: true,
      hint: '0 = first item open by default.',
    },
    {
      key: 'items',
      label: 'FAQ items',
      type: 'object-list',
      hint: '5–7 items is the editorial sweet spot.',
      fields: [
        { key: 'question', label: 'Question', type: 'text' },
        { key: 'answer', label: 'Answer', type: 'textarea' },
      ],
    },
  ],

  // ── feature.reasons-split.v1 ────────────────────────────────────────────────
  'feature.reasons-split.v1': [
    {
      key: 'heading',
      label: 'Section heading',
      type: 'textarea',
      placeholder: "3 reasons functional nutrition works when diets don't",
    },
    {
      key: 'body',
      label: 'Lead paragraph',
      type: 'textarea',
      optional: true,
      hint: 'Optional intro sentence(s) shown above the reasons list.',
    },
    {
      key: 'items',
      label: 'Reasons',
      type: 'object-list',
      hint: '3 reasons is the standard. Keep sentences short.',
      fields: [
        {
          key: 'label',
          label: 'Label',
          type: 'text',
          placeholder: 'REASON 01',
          hint: 'e.g. REASON 01, REASON 02 …',
        },
        {
          key: 'sentence',
          label: 'Sentence',
          type: 'text',
          placeholder: 'We focus on root-cause patterns, not calories',
        },
      ],
    },
    {
      key: 'imageDesktop',
      label: 'Image (desktop)',
      type: 'image-url',
      group: 'Image',
      placeholder: '/images/category/...',
    },
    {
      key: 'imageMobile',
      label: 'Image (mobile)',
      type: 'image-url',
      group: 'Image',
      placeholder: '/images/category/...',
    },
    {
      key: 'imageAlt',
      label: 'Image alt text',
      type: 'text',
      optional: true,
      group: 'Image',
    },
    {
      key: 'ctaLabel',
      label: 'CTA label',
      type: 'text',
      optional: true,
      group: 'CTA',
      placeholder: 'e.g. Start with Baseline',
      hint: 'Optional large pill CTA shown inside the copy column, below the reasons. Leave blank for no CTA.',
    },
    {
      key: 'ctaHref',
      label: 'CTA link',
      type: 'url',
      optional: true,
      group: 'CTA',
      placeholder: '/programs/nutrition/baseline',
      hint: 'A normal URL. The CTA renders only when both label and link are set.',
    },
    {
      key: 'ctaTone',
      label: 'CTA style',
      type: 'select',
      optional: true,
      group: 'CTA',
      options: ['denim', 'brand'],
      hint: 'denim = wide denim-gradient pill (default). brand = solid brand-900 pill.',
    },
  ],

  // ── feature.split-media.v1 ──────────────────────────────────────────────────
  'feature.split-media.v1': [
    { key: 'title', label: 'Title', type: 'text', optional: true },
    { key: 'description', label: 'Description', type: 'textarea', optional: true },
    imageSlotDescriptor('images', 'Background image'),
    {
      key: 'buttons',
      label: 'Buttons',
      type: 'object-list',
      optional: true,
      group: 'CTAs',
      fields: buttonSlotFields,
    },
    {
      key: 'slides',
      label: 'Carousel slides',
      type: 'object-list',
      optional: true,
      group: 'Slides',
      collapsedByDefault: true,
      hint: 'Optional. If provided, renders as a carousel. Each slide overrides the base image.',
      fields: [
        { key: 'title', label: 'Slide title', type: 'text', optional: true },
        { key: 'description', label: 'Slide description', type: 'textarea', optional: true },
        imageSlotDescriptor('images', 'Slide image', true),
      ],
    },
  ],

  // ── grid.cards.v1 ───────────────────────────────────────────────────────────
  'grid.cards.v1': [
    { key: 'title', label: 'Section title', type: 'text', optional: true },
    {
      key: 'items',
      label: 'Cards',
      type: 'object-list',
      fields: [
        { key: 'title', label: 'Card title', type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea', optional: true },
        { key: 'image', label: 'Image', type: 'image-url', optional: true },
        {
          key: 'button',
          label: 'CTA button',
          type: 'object-list',
          optional: true,
          fields: buttonSlotFields,
        },
      ],
    },
  ],

  // ── cta.band.v1 ─────────────────────────────────────────────────────────────
  'cta.band.v1': [
    { key: 'headline', label: 'Headline', type: 'textarea' },
    { key: 'body', label: 'Body', type: 'textarea', optional: true },
    {
      key: 'button',
      label: 'CTA button',
      type: 'object-list',
      optional: true,
      fields: buttonSlotFields,
    },
  ],

  // ── pricing.tiers.v1 ────────────────────────────────────────────────────────
  'pricing.tiers.v1': [
    { key: 'title', label: 'Section title', type: 'text', optional: true },
    { key: 'description', label: 'Description', type: 'textarea', optional: true },
    {
      key: 'cards',
      label: 'Pricing cards',
      type: 'object-list',
      fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'subtitle', label: 'Subtitle', type: 'text', optional: true },
        { key: 'description', label: 'Description', type: 'textarea', optional: true },
        { key: 'price', label: 'Price', type: 'text', optional: true, placeholder: '$425' },
        {
          key: 'paymentSchedule',
          label: 'Payment note',
          type: 'text',
          optional: true,
          placeholder: 'one-time payment',
        },
        { key: 'image', label: 'Image', type: 'image-url', optional: true },
        {
          key: 'button',
          label: 'CTA',
          type: 'object-list',
          fields: buttonSlotFields,
        },
      ],
    },
  ],

  // ── grid.program-cards.v1 ───────────────────────────────────────────────────
  'grid.program-cards.v1': [
    {
      key: 'collectionSlug',
      label: 'Program collection slug',
      type: 'text',
      placeholder: 'nutrition',
      hint: 'The program list, order, links, length labels, and card detail all come from the catalogue — only the slug and headings are authored here.',
    },
    {
      key: 'heading',
      label: 'Heading',
      type: 'text',
      optional: true,
      placeholder: 'The Nutrition Foundations sequence',
    },
    {
      key: 'subhead',
      label: 'Subhead',
      type: 'textarea',
      optional: true,
    },
  ],

  // ── nav.program-pathway.v1 ──────────────────────────────────────────────────
  'nav.program-pathway.v1': [
    {
      key: 'collectionSlug',
      label: 'Program collection slug',
      type: 'text',
      placeholder: 'nutrition',
      hint: 'Resolver-driven: the breadcrumb, step position, and previous/next links all come from the catalogue — only the two slugs are authored.',
    },
    {
      key: 'programSlug',
      label: 'Program slug',
      type: 'text',
      placeholder: 'baseline',
    },
  ],

  // ── feature.icon-tiles.v1 ───────────────────────────────────────────────────
  'feature.icon-tiles.v1': [
    {
      key: 'heading',
      label: 'Section heading',
      type: 'textarea',
      placeholder: 'What makes Nutrition Foundations different',
    },
    {
      key: 'intro',
      label: 'Intro paragraph',
      type: 'textarea',
      optional: true,
    },
    {
      key: 'surface',
      label: 'Surface',
      type: 'select',
      optional: true,
      options: ['dark', 'light'],
      hint: 'dark = brand-900 band (default). light = pale band.',
    },
    {
      key: 'tiles',
      label: 'Tiles',
      type: 'object-list',
      hint: '3 tiles is the standard. Keep descriptions to one line.',
      fields: [
        {
          key: 'icon',
          label: 'Icon',
          type: 'select',
          optional: true,
          options: ['insights', 'programs', 'notebook', 'quadrants', 'home', 'save'],
          hint: 'Allowlisted icons only. Leave blank for no glyph.',
        },
        { key: 'title', label: 'Title', type: 'text', placeholder: 'Stabilize first' },
        {
          key: 'description',
          label: 'Description',
          type: 'textarea',
          placeholder: 'Build meal rhythm before making advanced changes.',
        },
      ],
    },
  ],

  // ── comparison.table.v1 ─────────────────────────────────────────────────────
  'comparison.table.v1': [
    {
      key: 'heading',
      label: 'Section heading',
      type: 'textarea',
      placeholder: 'Built differently than most nutrition programs',
    },
    {
      key: 'columns',
      label: 'Column headers',
      type: 'object',
      hint: 'The two column labels shown above the rows.',
      fields: [
        { key: 'left', label: 'Left column label', type: 'text', placeholder: 'Fine Diet Programs' },
        { key: 'right', label: 'Right column label', type: 'text', placeholder: 'Most Programs' },
      ],
    },
    {
      key: 'rows',
      label: 'Comparison rows',
      type: 'object-list',
      hint: '4–5 rows is the editorial sweet spot.',
      fields: [
        {
          key: 'label',
          label: 'Row caption',
          type: 'text',
          optional: true,
          hint: 'Optional. Rendered above the row when present.',
        },
        { key: 'left', label: 'Left value', type: 'textarea', placeholder: 'A shared Baseline you observe before changing things' },
        { key: 'right', label: 'Right value', type: 'textarea', placeholder: 'A fixed protocol from day one' },
      ],
    },
  ],

  // ── lead.waitlist-capture.v1 ────────────────────────────────────────────────
  'lead.waitlist-capture.v1': [
    {
      key: 'variant',
      label: 'Variant (captureMode)',
      type: 'select',
      options: ['simple', 'priority', 'concierge'],
      hint: 'Maps 1:1 to the backend captureMode. simple = email + optional phone. priority = phone required. concierge = phone + intent goal.',
    },
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', optional: true, placeholder: 'Waitlist' },
    { key: 'title', label: 'Title', type: 'textarea', placeholder: 'Join the waitlist' },
    { key: 'description', label: 'Description', type: 'textarea', optional: true },
    {
      key: 'phonePrompt',
      label: 'Phone prompt hint',
      type: 'textarea',
      optional: true,
      hint: 'Small helper shown under the phone field.',
    },
    { key: 'nameLabel', label: 'Name field label', type: 'text', optional: true },
    { key: 'emailLabel', label: 'Email field label', type: 'text', optional: true },
    { key: 'phoneLabel', label: 'Phone field label', type: 'text', optional: true },
    {
      key: 'preferredChannelLabel',
      label: 'Preferred channel label',
      type: 'text',
      optional: true,
      group: 'Priority / Concierge',
    },
    { key: 'goalLabel', label: 'Goal field label', type: 'text', optional: true, group: 'Concierge' },
    {
      key: 'smsConsentLabel',
      label: 'SMS consent text',
      type: 'textarea',
      optional: true,
      group: 'SMS consent',
      hint: 'Checkbox label. Sent to the backend as the recorded consent text when opted in.',
    },
    {
      key: 'smsConsentVersion',
      label: 'SMS consent version',
      type: 'text',
      optional: true,
      group: 'SMS consent',
      placeholder: 'waitlist-sms-v1',
    },
    { key: 'ctaLabel', label: 'CTA label', type: 'text', placeholder: 'Join the Waitlist' },
    { key: 'submittingLabel', label: 'Submitting label', type: 'text', optional: true },
    { key: 'successTitle', label: 'Success title', type: 'text', optional: true },
    { key: 'successBody', label: 'Success body', type: 'textarea', optional: true },
    {
      key: 'successSmsNote',
      label: 'Success SMS note',
      type: 'textarea',
      optional: true,
      group: 'SMS consent',
      hint: 'Appended to confirmation copy when the visitor opted in.',
    },
    { key: 'errorFallback', label: 'Error fallback copy', type: 'textarea', optional: true },
    {
      key: 'campaignKey',
      label: 'Campaign key',
      type: 'text',
      group: 'Submission context',
      placeholder: 'waitlist_capture_v1',
    },
    {
      key: 'preferredChannel',
      label: 'Default preferred channel',
      type: 'select',
      optional: true,
      options: ['email', 'sms', 'either'],
      group: 'Submission context',
      hint: 'Default selected channel for priority/concierge. Blank = either.',
    },
    {
      key: 'source',
      label: 'Source',
      type: 'text',
      group: 'Submission context',
      placeholder: 'start_waitlist',
    },
    {
      key: 'programSlug',
      label: 'Program slug',
      type: 'text',
      optional: true,
      group: 'Submission context',
      hint: 'Pass-through. Leave blank unless this form targets a specific program waitlist.',
    },
    {
      key: 'offerKey',
      label: 'Offer key',
      type: 'text',
      optional: true,
      group: 'Submission context',
    },
    {
      key: 'startPageSlug',
      label: 'Start page slug',
      type: 'text',
      optional: true,
      group: 'Submission context',
      hint: 'Set when this form is authored on a specific Start page.',
    },
    {
      key: 'redirectPath',
      label: 'Redirect path',
      type: 'url',
      optional: true,
      group: 'Submission context',
      hint: 'Relative path starting with /. Recorded for context only; the form does not auto-redirect.',
    },
  ],

  // ── access.code-gate.v1 ─────────────────────────────────────────────────────
  'access.code-gate.v1': [
    {
      key: 'variant',
      label: 'Variant',
      type: 'select',
      options: ['simple', 'private_offer', 'cohort'],
      hint: 'Presentation hint only. Validation is identical for all variants; backend scope/context matching is configured per code, not per variant.',
    },
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', optional: true, placeholder: 'Private access' },
    { key: 'title', label: 'Title', type: 'textarea', placeholder: 'Enter your access code' },
    { key: 'description', label: 'Description', type: 'textarea', optional: true },
    { key: 'codeLabel', label: 'Code field label', type: 'text', optional: true, placeholder: 'Access code' },
    { key: 'codePlaceholder', label: 'Code placeholder', type: 'text', optional: true, placeholder: 'Enter code' },
    {
      key: 'collectEmail',
      label: 'Collect email',
      type: 'boolean',
      hint: 'When on, an email field is shown and a valid email is required before submit.',
    },
    { key: 'emailLabel', label: 'Email field label', type: 'text', optional: true, placeholder: 'Email', group: 'Email collection' },
    { key: 'emailPlaceholder', label: 'Email placeholder', type: 'text', optional: true, placeholder: 'you@example.com', group: 'Email collection' },
    { key: 'ctaLabel', label: 'CTA label', type: 'text', placeholder: 'Unlock Access' },
    { key: 'submittingLabel', label: 'Submitting label', type: 'text', optional: true, placeholder: 'Checking code…' },
    { key: 'successTitle', label: 'Success title', type: 'text', optional: true, placeholder: 'Access unlocked.', group: 'Success state' },
    { key: 'successBody', label: 'Success body', type: 'textarea', optional: true, group: 'Success state' },
    { key: 'successCtaLabel', label: 'Success CTA label', type: 'text', optional: true, placeholder: 'Continue', group: 'Success state' },
    {
      key: 'successCtaHref',
      label: 'Success CTA link',
      type: 'url',
      optional: true,
      group: 'Success state',
      placeholder: '#pricing',
      hint: 'Safe relative URL revealed on success (e.g. #pricing or /create-account?returnTo=/path). The module never calls checkout or grants access.',
    },
    {
      key: 'invalidMessage',
      label: 'Invalid / fallback error copy',
      type: 'textarea',
      optional: true,
      group: 'Error copy',
      hint: 'Shown for invalid, paused, or limit_reached statuses. Never exposes backend internals.',
    },
    {
      key: 'expiredMessage',
      label: 'Expired error copy',
      type: 'textarea',
      optional: true,
      group: 'Error copy',
    },
    {
      key: 'helpText',
      label: 'Help text',
      type: 'textarea',
      optional: true,
      group: 'Error copy',
      hint: 'Optional helper line shown beneath the form (e.g. support contact).',
    },
    {
      key: 'source',
      label: 'Source',
      type: 'text',
      group: 'Submission context',
      placeholder: 'start_access_code_gate',
      hint: 'Stable source string recorded with the redemption.',
    },
    {
      key: 'campaignKey',
      label: 'Campaign key',
      type: 'text',
      group: 'Submission context',
      placeholder: 'access_code_gate_v1',
    },
    {
      key: 'startPageSlug',
      label: 'Start page slug',
      type: 'text',
      optional: true,
      group: 'Submission context',
      hint: 'Pass-through. Set when authored on a specific Start page.',
    },
    {
      key: 'programSlug',
      label: 'Program slug',
      type: 'text',
      optional: true,
      group: 'Submission context',
    },
    {
      key: 'productSlug',
      label: 'Integrative Care product slug',
      type: 'text',
      optional: true,
      group: 'Submission context',
      hint: 'Pass-through for Integrative Care pages.',
    },
    {
      key: 'offerKey',
      label: 'Offer key',
      type: 'text',
      optional: true,
      group: 'Submission context',
    },
    {
      key: 'codeKey',
      label: 'Access code (code_key)',
      type: 'access-code-select',
      optional: true,
      group: 'Submission context',
      hint:
        'Select the access code this gate is bound to. Editors pick the code by its non-secret code_key — never the raw code. Manage codes in /admin/access-codes.',
    },
  ],

  // ── cta.program-offer.v1 ────────────────────────────────────────────────────
  'cta.program-offer.v1': [
    {
      key: 'collectionSlug',
      label: 'Program collection slug',
      type: 'text',
      placeholder: 'nutrition',
      hint: 'Matches a published program collection (storage: program_series).',
    },
    {
      key: 'programSlug',
      label: 'Program slug',
      type: 'text',
      optional: true,
      placeholder: 'baseline',
      hint: 'Targets one program. Leave blank for the collection-level CTA. The button label, link, and availability come from the central CTA resolver — they are not editable here.',
    },
    {
      key: 'eyebrow',
      label: 'Eyebrow',
      type: 'text',
      optional: true,
      placeholder: 'Ready when you are',
    },
    {
      key: 'heading',
      label: 'Heading',
      type: 'textarea',
      optional: true,
      placeholder: 'Start your nutrition baseline',
    },
    {
      key: 'body',
      label: 'Body',
      type: 'textarea',
      optional: true,
    },
    {
      key: 'align',
      label: 'Alignment',
      type: 'select',
      optional: true,
      options: ['center', 'left'],
    },
    {
      key: 'surface',
      label: 'Surface',
      type: 'select',
      optional: true,
      options: ['light', 'dark'],
      hint: 'light = pale band. dark = brand-900 band.',
    },
    {
      key: 'ctaStyle',
      label: 'CTA style',
      type: 'select',
      optional: true,
      options: ['full', 'primary-only'],
      hint: "full (default) = primary + secondary link + helper text. primary-only = a single primary CTA (matches the preview-era intro section).",
    },
  ],
};
