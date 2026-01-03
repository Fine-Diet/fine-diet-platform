/**
 * API Route: Get, Update, or Delete Media Asset
 * 
 * Handles GET (single asset), PATCH (update metadata), and DELETE operations.
 * Requires admin or editor role (admin only for DELETE).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import type { MediaAsset, MediaAssetUpdate } from '@/lib/mediaAssetsTypes';

interface AssetResponse {
  success: boolean;
  asset?: MediaAsset;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AssetResponse>
) {
  // Require admin or editor role
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { id } = req.query;
  const assetId = typeof id === 'string' ? id : null;

  if (!assetId) {
    return res.status(400).json({
      success: false,
      error: 'Asset ID is required',
    });
  }

    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  try {
    // GET: Fetch single asset
    if (req.method === 'GET') {
      const { data: asset, error } = await supabaseAdmin
        .from('media_assets')
        .select('*')
        .eq('id', assetId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: 'Asset not found',
          });
        }
        return res.status(500).json({
          success: false,
          error: `Database error: ${error.message}`,
        });
      }

      return res.status(200).json({
        success: true,
        asset: asset as MediaAsset,
      });
    }

    // PATCH: Update asset metadata
    if (req.method === 'PATCH') {
      const updates: MediaAssetUpdate = {};
      
      if (req.body.alt_text !== undefined) {
        updates.alt_text = req.body.alt_text || null;
      }
      if (req.body.tags !== undefined) {
        updates.tags = req.body.tags || [];
      }

      const { data: asset, error } = await supabaseAdmin
        .from('media_assets')
        .update(updates)
        .eq('id', assetId)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          success: false,
          error: `Database error: ${error.message}`,
        });
      }

      return res.status(200).json({
        success: true,
        asset: asset as MediaAsset,
      });
    }

    // DELETE: Remove asset (admin only)
    if (req.method === 'DELETE') {
      // Require admin role for deletion
      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin access required for deletion',
        });
      }

      // First get the asset to get the storage path
      const { data: asset, error: fetchError } = await supabaseAdmin
        .from('media_assets')
        .select('path')
        .eq('id', assetId)
        .single();

      if (fetchError) {
        return res.status(404).json({
          success: false,
          error: 'Asset not found',
        });
      }

      // Delete from storage
      const { error: storageError } = await supabaseAdmin.storage
        .from('assets')
        .remove([asset.path]);

      if (storageError) {
        console.error('Storage delete error:', storageError);
        // Continue with DB deletion even if storage deletion fails
      }

      // Delete from database
      const { error: deleteError } = await supabaseAdmin
        .from('media_assets')
        .delete()
        .eq('id', assetId);

      if (deleteError) {
        return res.status(500).json({
          success: false,
          error: `Database error: ${deleteError.message}`,
        });
      }

      return res.status(200).json({
        success: true,
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  } catch (error) {
    console.error('Asset operation error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
