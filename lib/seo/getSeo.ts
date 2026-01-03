/**
 * SEO Metadata Loader and Merger
 * 
 * Loads SEO configuration from CMS (site_content) and merges global defaults
 * with route-specific overrides. Provides safe fallbacks if CMS is unavailable.
 */

import type { SeoGlobalConfig, SeoRouteConfig, BrowserAssets } from '@/lib/contentTypes';
import { seoGlobalConfigSchema, seoRouteConfigSchema, browserAssetsSchema } from '@/lib/contentValidators';
import { normalizeRoutePath } from './normalizeRoutePath';

/**
 * Normalized SEO metadata for rendering in <Head>
 */
export interface SeoMeta {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string | null;
  ogType: string;
  ogUrl: string;
  twitterCard: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string | null;
  robots: string;
}

/**
 * Hard-coded fallback defaults (used if CMS is unavailable)
 */
const FALLBACK_DEFAULTS: SeoGlobalConfig = {
  siteName: 'Fine Diet',
  titleTemplate: '{{pageTitle}} | {{siteName}}',
  defaultTitle: 'Fine Diet • Read your body. Reset your health.',
  defaultDescription: 'Bridging everyday wellness with real nutrition strategy and lifestyle therapy so you don\'t have to figure it out alone.',
  canonicalBase: 'https://myfinediet.com',
  twitterCard: 'summary_large_image',
  robots: 'index,follow',
};

/**
 * Options for getSeoForRoute
 */
export interface GetSeoForRouteOptions {
  routePath: string;
  pageTitle?: string;
  pageDescription?: string;
  canonicalPath?: string;
}

/**
 * Result from getSeoForRoute (includes SEO metadata and browser assets)
 */
export interface SeoForRouteResult {
  seo: SeoMeta;
  assets: BrowserAssets | null;
}

/**
 * Load SEO global config from CMS
 */
async function loadSeoGlobal(): Promise<SeoGlobalConfig | null> {
  // Only attempt Supabase fetch if we're in a server context
  if (typeof window !== 'undefined') {
    return null;
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'seo:global')
      .eq('status', 'published')
      .single();

    if (error || !data || !data.data) {
      return null;
    }

    // Validate data against schema
    const validationResult = seoGlobalConfigSchema.safeParse(data.data);
    if (!validationResult.success) {
      console.warn('[getSeo] Invalid seo:global data:', validationResult.error);
      return null;
    }

    return validationResult.data;
  } catch (error) {
    // If Supabase client can't be imported, return null (will use fallback)
    return null;
  }
}

/**
 * Load SEO route config from CMS
 */
async function loadSeoRoute(routePath: string): Promise<SeoRouteConfig | null> {
  // Only attempt Supabase fetch if we're in a server context
  if (typeof window !== 'undefined') {
    return null;
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const routeKey = `seo:route:${routePath}`;

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', routeKey)
      .eq('status', 'published')
      .single();

    if (error || !data || !data.data) {
      return null;
    }

    // Validate data against schema
    const validationResult = seoRouteConfigSchema.safeParse(data.data);
    if (!validationResult.success) {
      console.warn(`[getSeo] Invalid ${routeKey} data:`, validationResult.error);
      return null;
    }

    return validationResult.data;
  } catch (error) {
    // If Supabase client can't be imported, return null
    return null;
  }
}

/**
 * Load browser assets from CMS
 */
async function loadBrowserAssets(): Promise<BrowserAssets | null> {
  // Only attempt Supabase fetch if we're in a server context
  if (typeof window !== 'undefined') {
    return null;
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'seo:assets')
      .eq('status', 'published')
      .single();

    if (error || !data || !data.data) {
      return null;
    }

    // Validate data against schema
    const validationResult = browserAssetsSchema.safeParse(data.data);
    if (!validationResult.success) {
      console.warn('[getSeo] Invalid seo:assets data:', validationResult.error);
      return null;
    }

    return validationResult.data;
  } catch (error) {
    // If Supabase client can't be imported, return null
    return null;
  }
}

/**
 * Apply title template with variable substitution
 */
function applyTitleTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Get SEO metadata for a route
 * 
 * Merges global defaults with route-specific overrides and applies templating.
 * Falls back to hard-coded defaults if CMS is unavailable.
 * 
 * Extended (Phase 1 / Step 2): Also loads browser assets and handles per-page SEO overrides.
 */
export async function getSeoForRoute(options: GetSeoForRouteOptions): Promise<SeoForRouteResult> {
  const { routePath: rawRoutePath, pageTitle: providedPageTitle, pageDescription: providedPageDescription, canonicalPath: providedCanonicalPath } = options;

  // Normalize route path for consistent key generation
  const normalizedRoutePath = normalizeRoutePath(rawRoutePath);

  // Load global, route configs, and browser assets
  const [globalConfig, routeConfig, assets] = await Promise.all([
    loadSeoGlobal(),
    loadSeoRoute(normalizedRoutePath),
    loadBrowserAssets(),
  ]);

  // Use global config or fallback
  const config = globalConfig || FALLBACK_DEFAULTS;

  // Handle per-page SEO overrides (Phase 1 / Step 2)
  // Priority: routeConfig direct overrides > routeConfig legacy fields > provided > global defaults
  
  // Title: routeConfig.title (direct) > routeConfig.pageTitle > providedPageTitle > config.defaultTitle
  const finalPageTitle = routeConfig?.title || routeConfig?.pageTitle || providedPageTitle || config.defaultTitle;
  
  // Description: routeConfig.description (direct) > routeConfig.pageDescription > providedPageDescription > config.defaultDescription
  const finalPageDescription = routeConfig?.description || routeConfig?.pageDescription || providedPageDescription || config.defaultDescription;
  
  // Canonical: routeConfig.canonical (absolute) > build from routeConfig.canonicalPath > providedCanonicalPath > normalizedRoutePath
  let canonical: string;
  if (routeConfig?.canonical) {
    // Direct absolute canonical override
    canonical = routeConfig.canonical;
  } else {
    const finalCanonicalPath = routeConfig?.canonicalPath || providedCanonicalPath || normalizedRoutePath;
    const canonicalBase = config.canonicalBase.trim().endsWith('/') 
      ? config.canonicalBase.trim().slice(0, -1) 
      : config.canonicalBase.trim();
    const normalizedCanonicalPath = normalizeRoutePath(finalCanonicalPath);
    canonical = `${canonicalBase}${normalizedCanonicalPath}`;
  }
  
  // Assert canonical is absolute (safety check)
  if (!canonical.startsWith('http://') && !canonical.startsWith('https://')) {
    console.warn('[getSeo] Canonical URL is not absolute:', canonical);
  }

  // Robots: Handle noindex flag and routeConfig.robots
  let finalRobots = config.robots || 'index,follow';
  if (routeConfig?.noindex === true) {
    finalRobots = 'noindex,follow';
  } else if (routeConfig?.robots) {
    finalRobots = routeConfig.robots;
  }

  // Apply title template (unless routeConfig.title is set, which bypasses template)
  const finalTitle = routeConfig?.title 
    ? routeConfig.title 
    : applyTitleTemplate(config.titleTemplate, {
        pageTitle: finalPageTitle,
        siteName: config.siteName,
      });

  // OG tags: routeConfig.og overrides > routeConfig.ogImage > config.ogImage
  const finalOgTitle = routeConfig?.og?.title || finalPageTitle;
  const finalOgDescription = routeConfig?.og?.description || finalPageDescription;
  const finalOgImage = routeConfig?.og?.image || routeConfig?.ogImage || config.ogImage || null;
  const finalOgType = routeConfig?.og?.type || 'website';
  const ogUrl = canonical;

  // Twitter tags: routeConfig.twitter overrides > config.twitterCard
  const finalTwitterCard = routeConfig?.twitter?.card || config.twitterCard || 'summary_large_image';
  const finalTwitterTitle = routeConfig?.twitter?.title || finalPageTitle;
  const finalTwitterDescription = routeConfig?.twitter?.description || finalPageDescription;
  const finalTwitterImage = routeConfig?.twitter?.image || finalOgImage;

  return {
    seo: {
      title: finalTitle,
      description: finalPageDescription,
      canonical,
      ogTitle: finalOgTitle,
      ogDescription: finalOgDescription,
      ogImage: finalOgImage,
      ogType: finalOgType,
      ogUrl,
      twitterCard: finalTwitterCard,
      twitterTitle: finalTwitterTitle,
      twitterDescription: finalTwitterDescription,
      twitterImage: finalTwitterImage,
      robots: finalRobots,
    },
    assets,
  };
}
