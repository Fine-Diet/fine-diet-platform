/**
 * Web App Manifest API Route
 * 
 * Generates a minimal web app manifest from browser assets configuration.
 * Falls back to safe defaults if seo:assets is missing.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { browserAssetsSchema } from '@/lib/contentValidators';

interface Manifest {
  name: string;
  short_name: string;
  icons?: Array<{
    src: string;
    sizes: string;
    type: string;
  }>;
  theme_color?: string;
  display?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Manifest>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      name: 'Fine Diet',
      short_name: 'Fine Diet',
    });
  }

  // Load browser assets from CMS
  let assets: any = null;

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'seo:assets')
      .eq('status', 'published')
      .single();

    if (!error && data?.data) {
      const validationResult = browserAssetsSchema.safeParse(data.data);
      if (validationResult.success) {
        assets = validationResult.data;
      }
    }
  } catch (error) {
    // If Supabase client can't be imported, use fallbacks
    console.warn('[manifest] Failed to load browser assets:', error);
  }

  // Build manifest with assets or fallbacks
  const manifest: Manifest = {
    name: assets?.manifestName || 'Fine Diet',
    short_name: assets?.manifestShortName || 'Fine Diet',
    display: 'standalone',
  };

  // Add icons if available
  const icons: Manifest['icons'] = [];
  if (assets?.favicon) {
    icons.push({
      src: assets.favicon,
      sizes: '32x32',
      type: 'image/png',
    });
  }
  if (assets?.appleTouchIcon) {
    icons.push({
      src: assets.appleTouchIcon,
      sizes: '180x180',
      type: 'image/png',
    });
  }
  if (icons.length > 0) {
    manifest.icons = icons;
  }

  // Add theme color if available
  if (assets?.themeColor) {
    manifest.theme_color = assets.themeColor;
  }

  // Set content type and cache headers
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600'); // Cache for 1 hour

  return res.status(200).json(manifest);
}
