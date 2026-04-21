-- ============================================================================
-- Plans Phase 12 (Program content authoring + delivery wiring) — additive schema
--
-- Replaces the in-code PROGRAM_CATALOGUE stub introduced in Packet 11 with a
-- proper managed content model:
--
--   programs              : catalogue entries (slug, title, description, status)
--   program_modules       : ordered sections inside a program
--   program_content_items : ordered content items inside a module
--
-- Conceptually distinct from `program_plan_guidance` (which is Plans-bound
-- directive data, not user-visible content) and from `program_assignments`
-- (runtime assignment lifecycle). Packet 12 does NOT move or reshape either.
--
-- RLS mirrors program_assignments: service_role writes, authenticated SELECT
-- is permitted for *published* rows so the user-facing library/detail can
-- read without bouncing through the service role. Admin APIs continue to
-- use service_role.
--
-- Run via the Supabase SQL Editor OR the `apply_migration` MCP call
-- (`add_plans_phase_12_program_content_tables`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- programs (catalogue entry per program slug)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stable machine identifier shared with program_assignments.program_slug
  -- and the `program:<slug>` entitlement key convention. Must be URL-safe.
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),

  title TEXT NOT NULL,
  tagline TEXT,
  description TEXT,

  -- Optional marketing/storefront URL surfaced on detail pages.
  storefront_href TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  -- Lightweight metadata for rendering hints / feature flags. Kept as
  -- JSONB so we don't add columns every time product adds a toggle.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.programs IS
  'Phase 12: admin-managed program catalogue. Slug is canonical and joins to program_assignments.program_slug.';

CREATE INDEX IF NOT EXISTS idx_programs_status
  ON public.programs (status);

DROP TRIGGER IF EXISTS programs_updated_at ON public.programs;
CREATE TRIGGER programs_updated_at
  BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ----------------------------------------------------------------------------
-- program_modules (ordered sections inside a program)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,

  -- Zero-based ordinal within the program. Admin reorder endpoints
  -- rewrite ordinals in a single transaction.
  ordinal INTEGER NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.program_modules IS
  'Phase 12: ordered modules (sections) inside a program. Status gates user-facing visibility.';

CREATE INDEX IF NOT EXISTS idx_program_modules_program_ord
  ON public.program_modules (program_id, ordinal);

CREATE INDEX IF NOT EXISTS idx_program_modules_status
  ON public.program_modules (status);

DROP TRIGGER IF EXISTS program_modules_updated_at ON public.program_modules;
CREATE TRIGGER program_modules_updated_at
  BEFORE UPDATE ON public.program_modules
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ----------------------------------------------------------------------------
-- program_content_items (ordered items inside a module)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.program_modules(id) ON DELETE CASCADE,

  item_type TEXT NOT NULL
    CHECK (item_type IN ('article', 'guidance', 'video', 'milestone')),

  title TEXT NOT NULL,
  summary TEXT,

  -- Rich body for article/guidance. Plain text or markdown; renderer
  -- decides. Video items typically leave this empty.
  body TEXT,

  -- Video-specific delivery metadata. url is the external embed/link;
  -- provider is a hint ('vimeo', 'youtube', 'mux', etc.).
  video_url TEXT,
  video_provider TEXT,

  estimated_minutes INTEGER
    CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),

  ordinal INTEGER NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.program_content_items IS
  'Phase 12: ordered content items inside a program module. item_type drives renderer.';

CREATE INDEX IF NOT EXISTS idx_program_content_items_module_ord
  ON public.program_content_items (module_id, ordinal);

CREATE INDEX IF NOT EXISTS idx_program_content_items_status
  ON public.program_content_items (status);

CREATE INDEX IF NOT EXISTS idx_program_content_items_type
  ON public.program_content_items (item_type);

DROP TRIGGER IF EXISTS program_content_items_updated_at ON public.program_content_items;
CREATE TRIGGER program_content_items_updated_at
  BEFORE UPDATE ON public.program_content_items
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_content_items ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read published rows directly (the user-facing
-- library/detail paths go through the service_role server layer in V1,
-- but direct reads are useful for future client-side prefetching).
CREATE POLICY "Authenticated can read published programs"
  ON public.programs FOR SELECT
  USING (status = 'published');

CREATE POLICY "Authenticated can read published program_modules"
  ON public.program_modules FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_modules.program_id
        AND p.status = 'published'
    )
  );

CREATE POLICY "Authenticated can read published program_content_items"
  ON public.program_content_items FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.program_modules m
      JOIN public.programs p ON p.id = m.program_id
      WHERE m.id = program_content_items.module_id
        AND m.status = 'published'
        AND p.status = 'published'
    )
  );

GRANT SELECT ON public.programs TO authenticated;
GRANT SELECT ON public.program_modules TO authenticated;
GRANT SELECT ON public.program_content_items TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_modules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_content_items TO service_role;
