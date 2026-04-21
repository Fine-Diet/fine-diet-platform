-- ============================================================================
-- Plans Phase 22 — On-screen instruction extraction assist.
--
-- Adds one secondary-acquisition task type used to audit on-screen
-- visible text extraction attempts performed during video recipe
-- imports:
--   - onscreen_text_extract
--
-- Preferred acquisition order (Packet 22 §3a):
--   1. Transcript / captions (Packet 19/20)
--   2. Description / caption text (Packet 19/20 oEmbed fallback)
--   3. On-screen visible instruction text (THIS PACKET)
--   4. User-assisted caption (Packet 21)
--
-- Deterministic fallback is always available: if on-screen extraction
-- is unavailable or low-quality, the pipeline simply keeps whatever
-- transcript/caption/user-assisted text was already acquired and (if
-- still empty) degrades to manual_review with the URL preserved.
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
    'video_transcript_fetch',
    'onscreen_text_extract'
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
  'onscreen_text_extract'
]::TEXT[]
WHERE provider_key = 'stub' AND model_key = 'deterministic';

INSERT INTO public.ai_task_policies
  (task_type, preferred_model_config_id, fallback_model_config_id, deterministic_fallback_available, notes)
SELECT
  'onscreen_text_extract',
  (SELECT id FROM public.ai_model_configs WHERE provider_key = 'stub' AND model_key = 'deterministic'),
  NULL,
  true,
  'Seeded by Plans Phase 22. Secondary acquisition layer — on-screen visible text assist. V1 production source is user-supplied on-screen text; the extractor registry allows future OCR/vision providers to register additively. Non-authoritative: on-screen text can help fill gaps in steps/titles but never creates trusted food objects.'
ON CONFLICT (task_type) DO NOTHING;
