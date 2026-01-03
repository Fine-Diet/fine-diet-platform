/**
 * Robots.txt Generator
 * 
 * Serves robots.txt from CMS (seo:robots) with safe fallback.
 * Automatically appends Sitemap line if missing.
 * 
 * Phase 1 / Step 3: CMS-backed robots.txt
 */

import { GetServerSideProps } from 'next';

interface RobotsProps {
  content: string;
}

/**
 * Get canonical base URL for sitemap reference
 */
async function getCanonicalBase(): Promise<string> {
  try {
    const { getSeoForRoute } = await import('@/lib/seo/getSeo');
    const seoResult = await getSeoForRoute({ routePath: '/' });
    const canonical = seoResult.seo.canonical;
    const url = new URL(canonical);
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    return 'https://myfinediet.com';
  }
}

/**
 * Load robots.txt content from CMS
 */
async function loadRobotsContent(): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { robotsContentSchema } = await import('@/lib/contentValidators');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'seo:robots')
      .eq('status', 'published')
      .single();

    if (error || !data || !data.data) {
      return null;
    }

    // Validate data
    const validationResult = robotsContentSchema.safeParse(data.data);
    if (!validationResult.success) {
      console.warn('[robots.txt] Invalid seo:robots data:', validationResult.error);
      return null;
    }

    return validationResult.data.content || null;
  } catch (error) {
    console.warn('[robots.txt] Failed to load robots content:', error);
    return null;
  }
}

/**
 * Ensure sitemap line exists in robots content
 */
function ensureSitemapLine(content: string, canonicalBase: string): string {
  const sitemapLine = `Sitemap: ${canonicalBase}/sitemap.xml`;
  const sitemapRegex = /^Sitemap:\s*.+$/im;

  // Check if sitemap line already exists
  if (sitemapRegex.test(content)) {
    return content;
  }

  // Append sitemap line
  const trimmed = content.trim();
  if (trimmed) {
    return `${trimmed}\n\n${sitemapLine}`;
  }

  return sitemapLine;
}

export default function Robots({ content }: RobotsProps) {
  // This component should never render - we return text in getServerSideProps
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  // Load robots content from CMS
  const cmsContent = await loadRobotsContent();
  
  // Use CMS content or fallback to default
  let robotsContent = cmsContent || `User-agent: *
Allow: /`;

  // Get canonical base for sitemap reference
  const canonicalBase = await getCanonicalBase();

  // Ensure sitemap line exists
  robotsContent = ensureSitemapLine(robotsContent, canonicalBase);

  // Set response headers
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  // Write robots.txt response
  res.write(robotsContent);
  res.end();

  return {
    props: {
      content: robotsContent,
    },
  };
};
