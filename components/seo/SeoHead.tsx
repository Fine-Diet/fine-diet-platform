/**
 * SEO Head Component
 * 
 * Renders SEO metadata tags in Next.js <Head> component.
 * Takes normalized SeoMeta and outputs all required meta tags.
 * 
 * Extended (Phase 1 / Step 2): Also renders browser asset tags (favicon, theme-color, etc.)
 */

import Head from 'next/head';
import type { SeoMeta, SeoForRouteResult } from '@/lib/seo/getSeo';
import type { BrowserAssets } from '@/lib/contentTypes';

interface SeoHeadProps {
  seo: SeoMeta;
  assets?: BrowserAssets | null;
}

export function SeoHead({ seo, assets }: SeoHeadProps) {
  return (
    <Head>
      {/* Primary Meta Tags */}
      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      {seo.robots && <meta name="robots" content={seo.robots} />}

      {/* Canonical URL */}
      <link rel="canonical" href={seo.canonical} />

      {/* Browser Assets (Phase 1 / Step 2) */}
      {assets?.favicon && (
        <link rel="icon" href={assets.favicon} />
      )}
      {assets?.appleTouchIcon && (
        <link rel="apple-touch-icon" href={assets.appleTouchIcon} />
      )}
      {assets?.themeColor && (
        <meta name="theme-color" content={assets.themeColor} />
      )}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={seo.ogType} />
      <meta property="og:url" content={seo.ogUrl} />
      <meta property="og:title" content={seo.ogTitle} />
      <meta property="og:description" content={seo.ogDescription} />
      {seo.ogImage && <meta property="og:image" content={seo.ogImage} />}

      {/* Twitter */}
      <meta name="twitter:card" content={seo.twitterCard} />
      <meta name="twitter:title" content={seo.twitterTitle} />
      <meta name="twitter:description" content={seo.twitterDescription} />
      {seo.twitterImage && <meta name="twitter:image" content={seo.twitterImage} />}
    </Head>
  );
}
