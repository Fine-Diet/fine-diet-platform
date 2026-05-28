-- ============================================================================
-- Program Runtime Packet 23 — program series admin-management foundation
--
-- Adds additive public-marketing series tables. Public pages can prefer
-- published DB-authored series while preserving the code-owned catalogue as a
-- fallback when no published DB series exist or the table has not been applied.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.program_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  category TEXT,
  hero_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  primary_cta_label TEXT,
  primary_cta_href TEXT,
  secondary_cta_label TEXT,
  secondary_cta_href TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.program_series IS
  'Packet 23: admin-authored public marketing program series. Published rows can override the code-owned series catalogue.';

CREATE TABLE IF NOT EXISTS public.program_series_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.program_series(id) ON DELETE CASCADE,
  program_slug TEXT NOT NULL
    CHECK (program_slug ~ '^[a-z0-9][a-z0-9-]*$'),
  title_override TEXT,
  description_override TEXT,
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.program_series_items IS
  'Packet 23: ordered program slugs inside admin-authored public marketing program series.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_program_series_slug
  ON public.program_series (slug);

CREATE INDEX IF NOT EXISTS idx_program_series_public_order
  ON public.program_series (status, display_order, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_program_series_items_slug
  ON public.program_series_items (series_id, program_slug);

CREATE INDEX IF NOT EXISTS idx_program_series_items_order
  ON public.program_series_items (series_id, status, display_order, created_at);

DROP TRIGGER IF EXISTS program_series_updated_at
  ON public.program_series;
CREATE TRIGGER program_series_updated_at
  BEFORE UPDATE ON public.program_series
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS program_series_items_updated_at
  ON public.program_series_items;
CREATE TRIGGER program_series_items_updated_at
  BEFORE UPDATE ON public.program_series_items
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

ALTER TABLE public.program_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_series_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published program_series"
  ON public.program_series;
CREATE POLICY "Public can read published program_series"
  ON public.program_series FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "Public can read published program_series_items"
  ON public.program_series_items;
CREATE POLICY "Public can read published program_series_items"
  ON public.program_series_items FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.program_series ps
      WHERE ps.id = program_series_items.series_id
        AND ps.status = 'published'
    )
  );

GRANT SELECT ON public.program_series TO anon, authenticated;
GRANT SELECT ON public.program_series_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_series TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_series_items TO service_role;
