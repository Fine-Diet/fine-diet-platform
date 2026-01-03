/**
 * API Route: Update SEO Global Configuration
 * 
 * Protected with role-based access control (admin only)
 * 
 * Security:
 * - Requires authenticated user with 'admin' role
 * - Only allows updates to 'seo:global' key (no arbitrary key updates)
 * - Validates payload with Zod schema before writing
 * - Uses UPSERT strategy consistent with existing CMS writes
 * - Returns appropriate HTTP status codes (401/403/400/500)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { seoGlobalConfigSchema } from '@/lib/contentValidators';

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
    const validationResult = seoGlobalConfigSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
      });
    }

    const validatedContent = validationResult.data;

    // Import server client
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    // Upsert into site_content table
    // Security: Hard-code key to 'seo:global' - no arbitrary key updates allowed
    const { error } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key: 'seo:global',
          status: 'published',
          data: validatedContent,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'key,status',
        }
      );

    if (error) {
      console.error('[SEO API] Supabase error:', error);
      return res.status(500).json({
        success: false,
        error: `Database error: ${error.message}`,
      });
    }

    // Revalidate pages that use SEO (home and category pages)
    // Note: This is best-effort; ISR will also pick up changes on next request
    try {
      await res.revalidate('/');
      // Note: Category pages will be revalidated on next request due to ISR (300s revalidate)
    } catch (revalidateError) {
      // Non-blocking: content is saved, revalidation failure doesn't prevent success
      console.warn('[SEO API] Revalidation warning (content still saved):', revalidateError);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[SEO API] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}
