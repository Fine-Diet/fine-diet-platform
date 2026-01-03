/**
 * API Route: List Media Assets
 * 
 * Returns a list of all media assets with optional filtering.
 * Requires admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import type { MediaAsset } from '@/lib/mediaAssetsTypes';

interface ListResponse {
  success: boolean;
  assets?: MediaAsset[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse>
) {
  // Require admin or editor role
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { search } = req.query;
    const searchTerm = typeof search === 'string' ? search.trim() : '';

    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    let query = supabaseAdmin
      .from('media_assets')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply search filter if provided
    if (searchTerm) {
      query = query.ilike('filename', `%${searchTerm}%`);
    }

    const { data: assets, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({
        success: false,
        error: `Database error: ${error.message}`,
      });
    }

    return res.status(200).json({
      success: true,
      assets: (assets || []) as MediaAsset[],
    });
  } catch (error) {
    console.error('List error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
