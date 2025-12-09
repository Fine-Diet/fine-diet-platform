/**
 * API Route: Update Product Content
 * 
 * TEMP / DEV ONLY - No authentication required
 * 
 * TODO: Add authentication and authorization checks
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { productPageContentSchema } from '@/lib/contentValidators';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; error?: string }>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const slug = req.query.slug as string;

    if (!slug) {
      return res.status(400).json({
        success: false,
        error: 'Slug is required',
      });
    }

    // Validate request body with Zod
    const validationResult = productPageContentSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
      });
    }

    const validatedContent = validationResult.data;

    // Import server client
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const key = `product:${slug}`;

    // Upsert into site_content table
    const { error } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key,
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

    // Revalidate product page if it exists
    try {
      await res.revalidate(`/products/${slug}`);
    } catch (revalidateError) {
      // Page might not exist yet, that's okay
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

