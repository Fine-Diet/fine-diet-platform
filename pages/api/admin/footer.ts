/**
 * API Route: Update Footer Content
 * 
 * TEMP / DEV ONLY - No authentication required
 * 
 * TODO: Add authentication and authorization checks
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { footerContentSchema } from '@/lib/contentValidators';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; error?: string }>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Validate request body with Zod
    const validationResult = footerContentSchema.safeParse(req.body);

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
          key: 'footer',
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

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

