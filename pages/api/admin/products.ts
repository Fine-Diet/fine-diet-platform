/**
 * API Route: Create Product
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
    const { slug } = req.body;

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Slug is required',
      });
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({
        success: false,
        error: 'Slug must contain only lowercase letters, numbers, and hyphens',
      });
    }

    // Import server client
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    // Create default product content
    const defaultContent = {
      hero: {
        title: '',
        subtitle: '',
        description: '',
        imageDesktop: '',
        imageMobile: '',
        buttons: [],
      },
      valueProps: [],
      sections: [],
      faq: [],
      seo: {},
    };

    // Validate default content
    const validationResult = productPageContentSchema.safeParse(defaultContent);

    if (!validationResult.success) {
      return res.status(500).json({
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
      });
    }

    const key = `product:${slug}`;

    // Check if product already exists
    const { data: existing } = await supabaseAdmin
      .from('site_content')
      .select('key')
      .eq('key', key)
      .eq('status', 'published')
      .single();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Product with this slug already exists',
      });
    }

    // Create new product
    const { error } = await supabaseAdmin
      .from('site_content')
      .insert({
        key,
        status: 'published',
        data: validationResult.data,
        updated_at: new Date().toISOString(),
      });

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

