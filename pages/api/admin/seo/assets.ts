/**
 * API Route: Update Browser Assets Configuration
 * 
 * Protected with role-based access control (admin only)
 * 
 * Security:
 * - Requires authenticated user with 'admin' role
 * - Only allows updates to 'seo:assets' key (no arbitrary key updates)
 * - Validates payload with Zod schema before writing
 * - Uses UPSERT strategy consistent with existing CMS writes
 * - Returns appropriate HTTP status codes (401/403/400/500)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { browserAssetsSchema } from '@/lib/contentValidators';

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
    // Validate request body with Zod schema
    const validationResult = browserAssetsSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
      });
    }

    const validatedAssets = validationResult.data;

    // Import server client
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    // Upsert into site_content table
    // Security: Hard-code key to 'seo:assets' - no arbitrary key updates allowed
    const { error } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key: 'seo:assets',
          status: 'published',
          data: validatedAssets,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'key,status',
        }
      );

    if (error) {
      console.error('[Browser Assets API] Supabase error:', error);
      return res.status(500).json({
        success: false,
        error: `Database error: ${error.message}`,
      });
    }

    // Note: Browser assets don't require page revalidation (they're in <head> and will update on next render)

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Browser Assets API] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}
