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
  | 'image-slot'
  | 'image-url';

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
  /** For 'object-list': descriptor for each item's fields */
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
      key: 'height',
      label: 'Hero height',
      type: 'select',
      optional: true,
      options: ['full', 'medium'],
      hint: 'full = 99vh. medium = 66vh.',
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
      key: 'buttons',
      label: 'CTA Buttons (legacy)',
      type: 'object-list',
      optional: true,
      group: 'CTAs',
      hint: 'Up to 2 buttons. Used only when the Hero CTA fields above are empty.',
      fields: buttonSlotFields,
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
      type: 'object-list',
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
