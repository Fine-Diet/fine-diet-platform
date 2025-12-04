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
  description: string;
  image: string;
  button: ButtonConfig;
}

export interface GridSection {
  items: GridItem[];
}

export interface CTASection {
  title: string;
  description: string;
  button: ButtonConfig;
  images: ResponsiveImages;
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
// Content Key Type
// ============================================================================

export type SiteContentKey = 'navigation' | 'home' | 'footer';

// ============================================================================
// Union Type for All Content
// ============================================================================

export type SiteContent = NavigationContent | HomeContent | FooterContent;

