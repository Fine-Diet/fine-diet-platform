/**
 * Public API Route: Get Avatar Mapping
 * 
 * Returns avatar mapping from CMS with safe defaults fallback.
 * Public read-only endpoint (no auth required).
 * 
 * Phase 2 / Step 2: Public config endpoint for avatar mapping with caching.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { avatarMappingSchema } from '@/lib/contentValidators';
import { DEFAULT_AVATAR_MAPPING } from '@/lib/config/defaults';
import { isConfigKeyAllowed } from '@/lib/config/registry';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; mapping?: any; error?: string }>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Phase 2 / Step 3: Validate key is registered and publicly readable
  const configKey = 'avatar-mapping:global';
  if (!isConfigKeyAllowed(configKey)) {
    return res.status(400).json({
      success: false,
      error: `Config key "${configKey}" is not registered or not publicly readable.`,
    });
  }

  try {
    // Load config from CMS
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', configKey)
      .eq('status', 'published')
      .single();

    let mapping;

    if (error || !data || !data.data) {
      // Use defaults if CMS config is missing
      mapping = DEFAULT_AVATAR_MAPPING;
    } else {
      // Validate data
      const validationResult = avatarMappingSchema.safeParse(data.data);
      if (!validationResult.success) {
        // Use defaults if validation fails
        console.warn('[Avatar Mapping API] Invalid avatar-mapping:global data, using defaults:', validationResult.error);
        mapping = DEFAULT_AVATAR_MAPPING;
      } else {
        mapping = validationResult.data;
      }
    }

    // Set cache headers for CDN caching
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json({
      success: true,
      mapping,
    });
  } catch (error) {
    console.error('[Avatar Mapping API] Error:', error);
    // Return defaults on error
    const mapping = DEFAULT_AVATAR_MAPPING;
    return res.status(200).json({
      success: true,
      mapping,
    });
  }
}
