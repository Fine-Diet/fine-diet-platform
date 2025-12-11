/**
 * API Route: Update Home Content
 * 
 * Protected with role-based access control (editor/admin only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { homeContentSchema } from '@/lib/contentValidators';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; error?: string }>
) {
  // Require editor or admin role
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Validate request body with Zod
    const validationResult = homeContentSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
      });
    }

    const validatedContent = validationResult.data;

    // Import server client (only works on server)
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    // Upsert into site_content table
    const { error } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key: 'home',
          status: 'published',
          data: validatedContent,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'key,status',
        }
      );

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({
        success: false,
        error: `Database error: ${error.message}`,
      });
    }

    // Revalidate homepage after home content update
    // This ensures home content updates appear immediately instead of waiting for cache expiry
    try {
      await res.revalidate('/');
    } catch (revalidateError) {
      // Log revalidation errors but don't fail the request
      // The content is saved, it will just take time to appear
      console.warn('Revalidation warning (content still saved):', revalidateError);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

