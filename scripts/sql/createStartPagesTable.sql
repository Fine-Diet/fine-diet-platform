-- ============================================================================
-- Start Pages / Offer Landing Pages: public.start_pages
-- Run this in Supabase Dashboard -> SQL Editor.
--
-- SOURCE-OF-TRUTH BOUNDARY (do not blur this):
--   - `offers` rows + `offer_entitlements`   = access / entitlements / grants.
--   - `price_options` rows                    = BILLING truth (Stripe IDs, trial).
--   - `start_pages` rows                      = PRESENTATION for the /start
--     surface ONLY: which approved price options to show, section copy,
--     visibility, SEO. NO Stripe price IDs, billing models, trial enforcement,
--     entitlement mappings, or grant controls live here.
--
-- A start page selects an existing parent offer (`primary_offer_key`) and a set
-- of already-approved `price_option_keys`. It NEVER defines anything chargeable.
--
-- Draft / published model mirrors Integrative Care (`site_content`):
--   - Two rows max per slug: one `draft`, one `published` (+ optional `archived`).
--   - Publish copies the draft row into the published row; the live page stays
--     stable while a draft is edited.
--   - Exactly one published row may own a given `route_path`.
--
-- Hard rules (mirror createPriceOptionsTable.sql):
--   - Additive only / idempotent: safe to rerun.
--   - RLS deny-by-default: service role manages (admin APIs use supabaseAdmin).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.start_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity. `slug` = 'default' maps to /start; any other slug maps to
  -- /start/{slug}. `route_path` is the resolved public path.
  slug TEXT NOT NULL,
  route_path TEXT NOT NULL,

  -- Presentation template family. v1 ships a single template ('start.v1').
  template_key TEXT NOT NULL DEFAULT 'start.v1',

  -- Parent offer (marketed package) this page presents. Entitlements/billing
  -- belong to the offer + its price options, NOT to this row.
  primary_offer_key TEXT NOT NULL REFERENCES public.offers(offer_key),

  -- Which approved price options to render, in order. Each MUST exist, be
  -- active, and belong to `primary_offer_key` (enforced in the app layer at
  -- publish time). NO Stripe price IDs are stored here.
  price_option_keys TEXT[] NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  seo_title TEXT,
  seo_description TEXT,

  -- StartTemplateConfig (presentation only): sections visibility, hero, heroRail,
  -- systemCards, trial, pricing copy, faq, finalCta. Validated by the app schema
  -- before write; unknown keys are stripped.
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Two rows max per slug (draft + published[/archived]); mirrors site_content.
  UNIQUE (slug, status)
);

COMMENT ON TABLE public.start_pages IS
  'Presentation config for the /start surface (Start Pages / Offer Landing Pages). Selects a parent offer + approved price options + section copy. No billing/entitlement/grant data lives here.';
COMMENT ON COLUMN public.start_pages.primary_offer_key IS
  'Parent offer (marketed package) the page presents. Billing truth stays in price_options; entitlements stay in offer_entitlements.';
COMMENT ON COLUMN public.start_pages.price_option_keys IS
  'Ordered approved price_options.price_option_key values to render. Validated (exists/active/belongs-to-offer) at publish. Never contains Stripe price IDs.';
COMMENT ON COLUMN public.start_pages.config_json IS
  'StartTemplateConfig presentation overrides only. Schema-validated; unknown keys stripped.';

-- Exactly one published page may own a route_path.
CREATE UNIQUE INDEX IF NOT EXISTS uq_start_pages_route_published
  ON public.start_pages (route_path)
  WHERE status = 'published';

-- Lookup: resolve a published page by slug quickly.
CREATE INDEX IF NOT EXISTS idx_start_pages_slug_status
  ON public.start_pages (slug, status);

-- updated_at trigger (set_updated_at() is defined by the base schema, same as
-- createPriceOptionsTable.sql / createStripeTables.sql).
DROP TRIGGER IF EXISTS trg_start_pages_updated_at ON public.start_pages;
CREATE TRIGGER trg_start_pages_updated_at
  BEFORE UPDATE ON public.start_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (deny-by-default)
ALTER TABLE public.start_pages ENABLE ROW LEVEL SECURITY;

-- Policy: service role full access (admin APIs use supabaseAdmin).
DROP POLICY IF EXISTS "Service role can manage start_pages" ON public.start_pages;
CREATE POLICY "Service role can manage start_pages"
  ON public.start_pages FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.start_pages TO service_role;


-- ============================================================================
-- Verification (optional)
-- ============================================================================
-- SELECT slug, route_path, status, primary_offer_key, price_option_keys
-- FROM public.start_pages
-- ORDER BY slug, status;
