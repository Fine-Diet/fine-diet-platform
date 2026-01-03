/**
 * Public API Route: Get Assessment Configuration
 * 
 * Returns assessment config from CMS with safe defaults fallback.
 * Public read-only endpoint (no auth required).
 * 
 * Phase 2 / Step 1.1: Public config endpoint for client-side usage with caching.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { assessmentConfigSchema } from '@/lib/contentValidators';
import { getDefaultAssessmentConfig } from '@/lib/config/getConfig';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; config?: any; error?: string }>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { type, version } = req.query;

  // Validate query params
  if (!type || typeof type !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'type query parameter is required',
    });
  }

  if (!version || typeof version !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'version query parameter is required',
    });
  }

  const versionNum = parseInt(version, 10);
  if (isNaN(versionNum)) {
    return res.status(400).json({
      success: false,
      error: 'version must be a valid number',
    });
  }

  // Phase 2 / Step 3: Use registry to validate allowed keys
  // Phase 2 / Step 4: Now supports gut-check v1 as well
  const configKey = `assessment-config:${type}:${versionNum}`;
  const { isConfigKeyAllowed } = await import('@/lib/config/registry');
  
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

    let config;

    if (error || !data || !data.data) {
      // Use defaults if CMS config is missing
      config = getDefaultAssessmentConfig(type as 'gut-check', versionNum);
    } else {
      // Validate data
      const validationResult = assessmentConfigSchema.safeParse(data.data);
      if (!validationResult.success) {
        // Use defaults if validation fails
        console.warn(`[Config API] Invalid ${configKey} data, using defaults:`, validationResult.error);
        config = getDefaultAssessmentConfig(type as 'gut-check', versionNum);
      } else {
        config = validationResult.data;
      }
    }

    // Set cache headers for CDN caching
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('[Config API] Error:', error);
    // Return defaults on error
    const config = getDefaultAssessmentConfig(type as 'gut-check', versionNum);
    return res.status(200).json({
      success: true,
      config,
    });
  }
}
