/**
 * SEO Metadata Loader and Merger
 * 
 * Loads SEO configuration from CMS (site_content) and merges global defaults
 * with route-specific overrides. Provides safe fallbacks if CMS is unavailable.
 */

import type { SeoGlobalConfig, SeoRouteConfig, BrowserAssets } from '@/lib/contentTypes';
import { seoGlobalConfigSchema, seoRouteConfigSchema, browserAssetsSchema } from '@/lib/contentValidators';
import { normalizeRoutePath } from './normalizeRoutePath';
import type { SeoSocialFields } from './seoSocialFields';

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
 *
 * `pageOverride` carries the page/admin-authored social preview block (the
 * `seo` field from a Start Page / Integrative Care / Programs marketing
 * product record). It wins over the route-level `seo:route:{path}` record but
 * below... actually it is the HIGHEST precedence source, per the approved
 * chain: page/admin override → route-specific SEO record → product/page
 * record SEO fields → page/template defaults → global fallback. Blank fields
 * on the override do not shadow useful fallbacks because the editor strips
 * empty values before save and the merger only reads present fields.
 */
export interface GetSeoForRouteOptions {
  routePath: string;
  pageTitle?: string;
  pageDescription?: string;
  canonicalPath?: string;
  /**
   * Page/admin override block (highest precedence). Structurally compatible
   * with `SeoRouteConfig` (it is the social-preview subset). Passed in from
   * the resolved page record's `seo` field.
   */
  pageOverride?: SeoSocialFields | null;
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
  const {
    routePath: rawRoutePath,
    pageTitle: providedPageTitle,
    pageDescription: providedPageDescription,
    canonicalPath: providedCanonicalPath,
    pageOverride,
  } = options;

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

  // Page/admin override is the highest-precedence source. It is structurally
  // compatible with SeoRouteConfig (the social-preview subset), so we layer it
  // on top of the route-level record by preferring its fields where present.
  const override = (pageOverride ?? null) as SeoRouteConfig | null;

  // Handle per-page SEO overrides (Phase 1 / Step 2)
  // Priority: pageOverride > routeConfig > provided > global defaults

  // Title: override.title > routeConfig.title > routeConfig.pageTitle > provided > default
  const finalPageTitle =
    override?.title ||
    routeConfig?.title ||
    routeConfig?.pageTitle ||
    providedPageTitle ||
    config.defaultTitle;

  // Description: override.description > routeConfig.description > routeConfig.pageDescription > provided > default
  const finalPageDescription =
    override?.description ||
    routeConfig?.description ||
    routeConfig?.pageDescription ||
    providedPageDescription ||
    config.defaultDescription;

  // Canonical: override.canonical (absolute) > override.canonicalPath > routeConfig.canonical > routeConfig.canonicalPath > provided > route
  let canonical: string;
  if (override?.canonical) {
    canonical = override.canonical;
  } else if (routeConfig?.canonical) {
    // Direct absolute canonical override
    canonical = routeConfig.canonical;
  } else {
    const finalCanonicalPath =
      override?.canonicalPath ||
      routeConfig?.canonicalPath ||
      providedCanonicalPath ||
      normalizedRoutePath;
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

  // Robots: override.robots (explicit directive) > override.noindex flag >
  // routeConfig.robots / routeConfig.noindex > global. An explicit robots value
  // is more specific than the convenience noindex flag, so it wins when both
  // are set.
  let finalRobots = config.robots || 'index,follow';
  if (override?.robots) {
    finalRobots = override.robots;
  } else if (override?.noindex === true) {
    finalRobots = 'noindex,follow';
  } else if (routeConfig?.robots) {
    finalRobots = routeConfig.robots;
  } else if (routeConfig?.noindex === true) {
    finalRobots = 'noindex,follow';
  }

  // Apply title template (unless a direct title override is set on override or
  // routeConfig, both of which bypass the template).
  const bypassTemplate = Boolean(override?.title || routeConfig?.title);
  const finalTitle = bypassTemplate
    ? (override?.title || routeConfig?.title) as string
    : applyTitleTemplate(config.titleTemplate, {
        pageTitle: finalPageTitle,
        siteName: config.siteName,
      });

  // OG tags: override.og > routeConfig.og > routeConfig.ogImage > config.ogImage
  const finalOgTitle = override?.og?.title || routeConfig?.og?.title || finalPageTitle;
  const finalOgDescription =
    override?.og?.description || routeConfig?.og?.description || finalPageDescription;
  const finalOgImage =
    override?.og?.image ||
    routeConfig?.og?.image ||
    routeConfig?.ogImage ||
    config.ogImage ||
    null;
  const finalOgType = override?.og?.type || routeConfig?.og?.type || 'website';
  const ogUrl = canonical;

  // Twitter tags: override.twitter > routeConfig.twitter > config.twitterCard
  const finalTwitterCard =
    override?.twitter?.card || routeConfig?.twitter?.card || config.twitterCard || 'summary_large_image';
  const finalTwitterTitle =
    override?.twitter?.title || routeConfig?.twitter?.title || finalPageTitle;
  const finalTwitterDescription =
    override?.twitter?.description || routeConfig?.twitter?.description || finalPageDescription;
  const finalTwitterImage = override?.twitter?.image || routeConfig?.twitter?.image || finalOgImage;

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
