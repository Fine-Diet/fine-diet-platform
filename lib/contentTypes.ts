/**
 * Content Type Definitions
 * 
 * Explicit TypeScript interfaces for all site content types.
 * These types define the structure of content stored in Supabase and JSON fallbacks.
 */

// ============================================================================
// Shared Types
// ============================================================================

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'quaternary';

export interface ButtonConfig {
  label: string;
  variant: ButtonVariant;
  href: string;
}

export interface ResponsiveImages {
  desktop: string;
  mobile: string;
}

export interface WaitlistConfig {
  enabled: boolean;
  title?: string;
  description?: string;
  buttonLabel?: string;
}

// ============================================================================
// Navigation Content Types
// ============================================================================

export interface NavigationTopLink {
  label: string;
  href: string;
}

export interface NavigationTopLinks {
  journal: NavigationTopLink;
  account: NavigationTopLink;
}

export interface NavigationItem {
  id: string;
  type: string;
  title: string;
  description: string;
  image: string;
  href: string;
  available: boolean;
  waitlist?: WaitlistConfig;
  buttons: ButtonConfig[];
}

export interface NavigationSubcategory {
  id: string;
  name: string;
  items: NavigationItem[];
}

export interface NavigationProspectProduct {
  subcategoryLabel: string;
  id: string;
  title: string;
  description: string;
  badge: string;
  image: string;
  href: string;
  available: boolean;
  waitlist: WaitlistConfig;
  buttons: ButtonConfig[];
}

export interface NavigationLayout {
  showHero: boolean;
  showGrid: boolean;
  showCTA: boolean;
}

export interface PricingCard {
  id: string;
  image: string;
  title: string;
  subtitle: string;
  description: string;
  price: string;
  paymentSchedule: string;
  button: ButtonConfig;
}

export interface PricingSectionColumns {
  mobile: number;
  tablet: number;
  desktop: number;
}

export interface NavigationPricingSection {
  type: 'pricing';
  id: string;
  enabled: boolean;
  title: string;
  description: string;
  columns: PricingSectionColumns;
  cards: PricingCard[];
}

export type NavigationSection = NavigationPricingSection;

export interface NavigationCategory {
  id: string;
  label: string;
  headline: string;
  subtitle: string;
  layout: NavigationLayout;
  subcategories: NavigationSubcategory[];
  prospectProduct: NavigationProspectProduct;
  sections?: NavigationSection[];
}

export interface NavigationContent {
  topLinks: NavigationTopLinks;
  categories: NavigationCategory[];
}

// ============================================================================
// Home Content Types
// ============================================================================

export interface HeroContent {
  title: string;
  description: string;
  buttons: ButtonConfig[];
  images: ResponsiveImages;
}

export interface FeatureSlide {
  id?: string;
  title?: string;
  description?: string;
  images?: ResponsiveImages;
  buttons?: ButtonConfig[];
}

export interface FeatureSection {
  title?: string;
  description?: string;
  buttons?: ButtonConfig[];
  images: ResponsiveImages;
  slides?: FeatureSlide[];
}

export interface GridItem {
  title: string;
  description?: string;
  image?: string;
  button?: ButtonConfig;
}

export interface GridSection {
  items: GridItem[];
}

export interface CTASection {
  title: string;
  description?: string;
  button?: ButtonConfig;
  images?: ResponsiveImages;
}

export interface HomeContent {
  hero: HeroContent;
  featureSections: FeatureSection[];
  gridSections: GridSection[];
  ctaSection: CTASection;
}

// ============================================================================
// Footer Content Types
// ============================================================================

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterNewsletter {
  headline: string;
  subheadline: string;
}

export interface FooterLinkSection {
  title: string;
  links: FooterLink[];
}

export interface FooterLegal {
  links: FooterLink[];
  copyright: string;
}

export interface FooterContent {
  newsletter: FooterNewsletter;
  explore: FooterLinkSection;
  resources: FooterLinkSection;
  connect: FooterLinkSection;
  legal: FooterLegal;
}

// ============================================================================
// Waitlist Content Types
// ============================================================================

export interface WaitlistContent {
  title: string;
  subtitle?: string;
  description?: string;
  image?: string;
  formHeadline?: string;
  formSubheadline?: string;
  successMessage?: string;
  seoTitle?: string;
  seoDescription?: string;
  successTitle?: string;
  submitButtonLabel?: string;
  submitButtonLoadingLabel?: string;
  goalPlaceholder?: string;
  privacyNote?: string;
  // Form field labels
  emailLabel?: string;
  nameLabel?: string;
  goalLabel?: string;
  requiredLabel?: string;
  optionalLabel?: string;
  // Form field placeholders
  emailPlaceholder?: string;
  namePlaceholder?: string;
  // Logo
  logoPath?: string;
  logoAlt?: string;
}

// ============================================================================
// Product Page Content Types
// ============================================================================

export interface ProductHero {
  title: string;
  subtitle?: string;
  description?: string;
  imageDesktop?: string;
  imageMobile?: string;
  buttons?: ButtonConfig[];
}

export interface ProductValueProp {
  id: string;
  title: string;
  description?: string;
  icon?: string;
}

export interface ProductSection {
  id: string;
  type: 'text' | 'image' | 'cta' | 'pricing' | 'faq';
  title?: string;
  subtitle?: string;
  description?: string;
  image?: string;
  items?: any[];
}

export interface ProductFAQ {
  question: string;
  answer: string;
}

export interface ProductSEO {
  title?: string;
  description?: string;
}

export interface ProductPageContent {
  hero: ProductHero;
  valueProps?: ProductValueProp[];
  sections?: ProductSection[];
  faq?: ProductFAQ[];
  seo?: ProductSEO;
}

// ============================================================================
// Global Content Types
// ============================================================================

export interface AnnouncementBar {
  enabled: boolean;
  message: string;
  href?: string;
}

export interface GlobalContent {
  siteName?: string;
  metaDefaultTitle?: string;
  metaDefaultDescription?: string;
  announcementBar?: AnnouncementBar;
}

// ============================================================================
// Content Key Type
// ============================================================================

// ============================================================================
// SEO Content Types
// ============================================================================

export interface SeoGlobalConfig {
  siteName: string;
  titleTemplate: string; // e.g., "{{pageTitle}} | {{siteName}}"
  defaultTitle: string;
  defaultDescription: string;
  canonicalBase: string; // e.g., "https://myfinediet.com"
  ogImage?: string; // Absolute URL
  twitterCard?: 'summary' | 'summary_large_image'; // Default: summary_large_image
  robots?: string; // Default: "index,follow"
}

export interface SeoRouteConfig {
  pageTitle?: string;
  pageDescription?: string;
  canonicalPath?: string;
  ogImage?: string; // Override global ogImage
  robots?: string; // Override global robots
  // Extended per-page SEO (Phase 1 / Step 2)
  title?: string; // Direct title override (bypasses template)
  description?: string; // Direct description override
  canonical?: string; // Absolute canonical URL override
  noindex?: boolean; // Quick noindex flag
  og?: {
    title?: string;
    description?: string;
    image?: string;
    type?: string;
  };
  twitter?: {
    card?: 'summary' | 'summary_large_image';
    title?: string;
    description?: string;
    image?: string;
  };
}

export interface BrowserAssets {
  favicon?: string; // Absolute URL
  appleTouchIcon?: string; // Absolute URL
  themeColor?: string; // Hex or CSS color
  manifestName?: string;
  manifestShortName?: string;
}

export interface RobotsContent {
  content: string; // Raw robots.txt content
}

// ============================================================================
// Configuration Types (Phase 2 / Step 1)
// ============================================================================

export interface FeatureFlags {
  enableN8nWebhook: boolean;
  enableNewResultsFlow?: boolean;
}

export interface AssessmentConfig {
  scoring: {
    thresholds: {
      axisBandHigh: number;
      axisBandModerate: number;
    };
  };
}

export interface AvatarMapping {
  defaultAvatarKey: string;
  mappings: Record<string, string>;
}

export type SiteContentKey = 'navigation' | 'home' | 'footer' | 'waitlist' | 'global' | 'seo:global' | string;

// ============================================================================
// Union Type for All Content
// ============================================================================

export type SiteContent = NavigationContent | HomeContent | FooterContent | WaitlistContent | GlobalContent | SeoGlobalConfig | SeoRouteConfig | BrowserAssets | RobotsContent | FeatureFlags | AssessmentConfig | AvatarMapping;

