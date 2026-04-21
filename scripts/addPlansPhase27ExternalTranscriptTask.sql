-- ============================================================================
-- Plans Phase 27 — External transcript provider fallback task.
--
-- Packet 27 addresses the newly confirmed acquisition ceiling for a
-- class of YouTube Shorts where captions/timedtext are unavailable
-- or empty, the description is empty, and the title-only fallback
-- is the best first-party signal. This migration wires a governed
-- third-party transcript provider (Supadata) behind the AI runtime
-- so blocked Shorts can recover real recipe text without resorting
-- to brittle PoToken/BotGuard scraping.
--
-- Adds a single task type:
--   - video_transcript_external
--
-- Routing semantics:
--   * supadata:default is the preferred model. It ships
--     `enabled=FALSE` by default — identical rollout posture to the
--     Packet 18 OpenAI activation — so flipping it on from /admin/ai
--     is the single operator action required to activate live
--     external recovery.
--   * stub:deterministic stays the fallback. Its deterministic path
--     (provided by the caller's `deterministicFallback` in the
--     video transcript service) returns a decline wrapper so the
--     acquisition stays on the existing first-party outcome rather
--     than producing noise.
--   * `deterministic_fallback_available = true`, so a disabled
--     supadata config cleanly degrades instead of throwing.
--
-- Additive; no existing rows touched beyond the targeted updates.
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
    'caption_translate',
    'video_transcript_external'
  ));

-- Stub / deterministic config accepts every task type so the runtime
-- can always route to it as an explicit fallback even when the
-- preferred provider is disabled.
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
  'video_transcript_external'
]::TEXT[]
WHERE provider_key = 'stub' AND model_key = 'deterministic';

-- Seed the Supadata model config. Supadata is a governed YouTube
-- transcript API (supadata.ai) reached via REST with an API key.
-- Disabled by default; operator flips `enabled=TRUE` at /admin/ai
-- once SUPADATA_API_KEY is provisioned in the server environment.
INSERT INTO public.ai_model_configs
  (provider_key, model_key, display_name, enabled, tier, task_types,
   max_input_tokens, max_output_tokens, temperature, notes)
VALUES (
  'supadata',
  'default',
  'Supadata · YouTube transcript (external)',
  FALSE,
  'default',
  ARRAY['video_transcript_external']::TEXT[],
  NULL,
  NULL,
  NULL,
  'Seeded by Plans Phase 27. Governed external transcript provider for blocked YouTube Shorts. REST + x-api-key auth (SUPADATA_API_KEY env var). Enabled=false by default; admin flips it on once the key is provisioned. No token caps apply — provider returns raw transcript text.'
)
ON CONFLICT (provider_key, model_key) DO NOTHING;

-- Task policy: supadata preferred, stub fallback, deterministic
-- decline available. Matches the Packet 26 `caption_translate`
-- shape so admins see a consistent pattern in the /admin/ai routing
-- view.
INSERT INTO public.ai_task_policies
  (task_type, preferred_model_config_id, fallback_model_config_id, deterministic_fallback_available, notes)
SELECT
  'video_transcript_external',
  (SELECT id FROM public.ai_model_configs WHERE provider_key = 'supadata' AND model_key = 'default'),
  (SELECT id FROM public.ai_model_configs WHERE provider_key = 'stub'     AND model_key = 'deterministic'),
  true,
  'Seeded by Plans Phase 27. External transcript provider fallback for blocked YouTube Shorts. Preferred = supadata:default (disabled by default until SUPADATA_API_KEY is provisioned and an admin enables it); fallback = stub:deterministic (returns a decline wrapper so acquisition stays on the first-party outcome). Deterministic fallback always available so no-provider rollouts degrade cleanly.'
ON CONFLICT (task_type) DO NOTHING;
