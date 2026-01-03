/**
 * Sitemap Generator
 * 
 * Generates XML sitemap from static routes and CMS-backed dynamic routes.
 * Excludes routes with noindex=true.
 * 
 * Phase 1 / Step 3: CMS-backed sitemap with noindex exclusions
 */

import { GetServerSideProps } from 'next';
import { getNavigationContent } from '@/lib/contentApi';
import { getSeoForRoute } from '@/lib/seo/getSeo';
import { normalizeRoutePath } from '@/lib/seo/normalizeRoutePath';

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

interface SitemapProps {
  urls: SitemapUrl[];
}

/**
 * Generate XML sitemap from URLs
 */
function generateSitemapXml(urls: SitemapUrl[]): string {
  const urlsXml = urls
    .map((url) => {
      let urlXml = `  <url>\n    <loc>${escapeXml(url.loc)}</loc>`;
      if (url.lastmod) {
        urlXml += `\n    <lastmod>${escapeXml(url.lastmod)}</lastmod>`;
      }
      if (url.changefreq) {
        urlXml += `\n    <changefreq>${escapeXml(url.changefreq)}</changefreq>`;
      }
      if (url.priority) {
        urlXml += `\n    <priority>${escapeXml(url.priority)}</priority>`;
      }
      urlXml += `\n  </url>`;
      return urlXml;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Get canonical base URL from global SEO config
 */
async function getCanonicalBase(): Promise<string> {
  try {
    const seoResult = await getSeoForRoute({ routePath: '/' });
    // Extract base from canonical URL (remove path)
    const canonical = seoResult.seo.canonical;
    const url = new URL(canonical);
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    // Fallback to default
    return 'https://myfinediet.com';
  }
}

/**
 * Check if a route should be excluded (noindex)
 */
async function shouldExcludeRoute(routePath: string): Promise<boolean> {
  try {
    const seoResult = await getSeoForRoute({ routePath });
    // Check if robots contains noindex
    const robots = seoResult.seo.robots || '';
    return robots.toLowerCase().includes('noindex');
  } catch (error) {
    // If check fails, include the route (safe default)
    console.warn(`[sitemap] Failed to check noindex for ${routePath}:`, error);
    return false;
  }
}

export default function Sitemap({ urls }: SitemapProps) {
  // This component should never render - we return XML in getServerSideProps
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const canonicalBase = await getCanonicalBase();
  const urls: SitemapUrl[] = [];

  // Static routes
  const staticRoutes = ['/'];
  // TODO: Add other static routes if they exist (e.g., '/programs', '/categories')
  // For now, we only include home page as a static route

  // Add static routes
  for (const route of staticRoutes) {
    const normalizedRoute = normalizeRoutePath(route);
    const shouldExclude = await shouldExcludeRoute(normalizedRoute);
    
    if (!shouldExclude) {
      urls.push({
        loc: `${canonicalBase}${normalizedRoute}`,
        changefreq: 'daily',
        priority: '1.0',
      });
    }
  }

  // Dynamic routes from CMS (categories)
  try {
    const navigation = await getNavigationContent();
    
    // Process categories in parallel batches to avoid too many DB calls
    // We'll check noindex for each category
    const categoryChecks = await Promise.all(
      navigation.categories.map(async (category) => {
        const routePath = `/${category.id}`;
        const normalizedRoute = normalizeRoutePath(routePath);
        const shouldExclude = await shouldExcludeRoute(normalizedRoute);
        
        if (!shouldExclude) {
          return {
            loc: `${canonicalBase}${normalizedRoute}`,
            // Note: We don't have updated_at for categories in the current schema
            // If you add it later, include it here as lastmod
            changefreq: 'weekly',
            priority: '0.8',
          } as SitemapUrl;
        }
        return null;
      })
    );

    // Filter out nulls (excluded routes)
    const categoryUrls = categoryChecks.filter((url): url is SitemapUrl => url !== null);
    urls.push(...categoryUrls);
  } catch (error) {
    console.error('[sitemap] Failed to load categories:', error);
    // Continue with static routes only
  }

  // TODO: Add program/product routes if they exist in CMS
  // Example:
  // const products = await getProducts();
  // for (const product of products) {
  //   const routePath = `/products/${product.slug}`;
  //   const shouldExclude = await shouldExcludeRoute(routePath);
  //   if (!shouldExclude) {
  //     urls.push({ loc: `${canonicalBase}${routePath}`, ... });
  //   }
  // }

  // Generate XML
  const xml = generateSitemapXml(urls);

  // Set response headers
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  
  // Write XML response
  res.write(xml);
  res.end();

  return {
    props: {},
  };
};
