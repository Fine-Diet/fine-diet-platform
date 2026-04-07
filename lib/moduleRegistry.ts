/**
 * Module Registry — Taxonomy of all reusable page-building modules.
 *
 * Each entry documents a composable section that can be placed on any page.
 * The style-guide/modules page renders live previews from this data.
 *
 * Non-destructive: this file only exports data — nothing imports it
 * except the module style-guide page.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ModuleCategory =
  | 'hero'
  | 'content'
  | 'grid'
  | 'cta'
  | 'card'
  | 'form'
  | 'ambient';

export type BackgroundType =
  | 'image'
  | 'solid'
  | 'gradient'
  | 'blur'
  | 'glassmorphism'
  | 'aurora';

export type ContentPosition =
  | 'center'
  | 'bottom-left'
  | 'bottom-center'
  | 'top-left';

export interface ModuleDefinition {
  slug: string;
  name: string;
  description: string;
  componentPath: string;
  category: ModuleCategory;
  usedOn: string[];
  theme: 'dark' | 'light' | 'both';
  properties: {
    backgroundType: BackgroundType[];
    headlineSize: string;
    headlineWeight: string;
    bodySize: string;
    bodyWeight: string;
    textAlignment: 'center' | 'left';
    contentPosition: ContentPosition;
    cornerRadius: string;
    maxWidth: string;
    height: string;
    responsiveNotes: string;
    hasOverlay: boolean;
    overlayStyle?: string;
    hasButtons: boolean;
    buttonVariants?: string[];
    isContentDriven: boolean;
  };
  variants: string[];
  notes?: string;
}

/* ------------------------------------------------------------------ */
/*  Registry                                                           */
/* ------------------------------------------------------------------ */

/**
 * Style-guide catalog — taxonomy metadata for /style-guide/modules.
 *
 * Named MODULE_STYLE_CATALOG to distinguish from the *runtime* registry at
 * lib/modules/registry.ts which exports MODULE_REGISTRY (Zod schemas + components).
 * Only the three style-guide pages import this symbol.
 */
export const MODULE_STYLE_CATALOG: ModuleDefinition[] = [
  /* ── Hero ──────────────────────────────────────────────────────── */
  {
    slug: 'hero',
    name: 'Hero Section',
    description:
      'Full-viewport hero with background image (responsive mobile/desktop), centered headline, subhead, and CTA buttons. The primary landing moment.',
    componentPath: '@/components/home/HeroSection',
    category: 'hero',
    usedOn: ['/ (public homepage)'],
    theme: 'dark',
    properties: {
      backgroundType: ['image'],
      headlineSize: '6xl (desktop) / hero-mobile (mobile)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'base',
      bodyWeight: 'font-light (300)',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'rounded-b-[2.5rem]',
      maxWidth: '1200px',
      height: '99vh',
      responsiveNotes:
        'Switches between mobile/desktop background image at sm (640px). Text scales from hero-mobile → 6xl.',
      hasOverlay: true,
      overlayStyle: 'bg-black/30',
      hasButtons: true,
      buttonVariants: ['primary', 'tertiary'],
      isContentDriven: true,
    },
    variants: ['single-cta', 'dual-cta'],
    notes:
      'Content sourced from homeContent.json → hero. Images must have mobile + desktop variants.',
  },

  /* ── Hero Medium ────────────────────────────────────────────────── */
  {
    slug: 'hero-medium',
    name: 'Hero Medium',
    description:
      'Two-thirds-viewport hero with background image (responsive mobile/desktop), centered headline, subhead, and CTA buttons. Same structure as full Hero but at 66vh — suited for interior pages and secondary landing moments.',
    componentPath: '@/components/home/HeroMediumSection',
    category: 'hero',
    usedOn: [],
    theme: 'dark',
    properties: {
      backgroundType: ['image'],
      headlineSize: '6xl (desktop) / hero-mobile (mobile)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'base',
      bodyWeight: 'font-light (300)',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'rounded-b-[2.5rem]',
      maxWidth: '1200px',
      height: '66vh',
      responsiveNotes:
        'Switches between mobile/desktop background image at sm (640px). Text scales from hero-mobile → 6xl. Shorter height leaves room for content below the fold.',
      hasOverlay: true,
      overlayStyle: 'bg-black/30',
      hasButtons: true,
      buttonVariants: ['primary', 'tertiary'],
      isContentDriven: true,
    },
    variants: ['single-cta', 'dual-cta'],
    notes:
      'Identical to Hero Section except h-[66vh] instead of h-[99vh]. Use for interior pages where immediate content visibility below the fold is desired.',
  },

  /* ── Feature Card (Carousel) ───────────────────────────────────── */
  {
    slug: 'feature-card',
    name: 'Feature Card',
    description:
      'Rounded content card with background image, optional Swiper carousel for multiple slides, bottom-left aligned text with headline, description, and CTA buttons.',
    componentPath: '@/components/home/FeatureSection',
    category: 'content',
    usedOn: ['/ (public homepage)'],
    theme: 'dark',
    properties: {
      backgroundType: ['image'],
      headlineSize: '3xl',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'base',
      bodyWeight: 'font-light (300)',
      textAlignment: 'left',
      contentPosition: 'bottom-left',
      cornerRadius: 'rounded-[2.5rem]',
      maxWidth: '1200px',
      height: 'aspect-[5/6] mobile / 325px desktop',
      responsiveNotes:
        'Mobile uses 5:6 aspect ratio, desktop fixed 325px. Carousel autoplay 6s, fade effect, pagination bullets.',
      hasOverlay: true,
      overlayStyle: 'bg-gradient-to-t from-black/50 via-black/30 to-black/30',
      hasButtons: true,
      buttonVariants: ['primary', 'tertiary'],
      isContentDriven: true,
    },
    variants: ['single-slide', 'multi-slide-carousel'],
    notes:
      'Content sourced from homeContent.json → featureSections[]. Each slide can have its own images, title, description, and buttons.',
  },

  /* ── Grid Section (2-col) ──────────────────────────────────────── */
  {
    slug: 'grid-2col',
    name: 'Grid Section',
    description:
      'Responsive 2-column grid of GridItem cards. 1 column on mobile, 2 on md+. Each item is a rounded card with background image and bottom-aligned content.',
    componentPath: '@/components/home/GridSection + GridItem',
    category: 'grid',
    usedOn: ['/ (public homepage)'],
    theme: 'dark',
    properties: {
      backgroundType: ['image', 'solid'],
      headlineSize: '3xl',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'base',
      bodyWeight: 'font-light (300)',
      textAlignment: 'left',
      contentPosition: 'bottom-left',
      cornerRadius: 'rounded-[2.5rem]',
      maxWidth: 'full (inherits parent)',
      height: '325px or aspect-[4/3]',
      responsiveNotes:
        'Grid gap 3 (12px). Items can use aspect-[4/3] on mobile with fixed 325px on desktop, or fixed 325px everywhere.',
      hasOverlay: true,
      overlayStyle: 'bg-gradient-to-t from-black/50 via-black/30 to-black/30',
      hasButtons: true,
      buttonVariants: ['primary', 'secondary', 'tertiary', 'quaternary'],
      isContentDriven: true,
    },
    variants: ['with-image', 'solid-background', 'with-button', 'no-button'],
    notes:
      'GridItem accepts aspect="form-4-3" for 4:3 mobile aspect ratio. Falls back to neutral-700 solid when no image provided.',
  },

  /* ── Grid Section App (2-col, 650px) ─────────────────────────── */
  {
    slug: 'grid-section-app',
    name: 'Grid Section App',
    description:
      '650px max-width 2-column grid for app summary modules. Same visual treatment as Grid Section Medium (background image, gradient overlay, white copy, 215px, rounded-[2.5rem]) but replaces button with schema-driven summary data (title, primary value, metrics, status) and a drilldown chevron.',
    componentPath: '@/components/home/GridSectionApp + GridItemApp',
    category: 'grid',
    usedOn: ['/journal (daily summary)'],
    theme: 'dark',
    properties: {
      backgroundType: ['image', 'solid'],
      headlineSize: '2xl',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm',
      bodyWeight: 'font-light (300)',
      textAlignment: 'left',
      contentPosition: 'bottom-left',
      cornerRadius: 'rounded-[2.5rem]',
      maxWidth: '650px',
      height: '215px',
      responsiveNotes:
        'Single column at all breakpoints. Gap-3. Card height 215px. Copy vertically centered. No button — chevron drilldown on right edge.',
      hasOverlay: true,
      overlayStyle: 'bg-gradient-to-t from-black/50 via-black/30 to-black/30',
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: true,
    },
    variants: ['with-data', 'empty-state'],
    notes:
      'Data contract: lib/summaryRowTypes.ts (SummaryRowModule). UI hierarchy: title → primary.value+unit (note) → metrics (max 2, inline) → status → chevron. If empty.isEmpty, renders empty headline/body/cta instead.',
  },

  /* ── Grid App Section Home ──────────────────────────────────── */
  {
    slug: 'grid-app-section-home',
    name: 'Grid App Section Home',
    description:
      'Vertical list of navigational tiles for the /journal/home page. Each tile follows GridItemApp visual language (background image, gradient overlay, rounded-md, 140px, title + subtitle + chevron). Includes Programs, Assessments, Shop, and a placeholder Upgrade tile.',
    componentPath: '@/components/journal/GridAppSectionHome',
    category: 'grid',
    usedOn: ['/journal/home'],
    theme: 'dark',
    properties: {
      backgroundType: ['image', 'solid', 'gradient'],
      headlineSize: '3xl',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm',
      bodyWeight: 'font-light (300)',
      textAlignment: 'left',
      contentPosition: 'bottom-left',
      cornerRadius: 'rounded-md',
      maxWidth: '1000px (container); 650px (interior copy)',
      height: '140px per tile',
      responsiveNotes:
        'Single column at all breakpoints. Gap-3. Interior copy centered at max-w-[650px].',
      hasOverlay: true,
      overlayStyle: 'bg-gradient-to-t from-black/80 via-black/50 to-black/40',
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['with-image', 'solid-background', 'upgrade-placeholder'],
    notes:
      'Tiles: Programs → /programs, Assessments → /account/assessments, Shop → /shop. Upgrade tile is a non-linked placeholder for future offer integration.',
  },

  /* ── Grid Medium Section (2-col) ─────────────────────────────── */
  {
    slug: 'grid-2col-medium',
    name: 'Grid Section Medium',
    description:
      'Compact 2-column grid at 66% of standard grid height (215px vs 325px). Same structure and responsive behavior as Grid Section — suited for secondary content blocks, dashboard upsells, and tighter page compositions.',
    componentPath: '@/components/home/GridMediumSection + GridItemMedium',
    category: 'grid',
    usedOn: [],
    theme: 'dark',
    properties: {
      backgroundType: ['image', 'solid'],
      headlineSize: '2xl',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm',
      bodyWeight: 'font-light (300)',
      textAlignment: 'left',
      contentPosition: 'bottom-left',
      cornerRadius: 'rounded-[2.5rem]',
      maxWidth: 'full (inherits parent)',
      height: '215px or aspect-[4/3]',
      responsiveNotes:
        'Grid gap 3 (12px). Items use aspect-[4/3] on mobile with fixed 215px on desktop, or 215px everywhere. Tighter padding (p-5/p-6) and smaller type (2xl headline, sm body) to match reduced height.',
      hasOverlay: true,
      overlayStyle: 'bg-gradient-to-t from-black/50 via-black/30 to-black/30',
      hasButtons: true,
      buttonVariants: ['primary', 'secondary', 'tertiary', 'quaternary'],
      isContentDriven: true,
    },
    variants: ['with-image', 'solid-background'],
    notes:
      'Identical to Grid Section except 215px height (66% of 325px), 2xl headline (down from 3xl), sm body (down from base), and tighter padding.',
  },

  /* ── CTA Banner ────────────────────────────────────────────────── */
  {
    slug: 'cta-banner',
    name: 'CTA Banner',
    description:
      'Full-width banner with centered headline, optional description, and single CTA. Supports background image with blur overlay or solid color fallback.',
    componentPath: '@/components/home/CTASection',
    category: 'cta',
    usedOn: ['/ (public homepage — ctaSection)'],
    theme: 'dark',
    properties: {
      backgroundType: ['image', 'blur', 'solid'],
      headlineSize: '3xl mobile / 4xl desktop',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'base',
      bodyWeight: 'font-light (300)',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'none',
      maxWidth: '1200px (content); full-width section',
      height: '320px mobile / 300px desktop',
      responsiveNotes:
        'Full-bleed section. Content area max-w-2xl centered.',
      hasOverlay: true,
      overlayStyle: 'backdrop-blur-lg bg-black/50 (image) | bg-neutral-700 (solid)',
      hasButtons: true,
      buttonVariants: ['primary'],
      isContentDriven: true,
    },
    variants: ['with-image', 'solid-background', 'with-description', 'no-description'],
    notes:
      'The image variant uses backdrop-blur-lg for a frosted glass effect over the background photo. Solid variant falls back to neutral-700.',
  },

  /* ── Access Card (Dashboard) ───────────────────────────────────── */
  {
    slug: 'access-card',
    name: 'Access Card',
    description:
      'Compact dashboard card showing access status for a product/feature. Title + status badge on left/right, arrow link below. Dark glass style.',
    componentPath: 'pages/home.tsx → AccessCard (inline)',
    category: 'card',
    usedOn: ['/home (authenticated dashboard)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'sm (14px)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm',
      bodyWeight: 'font-medium (500)',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-2xl',
      maxWidth: 'full (inherits parent, max-w-2xl container)',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Single-column layout within max-w-2xl container.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['active', 'inactive', 'expiring-soon'],
    notes:
      'Status color is dynamic: dark_accent-400 for active, white/40 for inactive, amber-400 for expiring. Arrow link navigates to the feature.',
  },

  /* ── Quick Action Button ───────────────────────────────────────── */
  {
    slug: 'quick-action',
    name: 'Quick Action Button',
    description:
      'Tile-style link in a 2-column grid. Two lines of text (label + sub-label). Accent variant uses teal tint.',
    componentPath: 'pages/home.tsx → QuickActionButton (inline)',
    category: 'card',
    usedOn: ['/home (authenticated dashboard)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'base (16px)',
      headlineWeight: 'font-semibold (600)',
      bodySize: '11px',
      bodyWeight: 'regular (400)',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'rounded-2xl',
      maxWidth: '50% (grid cell)',
      height: 'auto (py-5 px-4)',
      responsiveNotes:
        'Always 2-column grid-cols-2 with gap-3.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['default (neutral)', 'accent (teal tint)'],
    notes:
      'Accent variant: bg-dark_accent-500/20, text-dark_accent-300. Default: bg-neutral-800/50, text-white.',
  },

  /* ── Recommendation Card ───────────────────────────────────────── */
  {
    slug: 'recommendation-card',
    name: 'Recommendation Card',
    description:
      'Dashboard recommendation card with title, description, and arrow link. Same glass-panel treatment as AccessCard.',
    componentPath: 'pages/home.tsx → RecommendationCard (inline)',
    category: 'card',
    usedOn: ['/home (authenticated dashboard)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'sm (14px)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'xs (12px)',
      bodyWeight: 'regular (400)',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-2xl',
      maxWidth: 'full (inherits parent, max-w-2xl container)',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Single-column list within max-w-2xl.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: [],
    notes:
      'Body text uses text-white/50 for low emphasis. Link uses dark_accent-400 teal.',
  },

  /* ── Form Panel (Waitlist / Glassmorphism) ─────────────────────── */
  {
    slug: 'form-panel',
    name: 'Form Panel',
    description:
      'Dark glassmorphism form container with rounded corners, backdrop blur, and white text on dark background. Used for waitlists, lead-gen, and signup forms.',
    componentPath: '@/app/journal-waitlist/WaitlistForm',
    category: 'form',
    usedOn: ['/journal-waitlist'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: '3xl mobile / 4xl–5xl desktop',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'base–lg',
      bodyWeight: 'font-light (300)',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'rounded-[2.5rem]',
      maxWidth: 'max-w-2xl',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Responsive padding: p-6 → p-8 → p-10 at sm/md. Input fields use rounded-xl, neutral-700/50 bg.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['primary'],
      isContentDriven: true,
    },
    variants: ['with-logo', 'with-goal-selector', 'success-state'],
    notes:
      'Panel background: bg-neutral-800/40 backdrop-blur. Inputs: bg-neutral-700/50 border-neutral-600. Focus ring: dark_accent-500.',
  },

  /* ── Journal Hero (App Shell) ──────────────────────────────────── */
  {
    slug: 'journal-hero',
    name: 'Journal Hero',
    description:
      'Full-height app shell with blurred background image, fixed date navigation header, score gauge, progress bar, and slotted content area for block sections.',
    componentPath: '@/components/journal/JournalHeroSection',
    category: 'hero',
    usedOn: ['/journal'],
    theme: 'dark',
    properties: {
      backgroundType: ['image', 'blur'],
      headlineSize: 'sm (date label)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'base',
      bodyWeight: 'font-semibold (600)',
      textAlignment: 'center',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-b-[2rem]',
      maxWidth: '1200px (blocks); 650px (progress bar)',
      height: 'min-h-screen',
      responsiveNotes:
        'Fixed header with backdrop-blur on scroll. Score gauge max-w-[550px]. Block sections max-w-[1200px]. Footer offset pb-28.',
      hasOverlay: true,
      overlayStyle: 'bg-gradient-to-b from-black/40 via-black/25 to-black/40 + backdrop-blur-[8px]',
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['with-nds-display', 'with-meal-banner'],
    notes:
      'Composable via children prop. JournalBlockSection components render inside. Dual overlay: gradient + uniform blur layer.',
  },

  /* ── Meal Section Card ─────────────────────────────────────────── */
  {
    slug: 'meal-section',
    name: 'Meal Section Card',
    description:
      'Tap-target card for a time-block meal entry (Morning, Midday, Evening). Shows title, action icon, and pill-style food item tags with remove buttons.',
    componentPath: '@/components/journal/MealSection',
    category: 'card',
    usedOn: ['/journal (via JournalBlockSection)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: '2xl',
      headlineWeight: 'font-regular (400)',
      bodySize: 'sm',
      bodyWeight: 'regular (400)',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-xl',
      maxWidth: 'full (inherits parent)',
      height: 'auto (p-7)',
      responsiveNotes:
        'Food pills use flex-wrap gap-2, rounded-full. Translucent variant adds white/10 border.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['empty (add action)', 'with-food-items', 'translucent'],
    notes:
      'Interactive: full card is a tap target. Action icons: plus (add), edit, arrow. Food items are removable pill tags.',
  },

  /* ── Aurora Background ─────────────────────────────────────────── */
  {
    slug: 'aurora-background',
    name: 'Aurora Background',
    description:
      'Fixed, full-screen animated ambient background layer. Subtle brown/earth-toned radial gradients with 20–25s animation cycle. Sits behind page content at z-0.',
    componentPath: '@/components/journal/AuroraBackground',
    category: 'ambient',
    usedOn: ['/journal-waitlist (page wrapper)'],
    theme: 'dark',
    properties: {
      backgroundType: ['aurora', 'gradient'],
      headlineSize: 'n/a',
      headlineWeight: 'n/a',
      bodySize: 'n/a',
      bodyWeight: 'n/a',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'none',
      maxWidth: 'full viewport',
      height: 'full viewport (fixed inset-0)',
      responsiveNotes:
        'Purely decorative. pointer-events-none, z-0. Journal: animate-aurora-journal / aurora-journal-reverse (keyframes auroraJournalRadials in tailwind.config.js).',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: [],
    notes:
      'Base layer: bg-brand-900. Two gradient layers at 30% and 20% opacity. Animation alternates direction for organic feel.',
  },

  /* ── Buy Offer Button ──────────────────────────────────────────── */
  {
    slug: 'buy-offer-button',
    name: 'Buy Offer Button',
    description:
      'Reusable purchase CTA that calls the checkout API and redirects to Stripe. Supports loading spinner, error state, and tracking metadata.',
    componentPath: '@/components/checkout/BuyOfferButton',
    category: 'cta',
    usedOn: ['/home', '/journal-waitlist', '/programs', '/buy/[offerKey]'],
    theme: 'dark',
    properties: {
      backgroundType: ['solid'],
      headlineSize: 'n/a',
      headlineWeight: 'n/a',
      bodySize: 'xs / sm / base (by size prop)',
      bodyWeight: 'font-medium (500)',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'rounded-full',
      maxWidth: 'inline (auto)',
      height: 'auto (py-1.5 / py-2.5 / py-3)',
      responsiveNotes:
        'Inline-flex, wraps with parent container. Error message appears below button.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['primary (teal)', 'secondary (dark glass)', 'ghost (transparent)'],
      isContentDriven: false,
    },
    variants: ['primary', 'secondary', 'ghost', 'loading', 'error'],
    notes:
      'Functional component: handles auth redirect (401), already-entitled redirect, and network errors inline. Tracks placement + UTM params.',
  },

  /* ── Button (Design System Primitive) ──────────────────────────── */
  {
    slug: 'button',
    name: 'Button',
    description:
      'Core design-system button. Pill-shaped with gradient (primary), outlined (secondary), translucent (tertiary), or white (quaternary) variants. Three sizes.',
    componentPath: '@/components/ui/Button',
    category: 'cta',
    usedOn: ['everywhere'],
    theme: 'both',
    properties: {
      backgroundType: ['gradient', 'solid'],
      headlineSize: 'n/a',
      headlineWeight: 'n/a',
      bodySize: 'base (all sizes)',
      bodyWeight: 'font-semibold (600)',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'rounded-full',
      maxWidth: 'inline (auto)',
      height: 'sm: py-1 / md: py-2 / lg: py-3',
      responsiveNotes:
        'Inline-flex with truncated text overflow. Focus ring: brand-500 with ring-offset-2.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['primary', 'secondary', 'tertiary', 'quaternary'],
      isContentDriven: false,
    },
    variants: ['primary', 'secondary', 'tertiary', 'quaternary', 'disabled', 'sm', 'md', 'lg'],
    notes:
      'Primary: teal gradient (dark_accent-500 → 900). Secondary: outlined brand-900. Tertiary: transparent + white border + backdrop-blur. Quaternary: solid white.',
  },

  /* ── Section Label (Dashboard) ─────────────────────────────────── */
  {
    slug: 'section-label',
    name: 'Section Label',
    description:
      'All-caps, extra-small tracking-wider label used to separate dashboard sections. Acts as a visual divider between content groups.',
    componentPath: 'pages/home.tsx (inline h2)',
    category: 'ambient',
    usedOn: ['/home (authenticated dashboard)'],
    theme: 'dark',
    properties: {
      backgroundType: ['solid'],
      headlineSize: 'xs (10px)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'n/a',
      bodyWeight: 'n/a',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'none',
      maxWidth: 'full',
      height: 'auto (mb-3 px-1)',
      responsiveNotes: 'No breakpoint changes. Always xs/uppercase.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: [],
    notes:
      'text-white/40, uppercase, tracking-wider. Consistent across all /home sections.',
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export const MODULE_CATEGORIES: { id: ModuleCategory; label: string }[] = [
  { id: 'hero', label: 'Heroes' },
  { id: 'content', label: 'Content' },
  { id: 'grid', label: 'Grids' },
  { id: 'cta', label: 'CTAs' },
  { id: 'card', label: 'Cards' },
  { id: 'form', label: 'Forms' },
  { id: 'ambient', label: 'Ambient' },
];
