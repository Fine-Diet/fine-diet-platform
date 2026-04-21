-- ============================================================================
-- Plans Phase 23 — Automated on-screen text extraction provider.
--
-- Wires the first real OCR/vision-backed extractor into the Packet 22
-- extractor registry. The adapter reuses the OpenAI `gpt-4o-mini`
-- model config seeded in Packet 18 (multimodal-capable, narrow task
-- scope, SDK-free fetch adapter) rather than creating a duplicate
-- row, so admins get a single enable/disable switch for this provider
-- across all tasks it handles.
--
-- Semantics:
--   * Expands the openai:gpt-4o-mini model config's `task_types` to
--     include `onscreen_text_extract`.
--   * Retargets the `onscreen_text_extract` task policy to prefer
--     the openai config, keeping the stub config as the explicit
--     fallback (so if the admin disables openai, the flow still
--     lands cleanly on the deterministic path that always allows
--     manual review).
--
-- Rollout posture (per Packet 23 §4a, §4c):
--   The openai config ships with `enabled=FALSE` by default from
--   Packet 18. Flipping it on from /admin/ai is the single action
--   required to activate automated vision-backed on-screen extraction.
--   While it remains disabled the Packet 22 user-supplied path is
--   unchanged and noopOnscreenExtractor continues to decline.
--
-- Additive; no existing rows touched beyond the two targeted updates.
-- ============================================================================

UPDATE public.ai_model_configs
SET task_types = ARRAY[
  'recipe_normalize',
  'menu_normalize',
  'structure_extract',
  'onscreen_text_extract'
]::TEXT[]
WHERE provider_key = 'openai' AND model_key = 'gpt-4o-mini';

UPDATE public.ai_task_policies
SET preferred_model_config_id = (
      SELECT id FROM public.ai_model_configs
      WHERE provider_key = 'openai' AND model_key = 'gpt-4o-mini'
    ),
    fallback_model_config_id = (
      SELECT id FROM public.ai_model_configs
      WHERE provider_key = 'stub' AND model_key = 'deterministic'
    ),
    notes = 'Plans Phase 22 + 23. Secondary acquisition layer — on-screen visible text assist. Preferred = openai:gpt-4o-mini (vision-backed OCR/description, disabled by default from Packet 18); fallback = stub:deterministic (declines so the route degrades to user-assisted / manual_review). Deterministic fallback always available. Never authoritative: on-screen text cannot create trusted food objects by itself.'
WHERE task_type = 'onscreen_text_extract';
