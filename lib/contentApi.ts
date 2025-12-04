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
  SiteContentKey,
} from './contentTypes';
import {
  navigationContentSchema,
  homeContentSchema,
  footerContentSchema,
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
      options?.useDraft,
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
      options?.useDraft,
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
      options?.useDraft,
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
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
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

