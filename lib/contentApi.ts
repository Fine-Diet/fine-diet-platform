/**
 * Content API
 * 
 * Centralized content fetching with Supabase + JSON fallback.
 * 
 * This module provides functions to fetch site content from Supabase,
 * with automatic fallback to JSON files if Supabase is unavailable or returns null.
 */

import { z } from 'zod';
import {
  NavigationContent,
  HomeContent,
  FooterContent,
  WaitlistContent,
  GlobalContent,
  ProductPageContent,
  SiteContentKey,
} from './contentTypes';
import {
  navigationContentSchema,
  homeContentSchema,
  footerContentSchema,
  waitlistContentSchema,
  globalContentSchema,
  productPageContentSchema,
} from './contentValidators';

// JSON fallback imports
import navigationFallback from '@/data/navigation.json';
import homeContentFallback from '@/data/homeContent.json';
import footerContentFallback from '@/data/footerContent.json';

// Type assertions for JSON imports
const navigationJson = navigationFallback as NavigationContent;
const homeContentJson = homeContentFallback as HomeContent;
const footerContentJson = footerContentFallback as FooterContent;

/**
 * Options for content fetching
 */
export interface ContentFetchOptions {
  /**
   * If true, fetch draft content instead of published content.
   * Only works when Supabase is available.
   */
  useDraft?: boolean;
}

/**
 * Fetch navigation content from Supabase, with JSON fallback.
 * 
 * @param options - Fetch options
 * @returns Navigation content
 */
export async function getNavigationContent(
  options?: ContentFetchOptions
): Promise<NavigationContent> {
  try {
    const supabaseContent = await fetchFromSupabase(
      'navigation',
      options?.useDraft ?? false,
      navigationContentSchema
    );

    if (supabaseContent) {
      return supabaseContent;
    }
  } catch (error) {
    // Silently fall back to JSON if Supabase fails
    console.warn('Failed to fetch navigation from Supabase, using JSON fallback:', error);
  }

  // Fallback to JSON
  return navigationJson;
}

/**
 * Fetch home content from Supabase, with JSON fallback.
 * 
 * @param options - Fetch options
 * @returns Home content
 */
export async function getHomeContent(
  options?: ContentFetchOptions
): Promise<HomeContent> {
  try {
    const supabaseContent = await fetchFromSupabase(
      'home',
      options?.useDraft ?? false,
      homeContentSchema
    );

    if (supabaseContent) {
      return supabaseContent;
    }
  } catch (error) {
    console.warn('Failed to fetch home content from Supabase, using JSON fallback:', error);
  }

  // Fallback to JSON
  return homeContentJson;
}

/**
 * Fetch footer content from Supabase, with JSON fallback.
 * 
 * @param options - Fetch options
 * @returns Footer content
 */
export async function getFooterContent(
  options?: ContentFetchOptions
): Promise<FooterContent> {
  try {
    const supabaseContent = await fetchFromSupabase(
      'footer',
      options?.useDraft ?? false,
      footerContentSchema
    );

    if (supabaseContent) {
      return supabaseContent;
    }
  } catch (error) {
    console.warn('Failed to fetch footer content from Supabase, using JSON fallback:', error);
  }

  // Fallback to JSON
  return footerContentJson;
}

/**
 * Fetch waitlist content from Supabase, with JSON fallback.
 * 
 * @param options - Fetch options
 * @returns Waitlist content
 */
export async function getWaitlistContent(
  options?: ContentFetchOptions
): Promise<WaitlistContent> {
  try {
    const supabaseContent = await fetchFromSupabase(
      'waitlist',
      options?.useDraft ?? false,
      waitlistContentSchema
    );

    if (supabaseContent) {
      return supabaseContent;
    }
  } catch (error) {
    console.warn('Failed to fetch waitlist content from Supabase, using JSON fallback:', error);
  }

  // Fallback to JSON - return minimal default
  return {
    title: 'Join the Waitlist',
    subtitle: '',
    description: '',
    image: '',
    formHeadline: '',
    formSubheadline: '',
    successMessage: 'Thank you! You\'ve been added to the waitlist. We\'ll be in touch soon.',
    seoTitle: '',
    seoDescription: '',
    successTitle: "You're on the list!",
    submitButtonLabel: 'Join Waitlist',
    submitButtonLoadingLabel: 'Submitting...',
    goalPlaceholder: 'Select a goal...',
    privacyNote: 'We respect your privacy. Unsubscribe at any time.',
    // Form field labels
    emailLabel: 'Email',
    nameLabel: 'Name',
    goalLabel: 'Goal',
    requiredLabel: '(required)',
    optionalLabel: '(optional)',
    // Form field placeholders
    emailPlaceholder: 'your.email@example.com',
    namePlaceholder: 'Your name',
    // Logo
    logoPath: '/images/home/Fine-Diet-Logo.svg',
    logoAlt: 'Fine Diet',
  };
}

/**
 * Fetch global content from Supabase, with JSON fallback.
 * 
 * @param options - Fetch options
 * @returns Global content
 */
export async function getGlobalContent(
  options?: ContentFetchOptions
): Promise<GlobalContent> {
  try {
    const supabaseContent = await fetchFromSupabase(
      'global',
      options?.useDraft ?? false,
      globalContentSchema
    );

    if (supabaseContent) {
      return supabaseContent;
    }
  } catch (error) {
    console.warn('Failed to fetch global content from Supabase, using JSON fallback:', error);
  }

  // Fallback to JSON - return empty default
  return {};
}

/**
 * Fetch product page content from Supabase by slug.
 * 
 * @param slug - Product slug (e.g., 'metabolic-reset')
 * @param options - Fetch options
 * @returns Product page content, or null if not found
 */
export async function getProductPageContent(
  slug: string,
  options?: ContentFetchOptions
): Promise<ProductPageContent | null> {
  try {
    // Dynamic import to ensure this only runs on the server
    const { supabaseAdmin } = await import('./supabaseServerClient');

    const key = `product:${slug}`;
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data, updated_at')
      .eq('key', key)
      .eq('status', options?.useDraft ? 'draft' : 'published')
      .single();

    if (error || !data || !data.data) {
      return null;
    }

    // Validate data against schema
    const validationResult = productPageContentSchema.safeParse(data.data);
    
    if (!validationResult.success) {
      console.warn(`Validation failed for product:${slug} content:`, validationResult.error);
      return null;
    }

    return validationResult.data;
  } catch (error) {
    console.warn(`Failed to fetch product:${slug} content:`, error);
    return null;
  }
}

/**
 * Internal helper to fetch content from Supabase with validation.
 * 
 * @param key - Content key
 * @param useDraft - Whether to fetch draft content
 * @param schema - Zod schema for validation
 * @returns Validated content from Supabase, or null if not available
 */
async function fetchFromSupabase<T>(
  key: SiteContentKey,
  useDraft: boolean,
  schema: z.ZodSchema<T>
): Promise<T | null> {
  // Only attempt Supabase fetch if we're in a server context
  if (typeof window !== 'undefined') {
    return null;
  }

  try {
    // Dynamic import to ensure this only runs on the server
    const { supabaseAdmin } = await import('./supabaseServerClient');

    // Query Supabase for content
    // Add a small cache-busting mechanism: fetch updated_at to ensure we get fresh data
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data, updated_at')
      .eq('key', key)
      .eq('status', useDraft ? 'draft' : 'published')
      .single();

    if (error || !data || !data.data) {
      return null;
    }

    // Validate data against schema
    const validationResult = schema.safeParse(data.data);
    
    if (!validationResult.success) {
      console.warn(`Validation failed for ${key} content:`, validationResult.error);
      return null;
    }

    return validationResult.data;
  } catch (error) {
    // If Supabase client can't be imported (e.g., missing env vars), return null
    // This will trigger JSON fallback
    return null;
  }
}

