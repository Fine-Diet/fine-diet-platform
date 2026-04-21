-- ============================================================================
-- Plans Phase 18 — First external AI provider (OpenAI) seed.
--
-- Inserts one real provider/model config row:
--   provider_key = 'openai'
--   model_key    = 'gpt-4o-mini'
--   enabled      = FALSE   (explicit rollout — admin flips it on from /admin/ai)
--   task_types   = recipe_normalize, menu_normalize, structure_extract
--
-- We deliberately do NOT change existing task policies. The stub
-- remains the preferred model until an admin retargets
-- `preferred_model_config_id` via the Packet 16 admin UI. That keeps
-- the rollout guarded.
-- ============================================================================

INSERT INTO public.ai_model_configs
  (provider_key, model_key, display_name, enabled, tier, task_types,
   max_input_tokens, max_output_tokens, temperature, notes)
VALUES (
  'openai',
  'gpt-4o-mini',
  'OpenAI · GPT-4o mini',
  FALSE,
  'default',
  ARRAY['recipe_normalize','menu_normalize','structure_extract']::TEXT[],
  4000,
  2000,
  0.2,
  'Packet 18: first live provider. Disabled by default. Requires OPENAI_API_KEY in the server environment. Flip enabled=true and point preferred_model_config_id at this row from /admin/ai to activate.'
)
ON CONFLICT (provider_key, model_key) DO NOTHING;
