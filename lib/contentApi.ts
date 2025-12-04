/**
 * Content API
 * 
 * Centralized content fetching with Supabase + JSON fallback.
 * 
 * This module provides functions to fetch site content from Supabase,
 * with automatic fallback to JSON files if Supabase is unavailable or returns null.
 */

import {
  NavigationContent,
  HomeContent,
  FooterContent,
  SiteContentKey,
} from './contentTypes';

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
    // TODO: Replace with actual Supabase query once schema is ready
    // Expected Supabase structure:
    // - Table: site_content
    // - Columns: key (text), data (jsonb), status (text: 'draft' | 'published')
    // - Query: SELECT data FROM site_content WHERE key = 'navigation' AND status = 'published' (or 'draft' if useDraft)
    
    // Stub: Try Supabase fetch (will fail gracefully if not configured)
    const supabaseContent = await fetchFromSupabase<NavigationContent>(
      'navigation',
      options?.useDraft
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
    // TODO: Replace with actual Supabase query once schema is ready
    const supabaseContent = await fetchFromSupabase<HomeContent>(
      'home',
      options?.useDraft
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
    // TODO: Replace with actual Supabase query once schema is ready
    const supabaseContent = await fetchFromSupabase<FooterContent>(
      'footer',
      options?.useDraft
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
 * Internal helper to fetch content from Supabase.
 * 
 * This is a stub implementation that will be replaced once the Supabase schema is ready.
 * 
 * @param key - Content key
 * @param useDraft - Whether to fetch draft content
 * @returns Content from Supabase, or null if not available
 */
async function fetchFromSupabase<T>(
  key: SiteContentKey,
  useDraft = false
): Promise<T | null> {
  // Only attempt Supabase fetch if we're in a server context
  if (typeof window !== 'undefined') {
    return null;
  }

  try {
    // Dynamic import to ensure this only runs on the server
    const { supabaseAdmin } = await import('./supabaseServerClient');

    // TODO: Replace with actual query once schema is ready
    // Expected query:
    // const { data, error } = await supabaseAdmin
    //   .from('site_content')
    //   .select('data')
    //   .eq('key', key)
    //   .eq('status', useDraft ? 'draft' : 'published')
    //   .single();
    //
    // if (error || !data) {
    //   return null;
    // }
    //
    // return data.data as T;

    // Stub: Return null for now (will use JSON fallback)
    return null;
  } catch (error) {
    // If Supabase client can't be imported (e.g., missing env vars), return null
    return null;
  }
}

