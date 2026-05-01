-- ============================================================================
-- Social Recipe / Meal Evidence Importer v1
--
-- New-build persistence for social recipe evidence recovery. This is not a
-- continuation of the prior deterministic recipe importer. Evidence remains
-- separated from extraction output so claim-level provenance can be audited.
--
-- Supported product scope: YouTube, TikTok, Instagram, Facebook.
-- Vimeo is intentionally out of scope.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.social_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  source_url TEXT,
  platform TEXT NOT NULL DEFAULT 'unknown'
    CHECK (platform IN ('youtube', 'tiktok', 'instagram', 'facebook', 'threads', 'x', 'unknown')),
  content_type TEXT NOT NULL DEFAULT 'unknown_or_insufficient'
    CHECK (content_type IN (
      'single_recipe',
      'multi_recipe',
      'meal_plan',
      'what_i_eat_in_a_day',
      'grocery_haul',
      'restaurant_or_menu',
      'supplement_or_product',
      'not_food_related',
      'unknown_or_insufficient'
    )),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'evidence_acquired',
      'extracted',
      'draft_created',
      'manual_review',
      'failed'
    )),

  imported_meal_id UUID REFERENCES public.imported_meals(id) ON DELETE SET NULL,
  raw_request_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  review_summary_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  error_text TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_import_jobs_person_updated
  ON public.social_import_jobs (person_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_import_jobs_status
  ON public.social_import_jobs (status);

CREATE TABLE IF NOT EXISTS public.social_import_evidence_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.social_import_jobs(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  source_kind TEXT NOT NULL
    CHECK (source_kind IN (
      'metadata',
      'creator_caption',
      'transcript',
      'external_transcript',
      'user_assisted_text',
      'onscreen_text',
      'user_hint'
    )),
  source_label TEXT,
  platform TEXT NOT NULL DEFAULT 'unknown'
    CHECK (platform IN ('youtube', 'tiktok', 'instagram', 'facebook', 'threads', 'x', 'unknown')),

  raw_text TEXT,
  normalized_text TEXT,
  language TEXT,
  quality TEXT NOT NULL DEFAULT 'unavailable'
    CHECK (quality IN ('strong', 'partial', 'weak', 'unavailable')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_import_evidence_job
  ON public.social_import_evidence_sources (job_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_social_import_evidence_kind
  ON public.social_import_evidence_sources (source_kind);

CREATE TABLE IF NOT EXISTS public.social_import_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.social_import_jobs(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  extraction_version TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  output_json JSONB NOT NULL,
  warnings_json JSONB NOT NULL DEFAULT '[]'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_import_extractions_job_created
  ON public.social_import_extractions (job_id, created_at DESC);

COMMENT ON TABLE public.social_import_jobs IS
  'Social Recipe Evidence Importer v1: one import attempt. New-build lane, not the deterministic recipe parser.';
COMMENT ON TABLE public.social_import_evidence_sources IS
  'Social Recipe Evidence Importer v1: separated evidence sources used for claim-level provenance.';
COMMENT ON TABLE public.social_import_extractions IS
  'Social Recipe Evidence Importer v1: validated narrative extraction output and warnings.';

DROP TRIGGER IF EXISTS trg_social_import_jobs_updated_at ON public.social_import_jobs;
CREATE TRIGGER trg_social_import_jobs_updated_at
  BEFORE UPDATE ON public.social_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.social_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_import_evidence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_import_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_import_jobs_service_all ON public.social_import_jobs;
CREATE POLICY social_import_jobs_service_all
  ON public.social_import_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS social_import_evidence_sources_service_all ON public.social_import_evidence_sources;
CREATE POLICY social_import_evidence_sources_service_all
  ON public.social_import_evidence_sources FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS social_import_extractions_service_all ON public.social_import_extractions;
CREATE POLICY social_import_extractions_service_all
  ON public.social_import_extractions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- AI runtime task registration.
ALTER TABLE public.ai_runs
  DROP CONSTRAINT IF EXISTS ai_runs_run_type_check;

ALTER TABLE public.ai_runs
  ADD CONSTRAINT ai_runs_run_type_check CHECK (run_type IN (
    'plan_generate',
    'plan_regenerate',
    'substitution',
    'restaurant_rec',
    'menu_parse',
    'recipe_parse',
    'grocery_list',
    'nds_optimize',
    'recipe_normalize',
    'menu_normalize',
    'structure_extract',
    'video_transcript_fetch',
    'onscreen_text_extract',
    'caption_translate',
    'video_transcript_external',
    'social_video_recipe_extract'
  ));

UPDATE public.ai_model_configs
SET task_types = ARRAY[
  'plan_generate',
  'plan_regenerate',
  'substitution',
  'restaurant_rec',
  'menu_parse',
  'recipe_parse',
  'grocery_list',
  'nds_optimize',
  'recipe_normalize',
  'menu_normalize',
  'structure_extract',
  'video_transcript_fetch',
  'onscreen_text_extract',
  'caption_translate',
  'video_transcript_external',
  'social_video_recipe_extract'
]::TEXT[]
WHERE provider_key = 'stub' AND model_key = 'deterministic';

INSERT INTO public.ai_task_policies
  (task_type, preferred_model_config_id, fallback_model_config_id, deterministic_fallback_available, notes)
SELECT
  'social_video_recipe_extract',
  (SELECT id FROM public.ai_model_configs WHERE provider_key = 'openai' AND model_key = 'gpt-4o-mini'),
  (SELECT id FROM public.ai_model_configs WHERE provider_key = 'stub' AND model_key = 'deterministic'),
  true,
  'Social Recipe Evidence Importer v1. Narrative-aware evidence extraction for YouTube, TikTok, Instagram, and Facebook. Deterministic fallback returns unknown_or_insufficient so unsupported/no-provider states remain honest.'
ON CONFLICT (task_type) DO NOTHING;

UPDATE public.ai_model_configs
SET task_types = array_append(task_types, 'social_video_recipe_extract')
WHERE provider_key = 'openai'
  AND NOT ('social_video_recipe_extract' = ANY(task_types));
