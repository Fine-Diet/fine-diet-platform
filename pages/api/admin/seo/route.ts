/**
 * API Route: Get/Update Per-Route SEO Configuration
 * 
 * Protected with role-based access control (admin only)
 * 
 * Security:
 * - Requires authenticated user with 'admin' role (for POST)
 * - GET is read-only and can be public (for admin UI)
 * - Only allows updates to 'seo:route:*' keys (no arbitrary key updates)
 * - Validates payload with Zod schema before writing
 * - Uses UPSERT strategy consistent with existing CMS writes
 * - Returns appropriate HTTP status codes (401/403/400/500)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { seoRouteConfigSchema } from '@/lib/contentValidators';
import { normalizeRoutePath } from '@/lib/seo/normalizeRoutePath';

// GET: Read route SEO config
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { routePath } = req.query;

  if (!routePath || typeof routePath !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'routePath query parameter is required',
    });
  }

  try {
    const normalizedRoutePath = normalizeRoutePath(routePath);
    const routeKey = `seo:route:${normalizedRoutePath}`;

    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', routeKey)
      .eq('status', 'published')
      .single();

    if (error || !data || !data.data) {
      return res.status(200).json({ success: true, config: null });
    }

    // Validate data
    const validationResult = seoRouteConfigSchema.safeParse(data.data);
    if (!validationResult.success) {
      return res.status(200).json({ success: true, config: null });
    }

    return res.status(200).json({ success: true, config: validationResult.data });
  } catch (error) {
    console.error('[SEO Route API] GET error:', error);
    return res.status(200).json({ success: true, config: null });
  }
}

// POST: Update route SEO config
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  // Require admin role only (returns 401 if not authenticated, 403 if wrong role)
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) {
    // requireRoleFromApi already sent response for 401/403
    return;
  }

  // Ensure request body exists
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Request body is required',
    });
  }

  try {
    const { routePath, seoConfig } = req.body;

    // Validate routePath
    if (!routePath || typeof routePath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'routePath is required and must be a string',
      });
    }

    // Normalize route path
    const normalizedRoutePath = normalizeRoutePath(routePath);
    const routeKey = `seo:route:${normalizedRoutePath}`;

    // Validate SEO config with Zod schema
    const validationResult = seoRouteConfigSchema.safeParse(seoConfig);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
      });
    }

    const validatedConfig = validationResult.data;

    // Remove undefined/empty fields (don't save nulls)
    const cleanedConfig: any = {};
    Object.entries(validatedConfig).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        cleanedConfig[key] = value;
      }
    });

    // If config is empty after cleaning, delete the route SEO instead of saving empty object
    if (Object.keys(cleanedConfig).length === 0) {
      // Delete the route SEO entry
      const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
      const { error } = await supabaseAdmin
        .from('site_content')
        .delete()
        .eq('key', routeKey)
        .eq('status', 'published');

      if (error) {
        console.error('[SEO Route API] Delete error:', error);
        return res.status(500).json({
          success: false,
          error: `Database error: ${error.message}`,
        });
      }

      return res.status(200).json({ success: true });
    }

    // Import server client
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    // Upsert into site_content table
    // Security: Key is constructed from normalized routePath - no arbitrary keys allowed
    const { error } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key: routeKey,
          status: 'published',
          data: cleanedConfig,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'key,status',
        }
      );

    if (error) {
      console.error('[SEO Route API] Supabase error:', error);
      return res.status(500).json({
        success: false,
        error: `Database error: ${error.message}`,
      });
    }

    // Revalidate the route page if it exists (best-effort)
    try {
      await res.revalidate(normalizedRoutePath);
    } catch (revalidateError) {
      // Non-blocking: content is saved, revalidation failure doesn't prevent success
      console.warn('[SEO Route API] Revalidation warning (content still saved):', revalidateError);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[SEO Route API] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; config?: any; error?: string }>
) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  } else {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}
