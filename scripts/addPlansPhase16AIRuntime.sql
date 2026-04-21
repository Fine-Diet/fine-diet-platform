-- ============================================================================
-- Plans Phase 16 (AI provider and model selection layer)
--
-- Establishes the governed AI runtime substrate:
--   1. ai_model_configs         — structured provider/model entries with
--                                 tier, enable/disable, and task affinity.
--   2. ai_task_policies         — per-task-type routing (preferred +
--                                 fallback model config) + deterministic
--                                 fallback flag.
--   3. ai_runs (extended)       — fallback_used + model_config_id so every
--                                 execution audit row records exactly
--                                 which config it resolved through and
--                                 whether the fallback chain was engaged.
--
-- Seeds a single 'stub' provider (matching the existing deterministic
-- gateway) and one policy per existing run_type so the runtime layer
-- is immediately usable without forcing any real-provider integration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ai_model_configs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_model_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  provider_key TEXT NOT NULL,            -- e.g. 'stub', 'openai', 'anthropic', 'google'
  model_key TEXT NOT NULL,               -- provider-specific id, e.g. 'gpt-4o-mini' / 'deterministic'
  display_name TEXT,                     -- admin-friendly label

  enabled BOOLEAN NOT NULL DEFAULT true,

  tier TEXT NOT NULL DEFAULT 'default'
    CHECK (tier IN ('default', 'quality', 'fallback')),

  -- Task affinity. Empty array = eligible for any task this policy
  -- assigns it to. Populated arrays restrict routing.
  task_types TEXT[] NOT NULL DEFAULT '{}',

  max_input_tokens INTEGER,
  max_output_tokens INTEGER,
  temperature NUMERIC(3,2),              -- 0.00 – 2.00, nullable

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_model_configs_provider_model
  ON public.ai_model_configs (provider_key, model_key);

CREATE INDEX IF NOT EXISTS idx_ai_model_configs_enabled_tier
  ON public.ai_model_configs (enabled, tier);

COMMENT ON TABLE public.ai_model_configs IS
  'Phase 16: structured AI provider/model entries. Disabled rows are not routable.';

-- ---------------------------------------------------------------------------
-- 2. ai_task_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_task_policies (
  task_type TEXT PRIMARY KEY,            -- mirrors ai_runs.run_type values

  preferred_model_config_id UUID
    REFERENCES public.ai_model_configs(id) ON DELETE SET NULL,
  fallback_model_config_id UUID
    REFERENCES public.ai_model_configs(id) ON DELETE SET NULL,

  -- If true, the task has a deterministic/trusted fallback that must be
  -- invoked when both preferred and fallback model configs are
  -- unavailable (disabled / erroring).
  deterministic_fallback_available BOOLEAN NOT NULL DEFAULT true,

  -- Reserved for future entitlement gating (Plans Phase 4 integration).
  required_entitlement TEXT,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_task_policies IS
  'Phase 16: task-type -> model/provider routing policy.';

-- ---------------------------------------------------------------------------
-- 3. ai_runs extensions
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_runs
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.ai_runs
  ADD COLUMN IF NOT EXISTS model_config_id UUID
    REFERENCES public.ai_model_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_runs_model_config
  ON public.ai_runs (model_config_id);

COMMENT ON COLUMN public.ai_runs.fallback_used IS
  'Phase 16: true when the runtime resolved to the fallback model/config or to the deterministic path.';
COMMENT ON COLUMN public.ai_runs.model_config_id IS
  'Phase 16: the ai_model_configs row the runtime actually executed against (null for deterministic-only).';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_ai_model_configs_updated_at ON public.ai_model_configs;
CREATE TRIGGER trg_ai_model_configs_updated_at
  BEFORE UPDATE ON public.ai_model_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ai_task_policies_updated_at ON public.ai_task_policies;
CREATE TRIGGER trg_ai_task_policies_updated_at
  BEFORE UPDATE ON public.ai_task_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — service_role only for writes; everyone can SELECT (these are
-- operational config, not PII). Safer default here is admin-only; we
-- keep SELECT open-to-authenticated so future admin UI reads don't
-- require elevated creds if the repo shifts patterns. Writes must go
-- through service_role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_model_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_task_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_model_configs_service_all ON public.ai_model_configs;
CREATE POLICY ai_model_configs_service_all
  ON public.ai_model_configs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS ai_task_policies_service_all ON public.ai_task_policies;
CREATE POLICY ai_task_policies_service_all
  ON public.ai_task_policies FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Seed — one stub provider/model + one policy per existing run_type.
-- Idempotent via unique indexes + ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------------
INSERT INTO public.ai_model_configs
  (provider_key, model_key, display_name, enabled, tier, task_types, notes)
VALUES
  ('stub', 'deterministic', 'Stub · Deterministic', true, 'default',
   ARRAY['plan_generate','plan_regenerate','substitution','restaurant_rec','menu_parse','recipe_parse','grocery_list','nds_optimize']::TEXT[],
   'Default provider-free deterministic runtime. Matches the existing PlansAIGateway stub behavior.')
ON CONFLICT (provider_key, model_key) DO NOTHING;

INSERT INTO public.ai_task_policies
  (task_type, preferred_model_config_id, fallback_model_config_id, deterministic_fallback_available, notes)
SELECT
  t.task_type,
  (SELECT id FROM public.ai_model_configs WHERE provider_key = 'stub' AND model_key = 'deterministic'),
  NULL,
  true,
  'Seeded by Plans Phase 16. Preferred = stub until a real provider is wired.'
FROM (
  VALUES
    ('plan_generate'), ('plan_regenerate'), ('substitution'),
    ('restaurant_rec'), ('menu_parse'), ('recipe_parse'),
    ('grocery_list'), ('nds_optimize')
) AS t(task_type)
ON CONFLICT (task_type) DO NOTHING;
