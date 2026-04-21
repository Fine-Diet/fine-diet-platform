-- ============================================================================
-- Plans Phase 19 — Video recipe ingestion + transcript pipeline.
--
-- Adds one acquisition task type used to audit transcript/caption
-- fetches performed before normalization and import-draft creation:
--   - video_transcript_fetch
--
-- Widens `ai_runs.run_type` CHECK, extends the stub model's
-- task_types, and seeds an `ai_task_policies` row so admins can see
-- the task in the Packet 16 routing surface (deterministic-fallback
-- always available — when transcript acquisition fails the user
-- lands in manual_review with the URL preserved).
--
-- Additive; no existing rows touched.
-- ============================================================================

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
    'video_transcript_fetch'
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
  'video_transcript_fetch'
]::TEXT[]
WHERE provider_key = 'stub' AND model_key = 'deterministic';

INSERT INTO public.ai_task_policies
  (task_type, preferred_model_config_id, fallback_model_config_id, deterministic_fallback_available, notes)
SELECT
  'video_transcript_fetch',
  (SELECT id FROM public.ai_model_configs WHERE provider_key = 'stub' AND model_key = 'deterministic'),
  NULL,
  true,
  'Seeded by Plans Phase 19. Non-AI acquisition task; deterministic fallback = manual_review draft with preserved URL when transcript is unavailable or platform unsupported.'
ON CONFLICT (task_type) DO NOTHING;
