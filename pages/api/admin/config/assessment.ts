/**
 * API Route: Update Assessment Configuration
 * 
 * Protected with role-based access control (admin only)
 * 
 * Security:
 * - Requires authenticated user with 'admin' role
 * - Only allows updates to 'assessment-config:*' keys matching pattern
 * - For Step 1: Only allows gut-check v2 (can be extended later)
 * - Validates payload with Zod schema before writing
 * - Uses UPSERT strategy consistent with existing CMS writes
 * - Returns appropriate HTTP status codes (401/403/400/500)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { assessmentConfigSchema } from '@/lib/contentValidators';
import { isConfigKeyAllowed } from '@/lib/config/registry';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; error?: string }>
) {
  // Require admin role only (returns 401 if not authenticated, 403 if wrong role)
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) {
    // requireRoleFromApi already sent response for 401/403
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Ensure request body exists
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Request body is required',
    });
  }

  try {
    const { assessmentType, version, config } = req.body;

    // Validate assessmentType and version
    if (!assessmentType || typeof assessmentType !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'assessmentType is required and must be a string',
      });
    }

    if (!version || typeof version !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'version is required and must be a number',
      });
    }

    // Construct key (must match pattern assessment-config:*:*)
    const configKey = `assessment-config:${assessmentType}:${version}`;

    // Phase 2 / Step 3: Use registry to validate allowed keys
    if (!isConfigKeyAllowed(configKey)) {
      return res.status(400).json({
        success: false,
        error: `Config key "${configKey}" is not registered in the config registry.`,
      });
    }

    // Validate config with Zod schema
    const validationResult = assessmentConfigSchema.safeParse(config);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
      });
    }

    const validatedConfig = validationResult.data;

    // Import server client
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    // Upsert into site_content table
    const { error } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key: configKey,
          status: 'published',
          data: validatedConfig,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'key,status',
        }
      );

    if (error) {
      console.error('[Assessment Config API] Supabase error:', error);
      return res.status(500).json({
        success: false,
        error: `Database error: ${error.message}`,
      });
    }

    // Note: Assessment config changes don't require page revalidation (used in API routes)

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Assessment Config API] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}
