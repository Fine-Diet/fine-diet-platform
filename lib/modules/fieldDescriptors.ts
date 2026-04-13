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
  | 'image-slot';

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
      key: 'buttons',
      label: 'CTA Buttons',
      type: 'object-list',
      optional: true,
      group: 'CTAs',
      hint: 'Up to 2 buttons. Primary + tertiary is the standard pair.',
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
      type: 'url',
      placeholder: '/images/category/integrative-care-hero.jpg',
    },
    {
      key: 'imageMobile',
      label: 'Background image (mobile)',
      type: 'url',
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
          type: 'url',
          placeholder: '/images/category/...',
        },
        {
          key: 'imageMobile',
          label: 'Image (mobile)',
          type: 'url',
          placeholder: '/images/category/...',
        },
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
          type: 'url',
          placeholder: '/images/category/...',
        },
        {
          key: 'imageMobile',
          label: 'Image (mobile)',
          type: 'url',
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
      type: 'url',
      group: 'Image',
      placeholder: '/images/category/...',
    },
    {
      key: 'imageMobile',
      label: 'Image (mobile)',
      type: 'url',
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
        { key: 'image', label: 'Image URL', type: 'url', optional: true },
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
        { key: 'image', label: 'Image URL', type: 'url', optional: true },
        {
          key: 'button',
          label: 'CTA',
          type: 'object-list',
          fields: buttonSlotFields,
        },
      ],
    },
  ],
};
