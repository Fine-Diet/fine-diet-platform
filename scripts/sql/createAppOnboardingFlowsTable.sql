-- ============================================================================
-- App Onboarding Flows: public.app_onboarding_flows
-- Run this in Supabase Dashboard -> SQL Editor.
--
-- SOURCE-OF-TRUTH BOUNDARY (do not blur this):
--   - `people.metadata.onboarding_completed_at` = durable completion state
--     (read by the first-run middleware gate; written by the live onboarding
--      route through POST /api/journal/profile).
--   - `app_onboarding_flows` rows              = PRESENTATION/authoring for
--     the /app/onboarding surface ONLY: step titles, question prompts/hints,
--     option labels + ordering, required/visibility toggles. NO arbitrary
--     metadata keys, NO profile-target bindings beyond the code-owned
--     allowlist in lib/onboarding/onboardingFlowTypes.ts.
--
-- A flow row selects a `flow_key` (v1 ships a single 'default') and carries a
-- `config` JSONB blob validated by the app schema before write. Unknown keys
-- are stripped by zod; profile targets are NOT configurable here.
--
-- Draft / published model mirrors Start Pages (`start_pages`) and
-- Integrative Care (`site_content`):
--   - Two rows max per flow_key: one `draft`, one `published` (+ archived).
--   - Publish copies the draft row into the published row; live onboarding
--     stays stable while a draft is edited.
--   - Exactly one draft and one published row per flow_key.
--
-- Hard rules (mirror createStartPagesTable.sql / createPriceOptionsTable.sql):
--   - Additive only / idempotent: safe to rerun.
--   - RLS deny-by-default: service role manages (admin APIs use supabaseAdmin).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_onboarding_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity. v1 ships a single flow ('default') rendered at /app/onboarding.
  flow_key TEXT NOT NULL,

  -- Version of the config blob shape (bumped on breaking schema changes).
  version INT NOT NULL DEFAULT 1,

  -- Flow title shown in admin + as the flow heading.
  title TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  -- OnboardingFlowConfig (presentation only): step titles, per-question
  -- prompt/hint/required/visible, option label overrides + ordering. Validated
  -- by lib/onboarding/onboardingFlowValidation.ts before write; unknown keys
  -- stripped; profile targets are code-owned and never stored here.
  config JSONB NOT NULL DEFAULT '{}'::jsonb,

  published_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.app_onboarding_flows IS
  'Presentation/authoring config for the /app/onboarding surface. Step titles, question copy, option labels/ordering, required/visibility toggles. No arbitrary metadata writes; profile targets are code-owned.';
COMMENT ON COLUMN public.app_onboarding_flows.config IS
  'OnboardingFlowConfig presentation overlay. Schema-validated; unknown keys stripped; profile targets/onboarding blob paths are NOT configurable here.';
COMMENT ON COLUMN public.app_onboarding_flows.flow_key IS
  'v1 ships a single flow_key=default rendered at /app/onboarding.';

-- Exactly one draft row per flow_key.
CREATE UNIQUE INDEX IF NOT EXISTS app_onboarding_flows_one_draft
  ON public.app_onboarding_flows (flow_key)
  WHERE status = 'draft';

-- Exactly one published row per flow_key.
CREATE UNIQUE INDEX IF NOT EXISTS app_onboarding_flows_one_published
  ON public.app_onboarding_flows (flow_key)
  WHERE status = 'published';

-- Lookup: resolve a flow by key + status quickly.
CREATE INDEX IF NOT EXISTS idx_app_onboarding_flows_key_status
  ON public.app_onboarding_flows (flow_key, status);

-- updated_at trigger (set_updated_at() is defined by the base schema, same as
-- createStartPagesTable.sql / createPriceOptionsTable.sql).
DROP TRIGGER IF EXISTS trg_app_onboarding_flows_updated_at ON public.app_onboarding_flows;
CREATE TRIGGER trg_app_onboarding_flows_updated_at
  BEFORE UPDATE ON public.app_onboarding_flows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (deny-by-default)
ALTER TABLE public.app_onboarding_flows ENABLE ROW LEVEL SECURITY;

-- Policy: service role full access (admin APIs use supabaseAdmin).
DROP POLICY IF EXISTS "Service role can manage app_onboarding_flows" ON public.app_onboarding_flows;
CREATE POLICY "Service role can manage app_onboarding_flows"
  ON public.app_onboarding_flows FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_onboarding_flows TO service_role;


-- ============================================================================
-- Verification (optional)
-- ============================================================================
-- SELECT flow_key, status, version, title, published_at, updated_at
-- FROM public.app_onboarding_flows
-- ORDER BY flow_key, status;
