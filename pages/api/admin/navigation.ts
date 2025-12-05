/**
 * API Route: Update Navigation Content
 * 
 * TEMP / DEV ONLY - No authentication required
 * 
 * TODO: Add authentication and authorization checks
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { navigationContentSchema } from '@/lib/contentValidators';

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
    const validationResult = navigationContentSchema.safeParse(req.body);

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
          key: 'navigation',
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

    // Revalidate all category pages and homepage after navigation update
    // This ensures image updates appear immediately instead of waiting 60 seconds
    // Note: getInitialProps in _app.tsx runs on every request, but we still revalidate
    // the pages to ensure any cached navigation data is refreshed
    try {
      // Revalidate homepage (navigation affects all pages via _app.tsx)
      // This forces Next.js to regenerate the page and re-run getInitialProps
      await res.revalidate('/');
      
      // Revalidate all category pages
      for (const category of validatedContent.categories) {
        try {
          await res.revalidate(`/${category.id}`);
        } catch (revalidateError) {
          // Log but don't fail - some categories might not exist yet
          console.warn(`Failed to revalidate /${category.id}:`, revalidateError);
        }
      }
    } catch (revalidateError) {
      // Log revalidation errors but don't fail the request
      // The content is saved, it will just take up to 60 seconds to appear
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

