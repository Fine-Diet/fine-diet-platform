/**
 * Media Assets Types
 * 
 * TypeScript types for media asset metadata stored in media_assets table.
 */

export interface MediaAsset {
  id: string;
  created_at: string;
  created_by: string | null;
  bucket: string;
  path: string;
  public_url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  tags: string[];
}

export interface MediaAssetCreate {
  bucket?: string;
  path: string;
  public_url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width?: number | null;
  height?: number | null;
  alt_text?: string | null;
  tags?: string[];
}

export interface MediaAssetUpdate {
  alt_text?: string | null;
  tags?: string[];
}

export interface MediaAssetUploadResult {
  asset: MediaAsset;
  success: boolean;
  error?: string;
}
