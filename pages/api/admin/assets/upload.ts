/**
 * API Route: Upload Media Asset
 * 
 * Handles file uploads to Supabase Storage and creates metadata records.
 * Requires admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import type { MediaAsset } from '@/lib/mediaAssetsTypes';

interface UploadResponse {
  success: boolean;
  asset?: MediaAsset;
  error?: string;
}

// Note: For file uploads, we'll use base64 encoding from the client
// In a production setup, you might want to use multipart/form-data with a library like formidable
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UploadResponse>
) {
  // Require admin or editor role
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { file, filename, folder } = req.body;

    if (!file || !filename) {
      return res.status(400).json({
        success: false,
        error: 'File and filename are required',
      });
    }

    // Validate file is base64 encoded
    if (typeof file !== 'string' || !file.startsWith('data:')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file format. Expected base64 data URL',
      });
    }

    // Parse data URL (format: data:image/png;base64,...)
    const matches = file.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({
        success: false,
        error: 'Invalid data URL format',
      });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Validate file type (images only for now)
    if (!mimeType.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        error: 'Only image files are supported',
      });
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (buffer.length > maxSize) {
      return res.status(400).json({
        success: false,
        error: 'File size exceeds 10MB limit',
      });
    }

    // Determine folder path
    const folderPath = folder && typeof folder === 'string' ? folder.replace(/^\/+|\/+$/g, '') : 'misc';
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${sanitizedFilename}`;
    const storagePath = `${folderPath}/${uniqueFilename}`;

    // Get Supabase admin client
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('assets')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return res.status(500).json({
        success: false,
        error: `Upload failed: ${uploadError.message}`,
      });
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('assets')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Get image dimensions (optional, can be done client-side or with sharp)
    // For Phase 1, we'll set these to null and can enhance later
    let width: number | null = null;
    let height: number | null = null;

    // Try to get dimensions from image buffer (basic implementation)
    if (mimeType.startsWith('image/')) {
      try {
        // Simple dimension extraction for common formats
        // For production, consider using sharp or jimp
        if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/gif') {
          // Basic dimension reading (simplified - in production use a proper image library)
          // For now, we'll leave as null
        }
      } catch (err) {
        // Ignore dimension extraction errors
      }
    }

    // Create metadata record
    const { data: assetData, error: dbError } = await supabaseAdmin
      .from('media_assets')
      .insert({
        created_by: user.id,
        bucket: 'assets',
        path: storagePath,
        public_url: publicUrl,
        filename: sanitizedFilename,
        mime_type: mimeType,
        size_bytes: buffer.length,
        width,
        height,
        alt_text: null,
        tags: [],
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Try to clean up uploaded file
      await supabaseAdmin.storage.from('assets').remove([storagePath]);
      return res.status(500).json({
        success: false,
        error: `Database error: ${dbError.message}`,
      });
    }

    return res.status(200).json({
      success: true,
      asset: assetData as MediaAsset,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
