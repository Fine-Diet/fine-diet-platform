/**
 * API Route: Get SEO Global Configuration (Read-only)
 * 
 * Returns current global SEO config for admin UI inheritance hints.
 * No authentication required (read-only, public data).
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; config?: any; error?: string }>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'seo:global')
      .eq('status', 'published')
      .single();

    if (error || !data || !data.data) {
      return res.status(200).json({ success: true, config: null });
    }

    return res.status(200).json({ success: true, config: data.data });
  } catch (error) {
    console.error('[SEO Global API] Error:', error);
    return res.status(200).json({ success: true, config: null });
  }
}
