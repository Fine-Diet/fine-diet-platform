-- ============================================================================
-- Plans Phase 17 (First production AI task activation)
--
-- Adds three new task types for AI-assisted normalization:
--   - recipe_normalize
--   - menu_normalize
--   - structure_extract
--
-- Widens the ai_runs.run_type CHECK constraint, extends the stub
-- ai_model_config's task_types to cover the new tasks, and seeds
-- ai_task_policies rows so the Packet 16 admin UI surfaces them with
-- deterministic-fallback marked available.
--
-- Additive. Does not alter existing rows.
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
    'structure_extract'
  ));

-- Extend the seeded stub model's task_types to cover normalization so
-- its enable/disable state and admin visibility stay consistent.
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
  'structure_extract'
]::TEXT[]
WHERE provider_key = 'stub' AND model_key = 'deterministic';

INSERT INTO public.ai_task_policies
  (task_type, preferred_model_config_id, fallback_model_config_id, deterministic_fallback_available, notes)
SELECT
  t.task_type,
  (SELECT id FROM public.ai_model_configs WHERE provider_key = 'stub' AND model_key = 'deterministic'),
  NULL,
  true,
  'Seeded by Plans Phase 17. Normalization task; deterministic fallback keeps imports working when AI is unavailable.'
FROM (
  VALUES ('recipe_normalize'), ('menu_normalize'), ('structure_extract')
) AS t(task_type)
ON CONFLICT (task_type) DO NOTHING;
