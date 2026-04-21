-- ============================================================================
-- Plans Phase 28 — Suggested source adoption workflow telemetry
--
-- Adds a lightweight audit table that records every user action on an
-- ingredient row's suggested / chosen source inside an import draft.
-- Packet 28 §4c calls this "Telemetry / event tracking":
--
--   - source applied
--   - source undone / cleared
--   - source rejected ("Not this source")
--
-- The table is intentionally small. It does NOT promote curated food
-- objects, bypass trust governance, or participate in the NDS
-- pipeline. Rows here are evidence for product diagnostics:
-- which suggestions users adopt, which ones they reject, how often
-- the Packet 28 guardrails block bad partials.
--
-- Forward-compatible shape notes:
--   * `action` is an enum string so new actions (e.g. 'restored')
--     can be added with a CHECK constraint bump.
--   * `eligibility` captures the classifier state at the moment of
--     the event so later analysis can tell apart "user adopted a
--     strong match" from "user adopted a review-required match".
--   * `token_jaccard` stores the guardrail similarity score so we
--     can tune the adoption floor against real usage.
--
-- Idempotency: this script is safe to re-run (IF NOT EXISTS + IF NOT
-- EXISTS on the index). The ON DELETE CASCADE on imported_meals_id
-- keeps audit rows tidy when a draft is deleted.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ingredient_source_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  imported_meal_id UUID NOT NULL REFERENCES public.imported_meals(id) ON DELETE CASCADE,
  ingredient_index INTEGER NOT NULL CHECK (ingredient_index >= 0),

  action TEXT NOT NULL CHECK (action IN ('applied', 'undone', 'rejected')),

  food_object_id UUID REFERENCES public.food_objects(id) ON DELETE SET NULL,

  ingredient_raw_text TEXT,
  ingredient_normalized_name TEXT,

  source_label TEXT,
  match_status TEXT CHECK (match_status IN ('matched', 'partial', 'guessed', 'none')),
  match_confidence TEXT CHECK (match_confidence IN ('high', 'medium', 'low')),

  eligibility TEXT CHECK (eligibility IN ('strong', 'review', 'ineligible', 'applied', 'rejected', 'none')),
  token_jaccard NUMERIC(5,4),

  reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ingredient_source_events IS
  'Plans Phase 28 — Per-row user actions on suggested food-object sources during import-draft manual repair. Lightweight product telemetry; NOT curated-truth promotion and NOT part of the NDS pipeline.';

COMMENT ON COLUMN public.ingredient_source_events.action IS
  'User action. applied = user adopted the source for this row. undone = user cleared a prior user_choice. rejected = user dismissed the suggestion via "Not this source".';

COMMENT ON COLUMN public.ingredient_source_events.eligibility IS
  'Row state from suggestedSourceEligibility at the moment of the event. Captured for tuning the guardrail floor.';

COMMENT ON COLUMN public.ingredient_source_events.token_jaccard IS
  'Packet 28 guardrail similarity — |ingredient_tokens ∩ source_tokens| / union. Null when either side had no usable tokens.';

CREATE INDEX IF NOT EXISTS idx_ingredient_source_events_person_created_at
  ON public.ingredient_source_events (person_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingredient_source_events_meal_idx
  ON public.ingredient_source_events (imported_meal_id, ingredient_index);

CREATE INDEX IF NOT EXISTS idx_ingredient_source_events_action_created_at
  ON public.ingredient_source_events (action, created_at DESC);
