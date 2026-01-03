-- Create media_assets table for image/asset metadata
-- This table stores metadata about uploaded assets in Supabase Storage

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bucket TEXT NOT NULL DEFAULT 'assets',
  path TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  
  CONSTRAINT valid_size CHECK (size_bytes >= 0),
  CONSTRAINT valid_dimensions CHECK (
    (width IS NULL AND height IS NULL) OR
    (width IS NOT NULL AND width > 0 AND height IS NOT NULL AND height > 0)
  )
);

-- Create index on path for fast lookups
CREATE INDEX IF NOT EXISTS idx_media_assets_path ON media_assets(path);

-- Create index on filename for search
CREATE INDEX IF NOT EXISTS idx_media_assets_filename ON media_assets(filename);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at DESC);

-- Enable Row Level Security
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can read all assets
CREATE POLICY "Authenticated users can view media assets"
  ON media_assets
  FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policy: Admin and editor roles can insert/update/delete
CREATE POLICY "Admins and editors can manage media assets"
  ON media_assets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'editor')
    )
  );

-- Note: Supabase Storage bucket 'assets' should be created manually in the Supabase dashboard
-- Bucket should be public (for CDN access) but with RLS policies restricting uploads to admin/editor
