-- ============================================================================
-- Plans Phase 26 — Language-aware caption translation task.
--
-- Packet 26 §3d hardens short-form video acquisition so Shorts and
-- similar videos whose English captions are absent can still be
-- imported when a non-English caption track exists. The new AI task
-- type translates the acquired non-English text to English before
-- the existing normalization pipeline runs.
--
-- Adds a single task type used for that translation step:
--   - caption_translate
--
-- Routing semantics:
--   * openai:gpt-4o-mini is the preferred model (multilingual, cheap,
--     narrow task scope). It ships `enabled=FALSE` by default from
--     Packet 18, so flipping it on from /admin/ai is the single
--     action required to activate live translation.
--   * stub:deterministic stays the fallback. Its deterministic path
--     (provided by the caller's `deterministicFallback` in the video
--     transcript service) simply returns the original text unchanged
--     — a safe decline that lets the import continue with the
--     untranslated text rather than blocking.
--   * `deterministic_fallback_available = true`, so a disabled openai
--     config cleanly degrades instead of throwing.
--
-- Additive; no existing rows touched beyond the two targeted updates.
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
    'onscreen_text_extract',
    'caption_translate'
  ));

-- Stub / deterministic config accepts every task type so the runtime
-- can always route to it as an explicit fallback even when the
-- preferred model is disabled.
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
  'caption_translate'
]::TEXT[]
WHERE provider_key = 'stub' AND model_key = 'deterministic';

-- Extend the openai:gpt-4o-mini model config's task_types so the
-- admin UI reflects that this model handles translation too. The
-- config remains `enabled=FALSE` by default until an admin flips it.
UPDATE public.ai_model_configs
SET task_types = ARRAY[
  'recipe_normalize',
  'menu_normalize',
  'structure_extract',
  'onscreen_text_extract',
  'caption_translate'
]::TEXT[]
WHERE provider_key = 'openai' AND model_key = 'gpt-4o-mini';

INSERT INTO public.ai_task_policies
  (task_type, preferred_model_config_id, fallback_model_config_id, deterministic_fallback_available, notes)
SELECT
  'caption_translate',
  (SELECT id FROM public.ai_model_configs WHERE provider_key = 'openai' AND model_key = 'gpt-4o-mini'),
  (SELECT id FROM public.ai_model_configs WHERE provider_key = 'stub'   AND model_key = 'deterministic'),
  true,
  'Seeded by Plans Phase 26. Language-aware Shorts fallback. Preferred = openai:gpt-4o-mini (disabled by default from Packet 18); fallback = stub:deterministic (returns the original text unchanged so the import continues in the source language). Deterministic fallback always available.'
ON CONFLICT (task_type) DO NOTHING;
