/**
 * Public API Route: Get Feature Flags
 * 
 * Returns feature flags from CMS with safe defaults fallback.
 * Public read-only endpoint (no auth required).
 * 
 * Phase 2 / Step 2: Public config endpoint for feature flags with caching.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { featureFlagsSchema } from '@/lib/contentValidators';
import { DEFAULT_FEATURE_FLAGS } from '@/lib/config/defaults';
import { isConfigKeyAllowed } from '@/lib/config/registry';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; flags?: any; error?: string }>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Phase 2 / Step 3: Validate key is registered and publicly readable
  const configKey = 'feature-flags:global';
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

    let flags;

    if (error || !data || !data.data) {
      // Use defaults if CMS config is missing
      flags = DEFAULT_FEATURE_FLAGS;
    } else {
      // Validate data
      const validationResult = featureFlagsSchema.safeParse(data.data);
      if (!validationResult.success) {
        // Use defaults if validation fails
        console.warn('[Feature Flags API] Invalid feature-flags:global data, using defaults:', validationResult.error);
        flags = DEFAULT_FEATURE_FLAGS;
      } else {
        flags = validationResult.data;
      }
    }

    // Set cache headers for CDN caching
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json({
      success: true,
      flags,
    });
  } catch (error) {
    console.error('[Feature Flags API] Error:', error);
    // Return defaults on error
    const flags = DEFAULT_FEATURE_FLAGS;
    return res.status(200).json({
      success: true,
      flags,
    });
  }
}
