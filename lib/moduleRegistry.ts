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
  | 'ambient'
  // Packet 2A additive categories — app chrome/layout primitives don't fit the
  // content-oriented categories above without making the catalog misleading.
  | 'layout'
  | 'navigation';

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

/* ------------------------------------------------------------------ */
/*  Reuse-contract metadata (all optional, additive)                   */
/* ------------------------------------------------------------------ */

/** Lifecycle maturity of a module. */
export type ModuleStatus = 'stable' | 'experimental' | 'deprecated';

/**
 * Curation bucket for the style guide (Packet 2E).
 *
 * This is separate from `status` (engineering maturity) and answers a different
 * question for product/design/building agents: *should I use this module to
 * build new pages?*
 *
 * - approved: aligned with current Fine Diet design direction; reusable; preview
 *   works from the real component; safe for building agents.
 * - experimental: likely useful but not final — feature-flagged, not currently
 *   mounted in production UI, or still being validated.
 * - legacy: old visual/system pattern retained for reference; not for new builds.
 * - deprecated: actively should not be used; replaced or off-standard.
 * - reference_only: useful for understanding the system (chrome, primitives,
 *   patterns) but not a reusable page-building module.
 *
 * Default when omitted is `approved` (see getModuleLifecycle) — new catalog
 * entries are treated as approved foundations unless explicitly flagged.
 */
export type ModuleLifecycle =
  | 'approved'
  | 'experimental'
  | 'legacy'
  | 'deprecated'
  | 'reference_only';

/**
 * Where the module is intended to live. Mirrors the ownership surfaces in
 * docs/app/APP-MODULE-SYSTEM.md without coupling to that registry.
 */
export type ModuleSurface = 'public_site' | 'signed_in_app' | 'admin' | 'shared';

/**
 * How safely the module can be dropped into a new page.
 * - drop_in: render as-is with simple/no props.
 * - needs_data: requires typed props or fixtures to render.
 * - page_specific: tied to a specific page's data/composition.
 * - do_not_reuse_directly: self-fetches, requires auth/services, or takes over UI.
 */
export type ModuleReusability =
  | 'drop_in'
  | 'needs_data'
  | 'page_specific'
  | 'do_not_reuse_directly';

/**
 * Which presentation surfaces are safe for CMS/config to edit.
 * Truth/data remains code/backend-owned (see APP-MODULE-SYSTEM §4).
 */
export interface ModuleEditableFields {
  copy?: boolean;
  images?: boolean;
  colors?: boolean;
  buttons?: boolean;
  /** Templated merge fields the CMS may reference (e.g. {{firstName}}). */
  mergeFields?: string[];
}

/** What the module needs to render and how it degrades. */
export interface ModuleDataContract {
  /** Where real content comes from at runtime (e.g. 'homeContent.json → hero'). */
  contentSource?: string;
  /** Path to mock data used by the style-guide embed preview. */
  mockDataPath?: string;
  /** Props that must be supplied for the module to render. */
  requiredProps?: string[];
  /** Props that are optional / have safe defaults. */
  optionalProps?: string[];
  /** Fallback states the module supports (loading, empty, ready, error, locked…). */
  fallbackStates?: string[];
}

/** Ownership + safety notes for the module. */
export interface ModuleGovernance {
  /** True when CMS/config may edit (presentation-only) fields. */
  cmsEditable?: boolean;
  /** True when behavior/contract is code-owned and must not move to CMS yet. */
  developerOwned?: boolean;
  /** Safety/guardrail notes (entitlements, medical claims, functional side effects). */
  safetyNotes?: string[];
}

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

  /* ── Optional reuse-contract metadata (additive; safe to omit) ──── */
  status?: ModuleStatus;
  /**
   * Curation bucket (Packet 2E). Omit to default to 'approved'. Use
   * getModuleLifecycle() to read with the default applied.
   */
  lifecycle?: ModuleLifecycle;
  surface?: ModuleSurface;
  reusability?: ModuleReusability;
  editableFields?: ModuleEditableFields;
  dataContract?: ModuleDataContract;
  governance?: ModuleGovernance;
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
    status: 'stable',
    surface: 'public_site',
    reusability: 'needs_data',
    editableFields: { copy: true, images: true, buttons: true },
    dataContract: {
      contentSource: 'homeContent.json → hero',
      mockDataPath: 'embed/[slug].tsx → MOCK_HOME_CONTENT.hero',
      requiredProps: ['homeContent'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: true, developerOwned: true },
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
    status: 'stable',
    surface: 'public_site',
    reusability: 'needs_data',
    editableFields: { copy: true, images: true, buttons: true },
    dataContract: {
      contentSource: 'homeContent.json → hero',
      mockDataPath: 'embed/[slug].tsx → MOCK_HOME_CONTENT.hero',
      requiredProps: ['homeContent'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: true, developerOwned: true },
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
    status: 'stable',
    surface: 'public_site',
    reusability: 'needs_data',
    editableFields: { copy: true, images: true, buttons: true },
    dataContract: {
      contentSource: 'homeContent.json → featureSections[]',
      mockDataPath: 'embed/[slug].tsx → MOCK_HOME_CONTENT.featureSections[0] / MOCK_FEATURE_SINGLE',
      requiredProps: ['content'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: true, developerOwned: true },
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
    status: 'stable',
    surface: 'public_site',
    reusability: 'needs_data',
    editableFields: { copy: true, images: true, buttons: true },
    dataContract: {
      contentSource: 'homeContent.json → gridSections[]',
      mockDataPath: 'embed/[slug].tsx → MOCK_HOME_CONTENT.gridSections[0] / MOCK_GRID_NO_IMAGE',
      requiredProps: ['section'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: true, developerOwned: true },
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
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: { copy: true, images: true },
    dataContract: {
      contentSource: 'app/backend → SummaryRowModule (user truth)',
      mockDataPath: 'embed/[slug].tsx → MOCK_SUMMARY_MODULES / MOCK_SUMMARY_EMPTY',
      requiredProps: ['modules'],
      fallbackStates: ['empty', 'ready'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['Summary values are user-data truth — CMS may edit imagery/labels only, never the metrics.'],
    },
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
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: { copy: true, images: true },
    dataContract: {
      contentSource: 'hardcoded TILES[] in component',
      mockDataPath: 'n/a — self-contained, no props',
      requiredProps: [],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Tiles and routes are hardcoded; migrate to data-driven tiles before exposing to CMS.'],
    },
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
    status: 'stable',
    surface: 'shared',
    reusability: 'needs_data',
    editableFields: { copy: true, images: true, buttons: true },
    dataContract: {
      contentSource: 'homeContent.json → gridSections[] (same shape as Grid Section)',
      mockDataPath: 'embed/[slug].tsx → MOCK_HOME_CONTENT.gridSections[0] / MOCK_GRID_NO_IMAGE',
      requiredProps: ['section'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: true, developerOwned: true },
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
    status: 'stable',
    surface: 'public_site',
    reusability: 'needs_data',
    editableFields: { copy: true, images: true, buttons: true },
    dataContract: {
      contentSource: 'homeContent.json → ctaSection',
      mockDataPath: 'embed/[slug].tsx → MOCK_HOME_CONTENT.ctaSection / MOCK_CTA_SOLID',
      requiredProps: ['content'],
      optionalProps: ['content.description', 'content.images'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: true, developerOwned: true },
  },

  /* ── Access Card (Dashboard) ───────────────────────────────────── */
  {
    slug: 'access-card',
    name: 'Access Card',
    description:
      'Compact dashboard card showing access status for a product/feature. Title + status badge on left/right, arrow link below. Dark glass style.',
    componentPath: '@/components/app/cards/AccessCard',
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
      'Status color is dynamic: denim-400 for active, white/40 for inactive, amber-400 for expiring. Arrow link navigates to the feature. Extracted from pages/home.tsx to components/app/cards/AccessCard.tsx (Packet 2B-A) — the style-guide preview now renders the real component live. Presentational only; statusColor is computed by the caller from entitlement truth. Experimental: not currently mounted in production UI — the /home Quick Actions / Recommended sections are held back. Ready for use when those sections are re-enabled.',
    status: 'stable',
    lifecycle: 'experimental',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: { copy: true, colors: true },
    dataContract: {
      contentSource: 'entitlement/access truth (app/backend)',
      mockDataPath: 'embed/[slug].tsx → inline fixture props (title, status, statusColor, ctaLabel, ctaHref)',
      requiredProps: ['title', 'status', 'statusColor', 'ctaLabel', 'ctaHref'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['Access status reflects entitlement truth; CMS may edit labels/colors only.'],
    },
  },

  /* ── Quick Action Button ───────────────────────────────────────── */
  {
    slug: 'quick-action',
    name: 'Quick Action Button',
    description:
      'Tile-style link in a 2-column grid. Two lines of text (label + sub-label). Accent variant uses teal tint.',
    componentPath: '@/components/app/actions/QuickActionButton',
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
      'Accent variant: bg-denim-500/20, text-denim-300. Default: bg-neutral-800/50, text-white. Extracted from pages/home.tsx to components/app/actions/QuickActionButton.tsx (Packet 2B-A) — the style-guide preview now renders the real component live. Presentational link tile (label + sub). Experimental: not currently mounted in production UI — the /home Quick Actions section is held back. Ready for use when that section is re-enabled.',
    status: 'stable',
    lifecycle: 'experimental',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: { copy: true, colors: true },
    dataContract: {
      contentSource: 'hardcoded action tiles',
      mockDataPath: 'embed/[slug].tsx → inline fixture props (label, sub, href, accent)',
      requiredProps: ['label', 'sub', 'href'],
      optionalProps: ['accent'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: true, developerOwned: true },
  },

  /* ── Recommendation Card ───────────────────────────────────────── */
  {
    slug: 'recommendation-card',
    name: 'Recommendation Card',
    description:
      'Dashboard recommendation card with title, description, and arrow link. Same glass-panel treatment as AccessCard.',
    componentPath: '@/components/app/cards/RecommendationCard',
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
      'Body text uses text-white/50 for low emphasis. Link uses denim-400 teal. Extracted from pages/home.tsx to components/app/cards/RecommendationCard.tsx (Packet 2B-A) — the style-guide preview now renders the real component live. Takes a single rec object ({ title, description, ctaLabel, ctaHref }). Experimental: not currently mounted in production UI — the /home Recommended section is held back. Ready for use when that section is re-enabled.',
    status: 'stable',
    lifecycle: 'experimental',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'recommendation engine / app data',
      mockDataPath: 'embed/[slug].tsx → inline fixture rec ({ title, description, ctaLabel, ctaHref })',
      requiredProps: ['rec'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['Recommendation copy must avoid medical claims unless safety-reviewed.'],
    },
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
      'Panel background: bg-neutral-800/40 backdrop-blur. Inputs: bg-neutral-700/50 border-neutral-600. Focus ring: denim-500. Real component is WaitlistForm; the style-guide preview is a static, no-submit recreation to avoid network/state in the iframe.',
    status: 'stable',
    surface: 'public_site',
    reusability: 'needs_data',
    editableFields: { copy: true, buttons: true },
    dataContract: {
      contentSource: 'form copy + submits to lead-gen API',
      mockDataPath: 'embed/[slug].tsx → static recreation (read-only inputs)',
      requiredProps: [],
      optionalProps: ['logo', 'goalSelector'],
      fallbackStates: ['ready', 'success'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['Form submission + validation is code-owned; CMS edits copy/labels only.'],
    },
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
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: { images: true },
    dataContract: {
      contentSource: 'app/backend → NDS score, daily intake/goal, date context',
      mockDataPath: 'embed/[slug].tsx → inline props (score, dateLabel, dailyIntake, dailyGoal)',
      requiredProps: ['score', 'dateLabel', 'onPrevDay', 'onNextDay', 'canGoNext'],
      optionalProps: ['children', 'dailyIntake', 'dailyGoal', 'macroSummary', 'scoreLoading', 'scoreLabel'],
      fallbackStates: ['loading', 'ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Score, intake, and date context are user-data truth — not CMS-editable. Preserve app shell offsets (APP-UI-FOUNDATION §1).'],
    },
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
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'journal entries (food items per time block)',
      mockDataPath: 'embed/[slug].tsx → MOCK_FOOD_ITEMS',
      requiredProps: ['title'],
      optionalProps: ['actionLabel', 'actionIcon', 'foodItems', 'isTranslucent', 'onRemoveItem', 'onClick'],
      fallbackStates: ['empty', 'ready'],
    },
    governance: { cmsEditable: true, developerOwned: true },
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
      'Base layer: bg-brand-900. Two gradient layers at 30% and 20% opacity. Animation alternates direction for organic feel. Name collides with components/ui/aurora-background (generic wrapper that exports the same AuroraBackground symbol) — resolved in Packet 2C-C: the generic wrapper is cataloged separately as aurora-page-wrapper (imported aliased). This entry (components/journal/AuroraBackground) is the fixed decorative inset-0 layer with no children.',
    status: 'stable',
    surface: 'shared',
    reusability: 'drop_in',
    editableFields: { colors: true },
    dataContract: {
      contentSource: 'decorative — no content',
      mockDataPath: 'n/a — no props',
      requiredProps: [],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: false, developerOwned: true },
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
      'Functional component: handles auth redirect (401), already-entitled redirect, and network errors inline. Tracks placement + UTM params. Style-guide preview runs in preview-only mode (offerKey="preview-only") — real clicks error.',
    status: 'stable',
    surface: 'shared',
    reusability: 'do_not_reuse_directly',
    editableFields: { copy: true, buttons: true },
    dataContract: {
      contentSource: 'offer catalog + checkout API',
      mockDataPath: 'embed/[slug].tsx → offerKey="preview-only" (non-functional)',
      requiredProps: ['offerKey', 'label', 'placement'],
      optionalProps: ['variant', 'size'],
      fallbackStates: ['ready', 'loading', 'error'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: [
        'Functional CTA: calls checkout API and redirects to Stripe. Always pass a real offerKey + placement; never reuse for non-purchase actions. Visibility must respect entitlements.',
      ],
    },
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
      'Primary: teal gradient (denim-500 → 900). Secondary: outlined brand-900. Tertiary: transparent + white border + backdrop-blur. Quaternary: solid white.',
    status: 'stable',
    surface: 'shared',
    reusability: 'drop_in',
    editableFields: { copy: true, buttons: true },
    dataContract: {
      contentSource: 'children (label) + props',
      mockDataPath: 'embed/[slug].tsx → inline (all variants × sizes)',
      requiredProps: ['children'],
      optionalProps: ['variant', 'size', 'disabled', 'className'],
      fallbackStates: ['ready', 'disabled'],
    },
    governance: { cmsEditable: true, developerOwned: true },
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
      'text-white/40, uppercase, tracking-wider. Consistent across all /home sections. A pattern (inline h2), not yet an importable component — preview is a static recreation. Optional: ship a SectionLabel primitive. Reference-only pattern, not a page-building component. Do not import for new builds; copy the styling convention instead.',
    status: 'stable',
    lifecycle: 'reference_only',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'static label text',
      mockDataPath: 'embed/[slug].tsx → static recreation (pattern, not a component)',
      requiredProps: ['label'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: true, developerOwned: true },
  },

  /* ════════════════════════════════════════════════════════════════ */
  /*  Packet 2A — app surfaces (NDS gauge, layout, chrome, log)         */
  /* ════════════════════════════════════════════════════════════════ */

  /* ── Nutrition Density Gauge ───────────────────────────────────── */
  {
    slug: 'nutrition-density-gauge',
    name: 'Nutrition Density Gauge',
    description:
      'Half-donut d3 gauge that visualizes a Nutrition Density score (0–100). Tick marks fill toward the score, with the score value and label overlaid in the well. Supports loading and unavailable (null) states.',
    componentPath: '@/components/journal/NutritionDensityGauge',
    category: 'content',
    usedOn: ['/journal (JournalHeroSection score)'],
    theme: 'dark',
    properties: {
      backgroundType: ['solid'],
      headlineSize: '8xl / 6.4rem (score number)',
      headlineWeight: 'font-regular (400)',
      bodySize: 'base / lg (label)',
      bodyWeight: 'font-semibold (600)',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'none (SVG)',
      maxWidth: '100% of container (fixed viewBox 95×50)',
      height: 'auto (scales by aspect ratio)',
      responsiveNotes:
        'Fixed viewBox scales SVG to 100% container width; height follows aspect ratio. Score type scales 8xl → 6.4rem at md.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['default', 'loading', 'empty'],
    notes:
      'Pure presentational d3 gauge — animates from 0 to value on mount (animate prop). value=null renders an em-dash placeholder; isLoading shows "Loading…". Score is user-data truth, not CMS-editable.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'app/backend → NDS score (0–100)',
      mockDataPath: 'embed/[slug].tsx → inline value (72 / null / isLoading)',
      requiredProps: ['value'],
      optionalProps: ['animate', 'className', 'isLoading', 'label'],
      fallbackStates: ['loading', 'empty', 'ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Score is user-data truth — CMS may edit the label text only, never the value.'],
    },
  },

  /* ── Stacked Page Section / Hero (layout primitive) ────────────── */
  {
    slug: 'stacked-page-section',
    name: 'Stacked Page Section',
    description:
      'Stacked-sheet layout primitive. StackedPageHero is the flat-bottom base layer (z-0); StackedPageSection layers sit above with a negative top margin (-mt-8) and rounded top edge (rounded-t-[2rem]), each incrementing z-index. Rule-backed by .cursor/rules/stacked-page-sections.mdc.',
    componentPath: '@/components/layout/StackedPageSection (StackedPageHero + StackedPageSection)',
    category: 'layout',
    usedOn: ['/app (log)', '/app (home)'],
    theme: 'both',
    properties: {
      backgroundType: ['solid'],
      headlineSize: 'n/a (layout shell)',
      headlineWeight: 'n/a',
      bodySize: 'n/a',
      bodyWeight: 'n/a',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'rounded-t-[2rem] (sections)',
      maxWidth: 'full-width section; max-w-[650px] inner content',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Each section: -mt-8 overlap, rounded top, px-6 pt-6 sm:pt-7 pb-20. layer prop maps 1→z-10, 2→z-20… Inner content centered at max-w-[650px] (override via contentClassName).',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['default'],
    notes:
      'Provide a solid bg-* per section so the overlap reads. One StackedPageSection per logical block; rounded inner cards live inside the section, not as the shell. See the stacked-page-sections rule.',
    status: 'stable',
    surface: 'shared',
    reusability: 'drop_in',
    editableFields: { colors: true },
    dataContract: {
      contentSource: 'composition — children only',
      mockDataPath: 'embed/[slug].tsx → placeholder hero + 2 stacked layers',
      requiredProps: ['layer', 'children'],
      optionalProps: ['className', 'contentClassName'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: false, developerOwned: true },
  },

  /* ── App Top Nav (shell chrome) ────────────────────────────────── */
  {
    slug: 'app-top-nav',
    name: 'App Top Nav',
    description:
      'Fixed top navigation bar for the signed-in app shell. Product wordmark on the left, hamburger (profile) link on the right. Translucent black backdrop-blur bar pinned to the top edge. Shell constraint per APP-UI-FOUNDATION §2.',
    componentPath: '@/components/journal/AppTopNav',
    category: 'navigation',
    usedOn: ['/app (via AppShell)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'base (wordmark)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'n/a',
      bodyWeight: 'n/a',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'none',
      maxWidth: 'full-width bar; max-w-[800px] inner row',
      height: 'h-9 row (fixed)',
      responsiveNotes:
        'position: fixed top-0, z-40. bg-black/20 backdrop-blur-md with a hairline bottom border. Inner row centered at max-w-[800px].',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['default'],
    notes:
      'Hardcoded wordmark + profile link (APP_ROUTES.profile). Fixed positioning — pair with the AppShell top offset (pt-9). Preview wraps it in a relative spacer so the fixed bar is visible in the iframe. Reference-only shell chrome — it is composed by AppShell, not placed by hand. Do not add a second top nav to new builds; use AppShell instead.',
    status: 'stable',
    lifecycle: 'reference_only',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'hardcoded wordmark + route',
      mockDataPath: 'n/a — no props (renders inside a relative spacer in preview)',
      requiredProps: [],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Shell chrome — preserve fixed offset and z-order (APP-UI-FOUNDATION §2).'],
    },
  },

  /* ── Journal Footer Nav (shell chrome) ─────────────────────────── */
  {
    slug: 'journal-footer-nav',
    name: 'Journal Footer Nav',
    description:
      'Fixed bottom tab bar for the signed-in app: Home / Programs / Log / Plans with an animated selection pill, plus a separate Quick Entry (+) control that opens a log-type menu. Shell constraint per APP-UI-FOUNDATION §3–4.',
    componentPath: '@/components/journal/JournalFooterNav',
    category: 'navigation',
    usedOn: ['/app (via app shell layout)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'n/a (icon tabs)',
      headlineWeight: 'n/a',
      bodySize: 'base (quick-entry menu)',
      bodyWeight: 'font-regular (400)',
      textAlignment: 'center',
      contentPosition: 'bottom-center',
      cornerRadius: 'rounded-full',
      maxWidth: 'max-w-[600px] (pill + quick entry row)',
      height: 'auto (py-2 rows)',
      responsiveNotes:
        'position: fixed bottom-0, z-[70]. Selection/hover pills are absolutely positioned (PILL_WIDTH=67) and animate via measured button centers. Quick Entry menu opens upward.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['tab', 'quick-entry'],
      isContentDriven: false,
    },
    variants: ['home-active', 'programs-active', 'log-active', 'plans-active'],
    notes:
      'Active tab is derived from the live router.pathname (not a prop) — inside the style-guide route deriveActiveTab() resolves to "log". The listed active-tab variants are real visual states on app routes but cannot be driven by props here; the live preview shows the default (log-active) state and the Quick Entry menu toggle. Reference-only shell chrome — part of the app layout, not placed by hand. Do not add a second footer nav to new builds; use the app shell layout instead.',
    status: 'stable',
    lifecycle: 'reference_only',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'hardcoded nav items + routes; active tab from router.pathname',
      mockDataPath: 'n/a — no props (router-driven active state)',
      requiredProps: [],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Shell chrome — preserve fixed offset, z-order, and route map (APP-UI-FOUNDATION §3–4).'],
    },
  },

  /* ── App Shell (layout wrapper) ────────────────────────────────── */
  {
    slug: 'app-shell',
    name: 'App Shell',
    description:
      'Top-level signed-in app wrapper: dark brand-900 base, white text, top offset (pt-9), and the fixed AppTopNav. Slots page content via children. Encodes the app shell offset/background contract.',
    componentPath: '@/components/journal/AppShell',
    category: 'layout',
    usedOn: ['/app (shell wrapper)'],
    theme: 'dark',
    properties: {
      backgroundType: ['solid'],
      headlineSize: 'n/a (layout shell)',
      headlineWeight: 'n/a',
      bodySize: 'n/a',
      bodyWeight: 'n/a',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'none',
      maxWidth: 'full viewport',
      height: 'min-h-screen',
      responsiveNotes:
        'min-h-screen bg-brand-900 text-white pt-9 to clear the fixed AppTopNav. Children render below the offset.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['default'],
    notes:
      'Composes AppTopNav + dark base + pt-9 offset. Drop page content in as children. Preserve the offset so content clears the fixed nav (APP-UI-FOUNDATION §1–2).',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: {},
    dataContract: {
      contentSource: 'composition — children only',
      mockDataPath: 'embed/[slug].tsx → placeholder content children',
      requiredProps: ['children'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Shell wrapper — preserve top offset and z-order (APP-UI-FOUNDATION §1–2).'],
    },
  },

  /* ── Journal Block Section (log meal block) ────────────────────── */
  {
    slug: 'journal-block-section',
    name: 'Journal Block Section',
    description:
      'Time-block meal summary for the log surface (Morning / Midday / Evening or a resolved plan slot). Shows a macro summary line and item list when entries exist, or an "Add Your Meal" CTA when empty. Takes pre-filtered entries from the parent.',
    componentPath: '@/components/journal/JournalBlockSection',
    category: 'content',
    usedOn: ['/app/log (via JournalHeroSection)'],
    theme: 'dark',
    properties: {
      backgroundType: ['solid'],
      headlineSize: 'sm (block label)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm',
      bodyWeight: 'font-regular (400)',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-full (CTAs)',
      maxWidth: 'full (inherits parent)',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Header px-6 pt-7. Empty state shows a full-width denim "Add Your Meal" button; filled state shows a truncated macro line + item summary + "Add/Edit" button.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['add', 'add-edit'],
      isContentDriven: false,
    },
    variants: ['empty', 'with-items'],
    notes:
      'Meal-guidance signals (NDS protein score, flag popover) are gated off (SHOW_MEAL_GUIDANCE_SIGNALS=false). CTAs are next/link routes into the log-new flow. Preview passes mock intake JournalEntry[]; entries are user-data truth.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'journal entries (pre-filtered per block/slot)',
      mockDataPath: 'embed/[slug].tsx → MOCK_BLOCK_ENTRIES (intake) / []',
      requiredProps: ['date', 'entries'],
      optionalProps: ['block', 'mealSlot', 'foodNutrientMap', 'redirect', 'showNDSIndicators'],
      fallbackStates: ['empty', 'ready'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['Entries, calories, and macros are user-data truth — CMS may edit labels/copy only.'],
    },
  },

  /* ── Daily Summary (tracking tiles) ────────────────────────────── */
  {
    slug: 'daily-summary',
    name: 'Daily Summary',
    description:
      'Vertical stack of tracking tiles derived from the user\'s enabled tracking preferences (Hydration, Sleep, Mood, Movement, etc.). Each tile (TrackingModuleCard) shows a primary value, up to two metrics, a status line, and a drilldown CTA — or an empty state with a log CTA.',
    componentPath: '@/components/journal/DailySummary (TrackingModuleCard)',
    category: 'card',
    usedOn: ['/app (daily tracking summary)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism', 'solid'],
      headlineSize: 'xl (tile title) / 5xl (primary value)',
      headlineWeight: 'font-semibold (600) / font-regular (400)',
      bodySize: 'sm',
      bodyWeight: 'font-light (300)',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-2xl',
      maxWidth: 'max-w-[750px]',
      height: 'min-h-[150px] per tile',
      responsiveNotes:
        'Single-column grid, gap-7, max-w-[750px]. Per-type accent backgrounds. Each tile is a full-card next/link. The "intake" tile is filtered out (handled by the log surface).',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['drilldown', 'log-empty'],
      isContentDriven: false,
    },
    variants: ['ready', 'empty'],
    notes:
      'Builds SummaryRowModule tiles from JournalEntry[] + enabledKeys (aliases normalized; intake excluded). Empty entries render per-tile empty states. Values are user-data truth; CMS may edit tile imagery/labels only.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: { copy: true, images: true },
    dataContract: {
      contentSource: 'app/backend → JournalEntry[] + enabled tracking preferences',
      mockDataPath: 'embed/[slug].tsx → MOCK_SUMMARY_ENTRIES + MOCK_SUMMARY_ENABLED / []',
      requiredProps: ['date', 'entries', 'enabledKeys'],
      optionalProps: ['waterGoalOz', 'tileImages'],
      fallbackStates: ['empty', 'ready'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['Tracking values are user-data truth — CMS may edit imagery/labels only, never the metrics.'],
    },
  },

  /* ════════════════════════════════════════════════════════════════ */
  /*  Packet 2B-B — extracted /journal/home presentational modules      */
  /* ════════════════════════════════════════════════════════════════ */

  /* ── Today's Rhythm ────────────────────────────────────────────── */
  {
    slug: 'today-rhythm',
    name: "Today's Rhythm",
    description:
      "Schedule-preview module for /journal/home. Background-image card listing the user's enabled meal slots with per-slot Logged / Upcoming / Log Now state, an actionable (current) meal highlighted as a tap target, and a \"View Full Day Plan\" CTA. Supports a loading skeleton and an empty (no meal times) state.",
    componentPath: '@/components/journal/home/TodayRhythm',
    category: 'content',
    usedOn: ['/journal/home'],
    theme: 'dark',
    properties: {
      backgroundType: ['image'],
      headlineSize: '3xl (Schedule Preview)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm / base (rows)',
      bodyWeight: 'font-regular (400)',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-[24px]',
      maxWidth: '750px',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Rows use a 86px/1fr/auto grid. Actionable row is a denim-tinted Link; others are static. Loading shows 3 pulse bars; empty shows a profile prompt. Gradient overlay over the bg image.',
      hasOverlay: true,
      overlayStyle: 'bg-gradient-to-b from-black/35 via-brand-900/40 to-black/65',
      hasButtons: true,
      buttonVariants: ['log-now (row)', 'view-day-plan'],
      isContentDriven: false,
    },
    variants: ['default', 'loading', 'empty'],
    notes:
      'Extracted from pages/journal/home.tsx (Packet 2B-B); now live-previewable. Prop-driven — the page resolves slots + today entries and passes them in. The actionable meal is derived from the current time, so the highlighted row depends on when the preview is viewed. Routing/CTAs go into the log-new flow (inert in preview).',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: { images: true },
    dataContract: {
      contentSource: 'app/backend → enabled meal slots + today journal entries',
      mockDataPath: 'embed/[slug].tsx → MOCK_RHYTHM_SLOTS / MOCK_BLOCK_ENTRIES / []',
      requiredProps: ['slots', 'todayEntries', 'loading', 'dayPlanHref'],
      fallbackStates: ['loading', 'empty', 'ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Slot logged/upcoming state reflects journal truth — CMS may edit imagery only, never the schedule state.'],
    },
  },

  /* ── Nutrition Density Scroller ────────────────────────────────── */
  {
    slug: 'nutrition-density-scroller',
    name: 'Nutrition Density Scroller',
    description:
      'Horizontal, snap-scrolling strip of NDS metrics for /journal/home: an Overall Score cell followed by seven subscore factor cells (Whole Food Ratio, Protein, Fiber, Added Sugar, Phytonutrient, Omega Balance, Micronutrient) shown as qualitative status (Strong/Building/Support/Watch/Logged/Pending). Dot + arrow controls track the active card.',
    componentPath: '@/components/journal/home/NutritionDensityScroller',
    category: 'content',
    usedOn: ['/journal/home'],
    theme: 'dark',
    properties: {
      backgroundType: ['solid'],
      headlineSize: 'xl (section) / 3xl (values)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'xs (labels)',
      bodyWeight: 'font-regular (400)',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'rounded-2xl',
      maxWidth: '750px',
      height: 'auto (fixed-width 176px cells)',
      responsiveNotes:
        'Snap-x mandatory scroll, hidden scrollbar. 176px cells. Arrow buttons enable/disable at edges; dot indicator widens for the active card. Distinct from the NutritionDensityGauge (d3 half-donut).',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['prev', 'next', 'dot'],
      isContentDriven: false,
    },
    variants: ['ready', 'loading', 'empty'],
    notes:
      'Extracted from pages/journal/home.tsx → NutritionDensityModule (Packet 2B-B); now live-previewable. Prop-driven: the page owns useNDS() and passes data/isLoading. Distinct from nutrition-density-gauge. Subscores → status mapping (getSubscoreStatus) ships with the component.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: {},
    dataContract: {
      contentSource: 'app/backend → NDSData (useNDS hook, page-owned)',
      mockDataPath: 'embed/[slug].tsx → MOCK_NDS_DATA / null',
      requiredProps: ['data', 'isLoading'],
      fallbackStates: ['loading', 'empty', 'ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Scores are user-data truth — not CMS-editable.'],
    },
  },

  /* ── Quick Entry Row ───────────────────────────────────────────── */
  {
    slug: 'quick-entry-row',
    name: 'Quick Entry Row',
    description:
      'Five-up row of color-coded quick-entry shortcuts (Log Meal, Hydration, Mood, Movement, More) for /journal/home. Each is a circular accent chip with a label linking into the log-new flow at the relevant tab.',
    componentPath: '@/components/journal/home/QuickEntryRow',
    category: 'content',
    usedOn: ['/journal/home'],
    theme: 'dark',
    properties: {
      backgroundType: ['solid'],
      headlineSize: 'xl (prompt)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'xs / sm (labels)',
      bodyWeight: 'font-medium (500)',
      textAlignment: 'center',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-full (chips)',
      maxWidth: '750px',
      height: 'auto',
      responsiveNotes:
        'grid-cols-5 with gap-2 (mobile) / gap-6 (sm+). Chips are h-14/w-14 (mobile) → h-16/w-16 (sm). Hover scales chips slightly.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['log-meal', 'hydration', 'mood', 'movement', 'more'],
      isContentDriven: false,
    },
    variants: ['default'],
    notes:
      'Extracted from pages/journal/home.tsx → QuickEntryModule (Packet 2B-B); now live-previewable. Self-contained — hardcoded shortcut items + routes (inert in preview). Migrate to data-driven items before exposing to CMS.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: { copy: true, colors: true },
    dataContract: {
      contentSource: 'hardcoded quickEntryItems[] in component',
      mockDataPath: 'n/a — self-contained, no props',
      requiredProps: [],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Shortcut routes are hardcoded; keep developer-owned until data-driven.'],
    },
  },

  /* ── Prep & Pantry Card ────────────────────────────────────────── */
  {
    slug: 'prep-pantry-card',
    name: 'Prep & Pantry Card',
    description:
      'Background-image readiness card for /journal/home. Renders a fully-resolved view model (headline, body, optional 3-up coverage metrics, optional blocker note, primary + secondary CTAs). Presentational split: the page owns the usePantryReadiness() hook and the derivePrepPantryView() shaping.',
    componentPath: '@/components/journal/home/PrepPantryCard',
    category: 'card',
    usedOn: ['/journal/home'],
    theme: 'dark',
    properties: {
      backgroundType: ['image'],
      headlineSize: '2xl / 3xl',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm',
      bodyWeight: 'font-regular (400)',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-[24px]',
      maxWidth: '750px',
      height: 'min-h-[150px] / min-h-[180px] (sm)',
      responsiveNotes:
        'Left-to-right gradient over the bg image. Metrics render as a 3-col grid of glass tiles when present. Two stacked full-width pill CTAs (primary denim, secondary outlined).',
      hasOverlay: true,
      overlayStyle: 'bg-gradient-to-r from-black/75 via-brand-900/75 to-black/40',
      hasButtons: true,
      buttonVariants: ['primary', 'secondary'],
      isContentDriven: false,
    },
    variants: ['ready', 'missing-items', 'empty'],
    notes:
      'Presentational split from pages/journal/home.tsx → PrepPantryModule (Packet 2B-B). The card takes a pre-derived PrepPantryView; the live page keeps usePantryReadiness() + derivePrepPantryView(). Pantry/grocery coverage values are user-data truth.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: { images: true },
    dataContract: {
      contentSource: 'app/backend → PantryReadinessSummary (shaped by derivePrepPantryView, page-owned)',
      mockDataPath: 'embed/[slug].tsx → MOCK_PANTRY_VIEW_READY / _MISSING / _EMPTY',
      requiredProps: ['view'],
      fallbackStates: ['empty', 'ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Coverage metrics reflect pantry/grocery truth — CMS may edit imagery only, never the numbers.'],
    },
  },

  /* ── Home Template Cards ───────────────────────────────────────── */
  {
    slug: 'home-template-cards',
    name: 'Home Template Cards',
    description:
      'Two-up grid of light template cards for /journal/home: a "Your Default Path" program card (image, eyebrow, headline, progress, chevron) and a "Why it matters today" insight card (image-on-right on mobile). Links to program/log routes.',
    componentPath: '@/components/journal/home/HomeTemplateCards',
    category: 'grid',
    usedOn: ['/journal/home'],
    theme: 'light',
    properties: {
      backgroundType: ['solid', 'image'],
      headlineSize: 'base',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'xs',
      bodyWeight: 'font-regular (400)',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-2xl',
      maxWidth: '750px',
      height: 'auto',
      responsiveNotes:
        'grid-cols-1 (mobile) → grid-cols-2 (sm). Mobile: horizontal layout with a 112px image; sm: stacked with a 5:2 image. brand-50 (light) cards on the dark page.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['default'],
    notes:
      'Extracted from pages/journal/home.tsx (Packet 2B-B); now live-previewable. Self-contained — hardcoded card content + images + routes (inert in preview). The only light-themed app-home module. Migrate to data-driven content before exposing to CMS.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: { copy: true, images: true },
    dataContract: {
      contentSource: 'hardcoded cards[] in component',
      mockDataPath: 'n/a — self-contained, no props',
      requiredProps: [],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Progress label ("Step 2 of 6") is placeholder copy, not live program truth — keep developer-owned until wired to real progress.'],
    },
  },

  /* ════════════════════════════════════════════════════════════════ */
  /*  Packet 2C-A — low-risk drop-in app components                     */
  /* ════════════════════════════════════════════════════════════════ */

  /* ── Saved Meal Card ───────────────────────────────────────────── */
  {
    slug: 'saved-meal-card',
    name: 'Saved Meal Card',
    description:
      'Fixed-size (200×100) tap-target card for a saved meal in the log surface carousel. Shows the meal name (2-line clamp) and an optional "Nutrition Density {n}" line. Translucent glass fill with a hover state.',
    componentPath: '@/components/journal/SavedMealCard',
    category: 'card',
    usedOn: ['/app/log (saved meals carousel)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'base (name)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm (NDS line)',
      bodyWeight: 'font-light (300)',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-xl',
      maxWidth: '200px (fixed)',
      height: '100px (fixed)',
      responsiveNotes:
        'Fixed 200×100 flex-shrink-0 tile for a horizontal carousel. Name clamps to 2 lines. bg-white/5 → hover bg-white/10.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['card (button)'],
      isContentDriven: false,
    },
    variants: ['default', 'minimal'],
    notes:
      'Cataloged in Packet 2C-A; live-previewable. Pure presentational button — onClick is the only behavior (harmless in preview). "minimal" omits nutritionDensity (name only). No selected/active state exists in the component.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'saved meal templates (app/backend)',
      mockDataPath: 'embed/[slug].tsx → inline fixture props (id, name, nutritionDensity)',
      requiredProps: ['id', 'name'],
      optionalProps: ['nutritionDensity', 'onClick'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Nutrition Density value is user-data truth — CMS may edit the label text only.'],
    },
  },

  /* ── Journal Date Selector ─────────────────────────────────────── */
  {
    slug: 'journal-date-selector',
    name: 'Journal Date Selector',
    description:
      'Sticky day-navigation header: a centered date label ("Today" / "Yesterday" / "Mon Jan 23") flanked by previous/next chevrons. The next chevron disables when the selected day is today (no future navigation). Backdrop-blur header bar.',
    componentPath: '@/components/journal/JournalDateSelector',
    category: 'navigation',
    usedOn: [],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'lg (date label)',
      headlineWeight: 'font-medium (500)',
      bodySize: 'n/a',
      bodyWeight: 'n/a',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'none',
      maxWidth: 'full-width header',
      height: 'auto (py-6)',
      responsiveNotes:
        'position: sticky top-0, z-30, with an absolute backdrop-blur-md layer. Chevrons absolutely positioned left/right; next chevron dims + disables when isToday().',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['prev-day', 'next-day'],
      isContentDriven: false,
    },
    variants: ['today', 'past-day'],
    notes:
      'Cataloged in Packet 2C-A; live-previewable. Standalone navigator that manages its own selected-date state (initialDate prop + onDateChange callback) — clicks only update internal state (no routing, no data). Not currently mounted in the app; the live date nav lives inside JournalHeroSection. "today" disables the next chevron; "past-day" enables it. Future navigation is blocked by design. Experimental: not currently mounted in production UI — superseded in practice by the JournalHeroSection date nav.',
    status: 'experimental',
    lifecycle: 'experimental',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: {},
    dataContract: {
      contentSource: 'local date state (initialDate prop)',
      mockDataPath: 'embed/[slug].tsx → inline initialDate (today / past date)',
      requiredProps: [],
      optionalProps: ['initialDate', 'onDateChange'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Date context is user-navigation state — not CMS-editable. Preserve the no-future-navigation guard.'],
    },
  },

  /* ── Grid Item App (summary_row card) ──────────────────────────── */
  {
    slug: 'grid-item-app',
    name: 'Grid Item App',
    description:
      'Single 140px image card that renders SummaryRowModule schema data (title, primary value+unit+note, up to 2 inline metrics, status) with a drilldown chevron. Falls back to a solid neutral-700 fill when no image is provided, and renders a dedicated empty state (headline/body/cta) when the module is empty. Child of Grid Section App.',
    componentPath: '@/components/home/GridItemApp',
    category: 'grid',
    usedOn: ['/journal (via GridSectionApp / grid-section-app)'],
    theme: 'dark',
    properties: {
      backgroundType: ['image', 'solid'],
      headlineSize: '3xl (title)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm / lg (primary)',
      bodyWeight: 'font-light (300) / font-semibold (600)',
      textAlignment: 'left',
      contentPosition: 'center',
      cornerRadius: 'rounded-md',
      maxWidth: '650px (interior)',
      height: '140px',
      responsiveNotes:
        'Single card. Background image + bottom-up gradient overlay, or neutral-700 solid fallback. Interior centered at max-w-[650px]. Whole card is a next/link to the drilldown (or empty CTA) href.',
      hasOverlay: true,
      overlayStyle: 'bg-gradient-to-t from-black/80 via-black/50 to-black/40',
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: true,
    },
    variants: ['image', 'solid', 'empty'],
    notes:
      'Cataloged in Packet 2C-A; live-previewable with a SummaryRowModule fixture. The single-item building block of grid-section-app. Renders inside a next/link — preview fixtures use inert (#) hrefs. Summary values are user-data truth.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: { copy: true, images: true },
    dataContract: {
      contentSource: 'app/backend → SummaryRowModule (user truth)',
      mockDataPath: 'embed/[slug].tsx → MOCK_SUMMARY_MODULES[0] / MOCK_GRID_ITEM_SOLID / MOCK_SUMMARY_EMPTY[0]',
      requiredProps: ['module'],
      fallbackStates: ['empty', 'ready'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['Summary values are user-data truth — CMS may edit imagery/labels only, never the metrics.'],
    },
  },

  /* ── NDS Display (score + subscores) ───────────────────────────── */
  {
    slug: 'nds-display',
    name: 'NDS Display',
    description:
      'Daily Nutrition Density Score display: a 0–100 score with a qualitative label and seven subscore bars (Whole Foods, Protein, Plant Variety, Fiber, Added Sugar, Micronutrients, Omega Balance). Score + bar colors shift by value. Supports compact (chips) and header (inline) modes plus loading/error states.',
    componentPath: '@/components/journal/NDSDisplay',
    category: 'content',
    usedOn: [],
    theme: 'dark',
    properties: {
      backgroundType: ['solid'],
      headlineSize: '3xl (score)',
      headlineWeight: 'font-bold (700)',
      bodySize: 'xs (subscore labels)',
      bodyWeight: 'font-medium (500)',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-full (bars/chips)',
      maxWidth: 'full (inherits parent)',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Full mode: header score + 7 horizontal subscore bars. compact: large score + chip row. headerStyle: minimal inline "NDS {n}/100". Colors via getNDSColorClass / getSubscoreColorClass.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['score-high', 'score-mid', 'score-low', 'loading'],
    notes:
      'Cataloged in Packet 2C-A; live-previewable with an NDSData fixture. Feature-flagged (ndsDailyBeta) and not currently mounted in the app. Also supports compact + headerStyle modes (not surfaced as variants here). data=null renders nothing by design (no empty UI). Distinct from nutrition-density-gauge (d3 half-donut) and nutrition-density-scroller (snap strip). MealProteinScore is a separate export not cataloged here. Experimental: feature-flagged and not currently mounted in production UI — validate behind the flag before using for new builds.',
    status: 'experimental',
    lifecycle: 'experimental',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: {},
    dataContract: {
      contentSource: 'app/backend → NDSData (useNDS hook)',
      mockDataPath: 'embed/[slug].tsx → MOCK_NDS_HIGH / _MID / _LOW',
      requiredProps: ['data'],
      optionalProps: ['isLoading', 'error', 'compact', 'headerStyle'],
      fallbackStates: ['loading', 'error', 'ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Score + subscores are user-data truth — not CMS-editable.'],
    },
  },

  /* ════════════════════════════════════════════════════════════════ */
  /*  Packet 2C-B — Plans / Programs prop-driven renderers              */
  /* ════════════════════════════════════════════════════════════════ */

  /* ── Slot Card ─────────────────────────────────────────────────── */
  {
    slug: 'slot-card',
    name: 'Plan Slot Card',
    description:
      'A single plan slot with its planned meals. Renders an empty "No meal planned" state with Add/Eat-out actions, a single-meal layout, or a stacked multi-meal layout with dividers. Each meal row shows calories, confidence + main-meal badges, readiness, and an action bar (Log/Skip/Edit/Move/Copy/Remove) or an execution chip once handled.',
    componentPath: '@/components/journal/plans/SlotCard',
    category: 'card',
    usedOn: ['/journal/plans/[date] (via DayView)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'xs (slot label) / base (meal name)',
      headlineWeight: 'font-semibold / font-medium',
      bodySize: 'xs',
      bodyWeight: 'font-light',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-2xl',
      maxWidth: 'full (inherits parent column)',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Slot header with inline editable time, then 0/1/2+ meal layouts. All actions are optional callbacks; buttons hide when their callback is absent.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['log', 'skip', 'regenerate', 'edit', 'move', 'copy', 'remove', 'add', 'eat-out'],
      isContentDriven: true,
    },
    variants: ['planned', 'multi-meal', 'logged', 'empty'],
    notes:
      'Cataloged in Packet 2C-B; live-previewable with PlanSlot + PlannedMeal[] fixtures. All callbacks are no-ops in preview; internal links use the real route builders but are not navigated. Manages its own inline time-edit state. Truth logic (NDS, readiness, execution) lives in the parent page and is untouched.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: {},
    dataContract: {
      contentSource: 'app/backend → PlanSlot + PlannedMeal[] (plan truth)',
      mockDataPath: 'embed/[slug].tsx → mockSlot() + mockPlannedMeal()',
      requiredProps: ['slot', 'meals'],
      optionalProps: ['onEdit', 'onRemove', 'onRegenerate', 'onExecute', 'onAdd', 'onEditTime', 'readinessMap'],
      fallbackStates: ['empty', 'ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Plan meals + execution state are user truth — not CMS-editable. Preview uses no-op callbacks; no mutation.'],
    },
  },

  /* ── Day View ──────────────────────────────────────────────────── */
  {
    slug: 'day-view',
    name: 'Plan Day View',
    description:
      'Renders one plan day: a date heading with projected NDS + confidence, then chronologically ordered SlotCards (sorted by target_time, falling back to slot ordinal). Shows an empty "No slots on this day yet" state when the day has no slots.',
    componentPath: '@/components/journal/plans/DayView',
    category: 'content',
    usedOn: ['/journal/plans/[date]'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: '2xl (day heading)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm',
      bodyWeight: 'font-light',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-2xl (slot cards)',
      maxWidth: 'full (inherits page column)',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Day heading + projected NDS line, then a vertical stack of SlotCards ordered by time. Threads all meal callbacks into each SlotCard.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: true,
    },
    variants: ['ready', 'multi-meal', 'empty'],
    notes:
      'Cataloged in Packet 2C-B; live-previewable with PlanDay + PlanSlot[] + PlannedMeal[] fixtures. Orchestrates SlotCard; all callbacks are no-ops in preview. Slot ordering + meal grouping happen client-side from props (no fetch).',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: {},
    dataContract: {
      contentSource: 'app/backend → PlanDay + PlanSlot[] + PlannedMeal[] (plan truth)',
      mockDataPath: 'embed/[slug].tsx → mockPlanDay() + mockSlot() + mockPlannedMeal()',
      requiredProps: ['day', 'slots', 'meals', 'editingMealId', 'creatingSlotId', 'busy'],
      optionalProps: ['eatOutEvents', 'readinessMap', 'onExecute'],
      fallbackStates: ['empty', 'ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Plan day truth + projected NDS are computed server-side — preview uses fixtures only, no mutation.'],
    },
  },

  /* ── Week View Panel ───────────────────────────────────────────── */
  {
    slug: 'week-view-panel',
    name: 'Plan Week View Panel',
    description:
      'The Plans week workbench. Composes the profile defaults banner, optional schedule-conflict banner, generate/regenerate action, grocery + import shortcuts, the projected NDS strip, and a plan summary card. Shows a "No active plan" prompt when no plan exists.',
    componentPath: '@/components/journal/plans/WeekViewPanel',
    category: 'content',
    usedOn: ['/journal/plans'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'sm (section titles)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'xs',
      bodyWeight: 'font-light',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-2xl',
      maxWidth: 'full (inherits page column)',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Top-level layout composing ProfileDefaultsBanner + ScheduleConflictBanner + ProjectedNDSStrip + plan summary. Generate button disables when canGenerate is false or generating.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['generate', 'open-day', 'grocery', 'import'],
      isContentDriven: true,
    },
    variants: ['ready', 'no-plan', 'incomplete'],
    notes:
      'Cataloged in Packet 2C-B; live-previewable with Plan + PlanDay[] + snapshot + display + conflicts fixtures. onGenerate/onApplyConflict are no-ops; links use real route builders but are not navigated. All data fetching + mutation stay on the parent page.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: {},
    dataContract: {
      contentSource: 'app/backend → Plan + PlanDay[] + PlanInputSnapshot + ScheduleConflict[] (plan truth)',
      mockDataPath: 'embed/[slug].tsx → MOCK_PLAN / mockPlanDay() / MOCK_PLAN_SNAPSHOT / MOCK_CONFLICTS',
      requiredProps: ['plan', 'days', 'slots', 'meals', 'snapshot', 'display', 'canGenerate', 'missingReasons', 'onGenerate', 'generating'],
      optionalProps: ['conflicts', 'onApplyConflict', 'busy'],
      fallbackStates: ['empty', 'ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Plan generation + schedule edits are server-owned — preview never calls APIs or mutates.'],
    },
  },

  /* ── Projected NDS Strip ───────────────────────────────────────── */
  {
    slug: 'projected-nds-strip',
    name: 'Projected NDS Strip',
    description:
      'Top strip on the Plans week view: up to 7 tappable day cells, each showing weekday, projected NDS (0–100), a confidence dot (high/medium/low), and a meal count. Renders a "No plan days yet" prompt when there are no days.',
    componentPath: '@/components/journal/plans/ProjectedNDSStrip',
    category: 'content',
    usedOn: ['/journal/plans (via WeekViewPanel)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'lg (score)',
      headlineWeight: 'font-semibold (600)',
      bodySize: '10px (labels)',
      bodyWeight: 'font-normal',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'rounded-2xl / rounded-xl (cells)',
      maxWidth: 'full',
      height: 'auto',
      responsiveNotes:
        '7-column grid of day cells. Confidence dot color: denim (high), amber (medium), white/30 (low/unknown). Cells are next/link to the per-day view.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: true,
    },
    variants: ['high', 'mid', 'low', 'empty'],
    notes:
      'Cataloged in Packet 2C-B; live-previewable with a PlanDay[] fixture + mealCountByDay map. Score/confidence variants demonstrate the color bands; "empty" shows the no-days prompt. Cells link via the real route builder but are not navigated.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: {},
    dataContract: {
      contentSource: 'app/backend → PlanDay[] (projected NDS truth)',
      mockDataPath: 'embed/[slug].tsx → mockPlanDay() variants',
      requiredProps: ['planId', 'days', 'mealCountByDay'],
      fallbackStates: ['empty', 'ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Projected NDS is computed from planned meals server-side — not CMS-editable.'],
    },
  },

  /* ── Schedule Conflict Banner ──────────────────────────────────── */
  {
    slug: 'schedule-conflict-banner',
    name: 'Schedule Conflict Banner',
    description:
      'Amber banner that surfaces schedule conflicts from the schedule resolver. Lists each conflict message with an optional suggested adjustment ("move to HH:mm" / "disable this slot") and an Apply action when a suggestion + slot are present. Collapses past 2 conflicts behind a "Show N more" toggle. Renders nothing when there are no conflicts.',
    componentPath: '@/components/journal/plans/ScheduleConflictBanner',
    category: 'cta',
    usedOn: ['/journal/plans (via WeekViewPanel)'],
    theme: 'dark',
    properties: {
      backgroundType: ['solid'],
      headlineSize: 'sm (title)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'xs',
      bodyWeight: 'font-normal',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-2xl',
      maxWidth: 'full',
      height: 'auto',
      responsiveNotes:
        'Amber-tinted banner. Shows up to 2 conflicts by default with an expand toggle. Apply button only renders when onApply + suggested_adjustment + slot_key are all present.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['apply', 'expand-toggle'],
      isContentDriven: true,
    },
    variants: ['conflict', 'expandable'],
    notes:
      'Cataloged in Packet 2C-B; live-previewable with a ScheduleConflict[] fixture. onApply is a no-op (real apply PATCHes people.metadata.meal_schedule — never auto-applied, and never called in preview). "resolved" (empty array) renders null, so it is not surfaced as a variant.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: {},
    dataContract: {
      contentSource: 'app → lib/plans/scheduleResolver.ts → ScheduleConflict[]',
      mockDataPath: 'embed/[slug].tsx → MOCK_CONFLICTS / MOCK_CONFLICTS_MANY',
      requiredProps: ['conflicts'],
      optionalProps: ['onApply', 'busy'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Apply mutates the user meal schedule server-side — never invoked in preview.'],
    },
  },

  /* ── Profile Defaults Banner ───────────────────────────────────── */
  {
    slug: 'profile-defaults-banner',
    name: 'Profile Defaults Banner',
    description:
      'Summarizes the planning defaults (age, sex, height, weight, calories/day, dine-out frequency) that will be used to generate a plan, with an Edit link to Profile. When the profile is incomplete it appends an amber "Complete your profile to generate plans" block listing the missing reasons. Shows a "Loading your defaults…" state when the snapshot is null.',
    componentPath: '@/components/journal/plans/ProfileDefaultsBanner',
    category: 'content',
    usedOn: ['/journal/plans (via WeekViewPanel)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'sm (title)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'xs',
      bodyWeight: 'font-normal',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-2xl',
      maxWidth: 'full',
      height: 'auto',
      responsiveNotes:
        'Two-column key/value grid of planning defaults + Edit link. Height/weight render in the user’s display units. Missing-profile block appends only when canGenerate is false.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: true,
    },
    variants: ['complete', 'incomplete', 'loading'],
    notes:
      'Cataloged in Packet 2C-B; live-previewable with a PlanInputSnapshot + PlanDisplayPrefs fixture. Reads a live snapshot in production (GET /api/journal/plans/snapshot); preview supplies a static fixture and never calls the API. The 18+ gate is enforced server-side and is unaffected.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: {},
    dataContract: {
      contentSource: 'app → GET /api/journal/plans/snapshot → PlanInputSnapshot',
      mockDataPath: 'embed/[slug].tsx → MOCK_PLAN_SNAPSHOT / MOCK_PLAN_DISPLAY',
      requiredProps: ['snapshot', 'display', 'canGenerate', 'missingReasons'],
      fallbackStates: ['loading', 'ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Profile values are user truth — not CMS-editable. Preview never reads the live snapshot.'],
    },
  },

  /* ── Program Delivery Modules ──────────────────────────────────── */
  {
    slug: 'program-delivery-modules',
    name: 'Program Delivery Modules',
    description:
      'Config-driven program module renderer. Filters a list of delivery-module definitions by runtime status/day/visibility conditions, groups them, and renders each as a card with optional blocks (metrics, list, cards, notice, roadmap), a capacity-aware practice note, a CTA, and safety/no-claims notes. Renders nothing when no modules are visible.',
    componentPath: '@/components/journal/programs/ProgramDeliveryModules',
    category: 'content',
    usedOn: ['/journal/programs/[slug]'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'xl (module title)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm',
      bodyWeight: 'font-normal',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-3xl / rounded-2xl (blocks)',
      maxWidth: 'full',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Grouped sections of delivery cards. Block renderers cover metrics (sm:grid-cols-4), list (sm:grid-cols-2), cards (sm:grid-cols-3), notice, and roadmap. CTA tone + disabled states are config-driven.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['module-cta (link)', 'module-cta (disabled)'],
      isContentDriven: true,
    },
    variants: ['default'],
    notes:
      'Cataloged in Packet 2C-B; live-previewable with a ProgramDeliveryModuleDefinition[] fixture + runtimeSummary=null (status "not_started"). Fixture modules omit day bounds and include "not_started" visibility so they render without enrollment. CTA hrefs are inert. Visibility/copy helpers are pure functions (no API).',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'admin config → ProgramDeliveryModuleDefinition[] + runtime summary',
      mockDataPath: 'embed/[slug].tsx → MOCK_DELIVERY_MODULES',
      requiredProps: ['runtimeSummary', 'modules'],
      optionalProps: ['progressSummary', 'checkinDue', 'day21Handled', 'anchors'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Module definitions are admin/developer-authored config; runtime values are user truth. Preview uses static fixtures.'],
    },
  },

  /* ── Baseline Prep Modules ─────────────────────────────────────── */
  {
    slug: 'baseline-prep-modules',
    name: 'Baseline Prep Modules',
    description:
      'Day-0 setup modules for the Baseline program: a header with selected-start/current-day/capacity/progress detail pills, then module shells for Arrive, Build Your Meal Map, Create Meals (live import link), Prepare Pantry (disabled placeholder), and a Program Roadmap. Renders in primary ("Set up your Baseline") or reference ("Prep modules remain available") framing; hidden access renders nothing.',
    componentPath: '@/components/journal/programs/BaselinePrepModules',
    category: 'content',
    usedOn: ['/journal/programs/baseline'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: '2xl (header) / xl (module titles)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm',
      bodyWeight: 'font-normal',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-3xl / rounded-2xl',
      maxWidth: 'full',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Header detail-pill grid (sm:grid-cols-4) + stacked ModuleShells. Mostly static guidance content; runtime values fill the detail pills and highlight the current roadmap step.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['live-action (link)', 'disabled-action'],
      isContentDriven: true,
    },
    variants: ['primary', 'reference'],
    notes:
      'Cataloged in Packet 2C-B; live-previewable with access="primary"/"reference" and null runtime/progress summaries (detail pills show "Not enrolled"/"Not set"). access="hidden" renders nothing, so it is not a variant. Import link uses the real route but is not navigated. No program truth is altered.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: {},
    dataContract: {
      contentSource: 'app → ProgramRuntimeSummary + ProgramProgressSummary + derived access',
      mockDataPath: 'embed/[slug].tsx → access prop only (null summaries)',
      requiredProps: ['runtimeSummary', 'progressSummary', 'access'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Mostly static setup guidance; runtime values are user truth. Preview uses null summaries + no mutation.'],
    },
  },

  /* ── Logged Item Card ──────────────────────────────────────────── */
  {
    slug: 'logged-item-card',
    name: 'Logged Item Card',
    description:
      'Card for a logged food entry: name, an optional Protein/Carbs/Fat macro bar (equal thirds), and an editable Quantity input + Unit control. When valid unit conversions exist (serving size or USDA measures) the unit becomes a dropdown; otherwise it is read-only. A down-arrow menu exposes Edit / Delete. Clicking the card navigates to its edit route.',
    componentPath: '@/components/journal/LoggedItemCard',
    category: 'card',
    usedOn: ['/journal/log (intake entries)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'xl (name)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'base (macro bar) / sm (quantity)',
      bodyWeight: 'font-light',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-full (macro bar) / rounded-lg (inputs)',
      maxWidth: 'full',
      height: 'auto',
      responsiveNotes:
        'Name + options menu, optional macro bar, then Quantity input + Unit (dropdown when conversions exist). Hover highlights the row.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['options-menu', 'favorite', 'edit', 'delete'],
      isContentDriven: true,
    },
    variants: ['default', 'with-units'],
    notes:
      'Cataloged in Packet 2C-B; live-previewable. Uses next/router (available because the embed is a real page); editHref is inert (#) and clicks are harmless. onDelete/onEntryChange/onToggleFavorite are no-ops. "with-units" supplies servingSizeG + measures so the unit dropdown appears.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: {},
    dataContract: {
      contentSource: 'app/backend → journal intake entry + food object',
      mockDataPath: 'embed/[slug].tsx → inline props (+ MOCK_MEASURES for with-units)',
      requiredProps: ['id', 'name', 'editHref'],
      optionalProps: ['quantity', 'unit', 'quantityG', 'servingSizeG', 'measures', 'protein', 'carbs', 'fat', 'onDelete', 'onEntryChange', 'foodObjectId', 'isFavorited', 'onToggleFavorite'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Logged nutrition is user truth — not CMS-editable. Preview never mutates entries.'],
    },
  },

  /* ── Compact Logged Card ───────────────────────────────────────── */
  {
    slug: 'compact-logged-card',
    name: 'Compact Logged Card',
    description:
      'Compact card for non-intake journal entries (water, supplement, mood, bowel, cycle, movement, blood pressure, sleep, note). Shows a type label + a formatted one-line summary derived from the entry payload, plus a down-arrow Edit / Delete menu. Clicking the card navigates to its edit route.',
    componentPath: '@/components/journal/CompactLoggedCard',
    category: 'card',
    usedOn: ['/journal/log (non-intake entries)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'lg (summary)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm (type label)',
      bodyWeight: 'font-medium',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-lg (menu)',
      maxWidth: 'full',
      height: 'auto',
      responsiveNotes:
        'Single row: type label + truncated summary on the left, options menu on the right. Summary string is derived per entry type. Hover highlights the row.',
      hasOverlay: false,
      hasButtons: true,
      buttonVariants: ['options-menu', 'edit', 'delete'],
      isContentDriven: true,
    },
    variants: ['mood', 'water', 'sleep'],
    notes:
      'Cataloged in Packet 2C-B; live-previewable with a JournalEntry fixture (reuses the embed mockEntry helper). Uses next/router (embed is a real page); editHref is inert (#). onDelete is a no-op. Variants demonstrate the per-type summary formatter.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'drop_in',
    editableFields: {},
    dataContract: {
      contentSource: 'app/backend → non-intake JournalEntry',
      mockDataPath: 'embed/[slug].tsx → mockEntry() per type',
      requiredProps: ['entry', 'editHref'],
      optionalProps: ['onDelete'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: ['Journal entries are user truth — not CMS-editable. Preview never mutates entries.'],
    },
  },

  /* ════════════════════════════════════════════════════════════════ */
  /*  Packet 2C-C — Baseline weekly guidance + aurora disambiguation    */
  /* ════════════════════════════════════════════════════════════════ */

  /* ── Baseline Week One Modules ─────────────────────────────────── */
  {
    slug: 'baseline-week-one-modules',
    name: 'Baseline Week One Modules',
    description:
      'Week 1 ("Eating Rhythm") in-program guidance for the Baseline program. Renders a stack of guidance cards — week focus, today\'s practice (rhythm steps), an eating-rhythm guide (timing/balance/repetition), and a capacity-aware practice note — plus a Day 7 check-in card on the final day of the window. Renders nothing unless the enrollment is active on days 1–7.',
    componentPath: '@/components/journal/programs/BaselineWeekOneModules',
    category: 'content',
    usedOn: ['/journal/programs/baseline (active, days 1–7)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'xl (card titles) / 11px (section label)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm',
      bodyWeight: 'font-normal',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-3xl / rounded-2xl (inner)',
      maxWidth: 'full (inherits page column)',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Vertical stack (space-y-3) of WeekOneCards. Rhythm steps use a sm:grid-cols-2 list; the eating-rhythm guide uses sm:grid-cols-3. The capacity card swaps copy by enrollment capacity (low/steady/high). The Day 7 card only renders when current_day === 7.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['steady', 'low', 'high', 'checkin-due'],
    notes:
      'Cataloged in Packet 2C-C; live-previewable with an active ProgramRuntimeSummary fixture (mockRuntimeSummary, day 3 for capacity variants / day 7 for checkin-due). Renders null unless resolved_status === "active" and current_day is in 1–7, so the hidden state is not surfaced as a variant. Capacity copy is a pure helper (getBaselineWeekOneCapacityCopy). The Day 7 check-in CTA is an inert in-page anchor (#preview-checkin); checkinDue is supplied by the page, never computed in preview. Does not accept a primary/reference access prop (that belongs to BaselinePrepModules).',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: {},
    dataContract: {
      contentSource: 'app → ProgramRuntimeSummary (enrollment capacity + current_day) + page-derived checkinDue',
      mockDataPath: 'embed/[slug].tsx → mockRuntimeSummary({ currentDay, capacity })',
      requiredProps: ['runtimeSummary', 'checkinDue', 'checkinAnchorId'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: [
        'General wellness guidance only — not medical/clinical advice.',
        'Runtime values (capacity, current_day) are user truth; baseline program copy is developer-authored. Preview uses fixtures only and never mutates program state.',
      ],
    },
  },

  /* ── Baseline Week Two Modules ─────────────────────────────────── */
  {
    slug: 'baseline-week-two-modules',
    name: 'Baseline Week Two Modules',
    description:
      'Week 2 ("Digestion & Recovery Support") in-program guidance for the Baseline program. Renders a stack of guidance cards — week focus, today\'s practice (pace/recovery steps), a digestion & recovery guide (pace/warmth/recovery), and a capacity-aware practice note — plus a Day 14 check-in card on the final day of the window. Renders nothing unless the enrollment is active on days 8–14.',
    componentPath: '@/components/journal/programs/BaselineWeekTwoModules',
    category: 'content',
    usedOn: ['/journal/programs/baseline (active, days 8–14)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'xl (card titles) / 11px (section label)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm',
      bodyWeight: 'font-normal',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-3xl / rounded-2xl (inner)',
      maxWidth: 'full (inherits page column)',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Vertical stack (space-y-3) of WeekTwoCards. Recovery steps use a sm:grid-cols-2 list; the guide uses sm:grid-cols-3. The capacity card swaps copy by enrollment capacity (low/steady/high). The Day 14 card only renders when current_day === 14.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['steady', 'low', 'high', 'checkin-due'],
    notes:
      'Cataloged in Packet 2C-C; live-previewable with an active ProgramRuntimeSummary fixture (mockRuntimeSummary, day 10 for capacity variants / day 14 for checkin-due). Renders null unless resolved_status === "active" and current_day is in 8–14, so the hidden state is not surfaced as a variant. Capacity copy is a pure helper (getBaselineWeekTwoCapacityCopy). The Day 14 check-in CTA is an inert in-page anchor (#preview-checkin); checkinDue is supplied by the page, never computed in preview. Does not accept a primary/reference access prop.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: {},
    dataContract: {
      contentSource: 'app → ProgramRuntimeSummary (enrollment capacity + current_day) + page-derived checkinDue',
      mockDataPath: 'embed/[slug].tsx → mockRuntimeSummary({ currentDay, capacity })',
      requiredProps: ['runtimeSummary', 'checkinDue', 'checkinAnchorId'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: [
        'General wellness guidance only — not medical/clinical advice.',
        'Runtime values (capacity, current_day) are user truth; baseline program copy is developer-authored. Preview uses fixtures only and never mutates program state.',
      ],
    },
  },

  /* ── Baseline Week Three Modules ───────────────────────────────── */
  {
    slug: 'baseline-week-three-modules',
    name: 'Baseline Week Three Modules',
    description:
      'Week 3 ("Real-Life Flexibility") in-program guidance for the Baseline program. Renders a stack of guidance cards — week focus, today\'s practice (return-to-rhythm steps), a real-life flexibility guide (return/observe/maintain), and a capacity-aware practice note — plus a Day 21 transition card that switches between the final check-in CTA, a "Review recommendation" CTA once Day 21 is handled, or a passive note. Renders nothing unless the enrollment is active on days 15–21.',
    componentPath: '@/components/journal/programs/BaselineWeekThreeModules',
    category: 'content',
    usedOn: ['/journal/programs/baseline (active, days 15–21)'],
    theme: 'dark',
    properties: {
      backgroundType: ['glassmorphism'],
      headlineSize: 'xl (card titles) / 11px (section label)',
      headlineWeight: 'font-semibold (600)',
      bodySize: 'sm',
      bodyWeight: 'font-normal',
      textAlignment: 'left',
      contentPosition: 'top-left',
      cornerRadius: 'rounded-3xl / rounded-2xl (inner)',
      maxWidth: 'full (inherits page column)',
      height: 'auto (content-driven)',
      responsiveNotes:
        'Vertical stack (space-y-3) of WeekThreeCards. Flexibility steps use a sm:grid-cols-2 list; the guide uses sm:grid-cols-3. The capacity card swaps copy by enrollment capacity (low/steady/high). The Day 21 card only renders when current_day === 21 and branches on checkinDue / isDay21Handled.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['steady', 'low', 'high', 'checkin-due', 'recommendation'],
    notes:
      'Cataloged in Packet 2C-C; live-previewable with an active ProgramRuntimeSummary fixture (mockRuntimeSummary, day 17 for capacity variants / day 21 for checkin-due + recommendation). Renders null unless resolved_status === "active" and current_day is in 15–21. The "recommendation" variant sets a day-21 completed latest_checkin_response so isDay21Handled() reveals the "Review recommendation" anchor. Both anchors are inert in-page links (#preview-checkin / #preview-recommendation). Capacity copy is a pure helper (getBaselineWeekThreeCapacityCopy). Does not accept a primary/reference access prop.',
    status: 'stable',
    surface: 'signed_in_app',
    reusability: 'needs_data',
    editableFields: {},
    dataContract: {
      contentSource: 'app → ProgramRuntimeSummary (capacity + current_day + latest_checkin_response) + page-derived checkinDue',
      mockDataPath: 'embed/[slug].tsx → mockRuntimeSummary({ currentDay, capacity, latestCheckinResponse })',
      requiredProps: ['runtimeSummary', 'checkinDue', 'checkinAnchorId', 'recommendationAnchorId'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: false,
      developerOwned: true,
      safetyNotes: [
        'General wellness guidance only — not medical/clinical advice.',
        'Runtime values (capacity, current_day, Day-21 handled) are user truth; the recommendation engine is server-owned. Preview uses fixtures only and never generates, applies, or mutates recommendations.',
      ],
    },
  },

  /* ── Aurora Page Wrapper (generic ui wrapper) ──────────────────── */
  {
    slug: 'aurora-page-wrapper',
    name: 'Aurora Page Wrapper',
    description:
      'Generic full-screen page wrapper that paints an animated teal "aurora" layer behind centered children. Distinct from the journal Aurora Background (aurora-background): this is components/ui/aurora-background — a min-h-screen flex container that takes children and a light/dark variant, with an optional radial-gradient mask.',
    componentPath: '@/components/ui/aurora-background',
    category: 'ambient',
    usedOn: ['/dev/backgrounds (showcase)'],
    theme: 'both',
    properties: {
      backgroundType: ['aurora', 'gradient'],
      headlineSize: 'n/a (wrapper)',
      headlineWeight: 'n/a',
      bodySize: 'n/a',
      bodyWeight: 'n/a',
      textAlignment: 'center',
      contentPosition: 'center',
      cornerRadius: 'none',
      maxWidth: 'full viewport',
      height: 'min-h-screen',
      responsiveNotes:
        'relative flex min-h-screen centered container. The aurora is a repeating-linear-gradient driven by CSS vars + the animate-aurora-shift keyframe (auroraBackgroundShift, tailwind.config.js). variant="dark" uses bg-brand-900/light teal; variant="light" inverts to a white base/darker teal. showRadialGradient applies an ellipse mask.',
      hasOverlay: false,
      hasButtons: false,
      buttonVariants: [],
      isContentDriven: false,
    },
    variants: ['dark', 'light'],
    notes:
      'Cataloged in Packet 2C-C as the disambiguated sibling of aurora-background. Aurora naming collision resolution: both files export AuroraBackground, so the embed imports this one aliased (AuroraBackground as AuroraPageWrapper) and registers it under the distinct slug aurora-page-wrapper. The existing aurora-background route (components/journal/AuroraBackground — fixed decorative inset-0 layer, no children) is unchanged. Purely presentational; renders fixture children only. Colors come from styles/theme via lib/utils cn — no data/API/auth. Experimental: generic alternate aurora wrapper only used on the /dev/backgrounds showcase, not production UI. Prefer the production aurora-background for new builds.',
    status: 'stable',
    lifecycle: 'experimental',
    surface: 'shared',
    reusability: 'drop_in',
    editableFields: { colors: true },
    dataContract: {
      contentSource: 'composition — children only (decorative aurora)',
      mockDataPath: 'embed/[slug].tsx → fixture children + variant prop',
      requiredProps: ['children'],
      optionalProps: ['variant', 'showRadialGradient', 'className'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: false, developerOwned: true },
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
  { id: 'layout', label: 'Layout' },
  { id: 'navigation', label: 'Navigation' },
];

/* ------------------------------------------------------------------ */
/*  Lifecycle curation (Packet 2E)                                     */
/* ------------------------------------------------------------------ */

/** Default lifecycle when an entry omits the field — see ModuleLifecycle. */
export const DEFAULT_MODULE_LIFECYCLE: ModuleLifecycle = 'approved';

/**
 * Read a module's lifecycle bucket with the default applied. Entries left
 * unflagged are treated as approved foundations.
 */
export function getModuleLifecycle(mod: ModuleDefinition): ModuleLifecycle {
  return mod.lifecycle ?? DEFAULT_MODULE_LIFECYCLE;
}

/**
 * Lifecycle buckets for filter UIs and badges, in display order.
 * `ruledOut` flags buckets that should not be used for new builds.
 */
export const MODULE_LIFECYCLES: {
  id: ModuleLifecycle;
  label: string;
  ruledOut: boolean;
}[] = [
  { id: 'approved', label: 'Approved', ruledOut: false },
  { id: 'experimental', label: 'Experimental', ruledOut: false },
  { id: 'legacy', label: 'Legacy', ruledOut: true },
  { id: 'deprecated', label: 'Deprecated', ruledOut: true },
  { id: 'reference_only', label: 'Reference Only', ruledOut: true },
];

/** True when the lifecycle bucket should not be used for new page builds. */
export function isLifecycleRuledOut(lifecycle: ModuleLifecycle): boolean {
  return (
    lifecycle === 'legacy' ||
    lifecycle === 'deprecated' ||
    lifecycle === 'reference_only'
  );
}
