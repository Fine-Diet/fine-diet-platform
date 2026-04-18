-- ============================================================================
-- Plans Phase 1: Contract + Schema (NDS-first)
--
-- Additive migration that creates the forward-looking "Plans" lane:
--   plans, plan_days, plan_slots, planned_meals, planned_substitutions,
--   planned_eat_out_events, generated_grocery_lists, grocery_items,
--   imported_meals, imported_menus, ai_runs, program_plan_guidance.
--
-- Design rules:
--   - Additive only. Does not modify existing tables (journal_entries,
--     daily_nds, people, offers, subscriptions, food_objects, etc.).
--   - NDS is a first-class signal. Every meal-bearing row mirrors the
--     journal_entries meal-derived shape (protein_score_10, is_main_meal,
--     psq_multiplier, meal_derived_data) and stamps nds_version +
--     classifier_version. Daily projections use flat subscore columns
--     that mirror daily_nds.
--   - nds_confidence on meal-bearing rows is a Plans-only concept and is
--     deliberately distinct from food trust (FoodResultSource).
--   - RLS policies mirror journal_entries: service-role writes, auth.uid()
--     gated client-side reads via people.auth_user_id.
--
-- Run this migration in Supabase SQL Editor:
--   1. Copy entire script
--   2. Run in Supabase Dashboard → SQL Editor
-- ============================================================================

-- ============================================================================
-- Table: plans
-- One row per user-authored or AI-generated plan. A plan spans one or more
-- days and is the parent of plan_days, plan_slots, planned_meals, etc.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  title TEXT,
  -- Shape of the plan: single day, full week, or a custom multi-day span.
  plan_shape TEXT NOT NULL DEFAULT 'week'
    CHECK (plan_shape IN ('day', 'week', 'multi_day')),
  -- Origin: how the plan was produced.
  source TEXT NOT NULL DEFAULT 'user_manual'
    CHECK (source IN ('ai_generated', 'user_manual', 'program_template', 'hybrid')),
  -- Lifecycle.
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),

  start_date DATE NOT NULL,
  end_date DATE,

  -- Optional link back to a program run (e.g. Gut Check). Plans may be
  -- derived from program guidance without being locked to a program run.
  program_slug TEXT,
  program_run_id UUID,

  -- Snapshot of the user's profile, body state, preferences, and goals at
  -- the moment this plan was generated. Used for reproducibility and for
  -- explaining rationale after the fact.
  input_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Versions of the NDS model this plan was constructed against. Required
  -- because plan construction consumes NDS signals end-to-end.
  nds_version TEXT NOT NULL,
  classifier_version TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_person_start
  ON public.plans (person_id, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_plans_person_status
  ON public.plans (person_id, status);

COMMENT ON TABLE public.plans IS
  'Forward-looking meal plans. Parent of plan_days, plan_slots, planned_meals. NDS-versioned.';

-- ============================================================================
-- Table: plan_days
-- One row per (plan, date). Stores the projected daily NDS (0-100) and its
-- 7 subscores as flat columns mirroring daily_nds, so plan projections and
-- journal reality use the same shape.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.plan_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  date_local DATE NOT NULL,

  -- Projected daily NDS (0-100). Nullable during drafting before any meals
  -- are planned. Flat subscores mirror daily_nds columns.
  projected_nds_100 NUMERIC(5,2)
    CHECK (projected_nds_100 IS NULL OR (projected_nds_100 >= 0 AND projected_nds_100 <= 100)),
  projected_wfr_10 NUMERIC(4,2)
    CHECK (projected_wfr_10 IS NULL OR (projected_wfr_10 >= 0 AND projected_wfr_10 <= 10)),
  projected_ps_10 NUMERIC(4,2)
    CHECK (projected_ps_10 IS NULL OR (projected_ps_10 >= 0 AND projected_ps_10 <= 10)),
  projected_pnd_10 NUMERIC(4,2)
    CHECK (projected_pnd_10 IS NULL OR (projected_pnd_10 >= 0 AND projected_pnd_10 <= 10)),
  projected_fp_10 NUMERIC(4,2)
    CHECK (projected_fp_10 IS NULL OR (projected_fp_10 >= 0 AND projected_fp_10 <= 10)),
  projected_as_10 NUMERIC(4,2)
    CHECK (projected_as_10 IS NULL OR (projected_as_10 >= 0 AND projected_as_10 <= 10)),
  projected_mnc_10 NUMERIC(4,2)
    CHECK (projected_mnc_10 IS NULL OR (projected_mnc_10 >= 0 AND projected_mnc_10 <= 10)),
  projected_ob_10 NUMERIC(4,2)
    CHECK (projected_ob_10 IS NULL OR (projected_ob_10 >= 0 AND projected_ob_10 <= 10)),

  -- Plans-only confidence in the projection. Distinct from food trust
  -- (FoodResultSource) and from any per-food confidence signal. High when
  -- inputs are fully resolved to food_objects, low when many inputs are
  -- AI-estimated or free-text.
  projection_confidence TEXT
    CHECK (projection_confidence IS NULL OR projection_confidence IN ('high', 'medium', 'low')),

  -- Optional breakdown used to explain rationale in the UI.
  projection_debug_json JSONB,

  notes TEXT,

  nds_version TEXT NOT NULL,
  classifier_version TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_days_plan_date
  ON public.plan_days (plan_id, date_local);

CREATE INDEX IF NOT EXISTS idx_plan_days_person_date
  ON public.plan_days (person_id, date_local);

COMMENT ON TABLE public.plan_days IS
  'One row per (plan, date). Holds projected daily NDS (0-100) and 7 subscores as flat columns mirroring daily_nds.';

-- ============================================================================
-- Table: plan_slots
-- Ordered slots within a plan_day (morning / midday / evening, or arbitrary
-- ordinal slots for custom plan shapes). Structural only — no NDS fields.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.plan_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_day_id UUID NOT NULL REFERENCES public.plan_days(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  slot_block TEXT
    CHECK (slot_block IS NULL OR slot_block IN ('morning', 'midday', 'evening')),
  slot_ordinal INTEGER NOT NULL DEFAULT 0,
  slot_label TEXT,
  target_time TIME,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_slots_day_ordinal
  ON public.plan_slots (plan_day_id, slot_ordinal);

CREATE INDEX IF NOT EXISTS idx_plan_slots_person
  ON public.plan_slots (person_id);

COMMENT ON TABLE public.plan_slots IS
  'Ordered meal slots within a plan_day. Structural only.';

-- ============================================================================
-- Table: planned_meals
-- A meal placed into a plan_slot (or unscheduled within a plan_day).
-- Mirrors the journal_entries meal-derived shape so plan projections and
-- journaled reality share a single NDS contract.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.planned_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  plan_day_id UUID NOT NULL REFERENCES public.plan_days(id) ON DELETE CASCADE,
  plan_slot_id UUID REFERENCES public.plan_slots(id) ON DELETE SET NULL,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  name TEXT,
  meal_type TEXT NOT NULL DEFAULT 'other'
    CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'other')),

  -- Items array + totals, shaped like journal_entries.payload for intake
  -- entries. Each item may reference a food_object_id or be AI-estimated.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- NDS meal-derived shape (mirrors journal_entries).
  protein_score_10 NUMERIC(4,2)
    CHECK (protein_score_10 IS NULL OR (protein_score_10 >= 0 AND protein_score_10 <= 10)),
  is_main_meal BOOLEAN NOT NULL DEFAULT FALSE,
  psq_multiplier NUMERIC(3,2)
    CHECK (psq_multiplier IS NULL OR (psq_multiplier >= 0 AND psq_multiplier <= 1)),
  meal_derived_data JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Plans-only confidence in the NDS projection for this meal.
  nds_confidence TEXT NOT NULL DEFAULT 'low'
    CHECK (nds_confidence IN ('high', 'medium', 'low')),

  -- Origin metadata (optional).
  source_template_id UUID REFERENCES public.journal_meal_templates(id) ON DELETE SET NULL,
  source_imported_meal_id UUID,

  nds_version TEXT NOT NULL,
  classifier_version TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planned_meals_plan_day
  ON public.planned_meals (plan_day_id);

CREATE INDEX IF NOT EXISTS idx_planned_meals_slot
  ON public.planned_meals (plan_slot_id);

CREATE INDEX IF NOT EXISTS idx_planned_meals_person_plan
  ON public.planned_meals (person_id, plan_id);

COMMENT ON TABLE public.planned_meals IS
  'Planned meals. Meal-derived NDS fields mirror journal_entries exactly so projections and reality share one contract.';

-- ============================================================================
-- Table: planned_substitutions
-- Proposed swaps for a planned_meal. nds_delta_json is required and
-- captures the before/after NDS impact of the proposed swap so the UI can
-- show rationale without recomputing anything client-side.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.planned_substitutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_meal_id UUID NOT NULL REFERENCES public.planned_meals(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  proposed_by TEXT NOT NULL DEFAULT 'ai'
    CHECK (proposed_by IN ('ai', 'user')),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'accepted', 'rejected', 'superseded')),

  -- The full replacement meal payload (items + totals), in the same shape
  -- as planned_meals.payload.
  replacement_payload_json JSONB NOT NULL,

  rationale_md TEXT,

  -- Required: explicit before/after NDS impact.
  -- Canonical shape:
  --   {
  --     "before": { "protein_score_10": ..., "is_main_meal": ...,
  --                 "psq_multiplier": ..., "meal_derived_data": {...},
  --                 "nds_confidence": "high|medium|low" },
  --     "after":  { same shape },
  --     "delta_nds_100_estimate": number | null,
  --     "delta_subscores_10": { "wfr_10": ..., "ps_10": ..., ... }
  --   }
  nds_delta_json JSONB NOT NULL,

  nds_version TEXT NOT NULL,
  classifier_version TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planned_substitutions_meal
  ON public.planned_substitutions (planned_meal_id);

CREATE INDEX IF NOT EXISTS idx_planned_substitutions_person
  ON public.planned_substitutions (person_id, status);

COMMENT ON TABLE public.planned_substitutions IS
  'Proposed swaps for planned_meals. nds_delta_json captures before/after NDS impact explicitly.';

-- ============================================================================
-- Table: planned_eat_out_events
-- Restaurant / friend-dinner / travel / work events on a plan_day. The
-- recommendation_payload_json carries the AI recommendation with NDS
-- snapshots for recommended and avoided items.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.planned_eat_out_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_day_id UUID NOT NULL REFERENCES public.plan_days(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  venue_name TEXT NOT NULL,
  venue_type TEXT NOT NULL DEFAULT 'restaurant'
    CHECK (venue_type IN ('restaurant', 'friends', 'work', 'travel', 'other')),

  scheduled_at TIMESTAMPTZ,
  menu_url TEXT,
  imported_menu_id UUID,

  -- Canonical recommendation shape includes NDS snapshots per item:
  --   {
  --     "recommended_items": [{ "item_name": "...",
  --                             "projected_meal_derived_data": { protein_score_10, is_main_meal,
  --                                                              psq_multiplier, meal_calories,
  --                                                              meal_protein_g },
  --                             "nds_confidence": "high|medium|low",
  --                             "rationale_md": "..." }],
  --     "avoid_items": [...],
  --     "overall_rationale_md": "..."
  --   }
  recommendation_payload_json JSONB,

  nds_version TEXT NOT NULL,
  classifier_version TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planned_eat_out_day
  ON public.planned_eat_out_events (plan_day_id);

CREATE INDEX IF NOT EXISTS idx_planned_eat_out_person
  ON public.planned_eat_out_events (person_id, scheduled_at);

COMMENT ON TABLE public.planned_eat_out_events IS
  'Restaurant / eat-out events on a plan_day. Recommendation payload carries per-item NDS snapshots.';

-- ============================================================================
-- Table: generated_grocery_lists
-- A grocery list rolled up from one or more planned_meals over a date range.
-- Structural; no NDS fields.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.generated_grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.plans(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  title TEXT,
  date_range_start DATE,
  date_range_end DATE,

  mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (mode IN ('manual', 'print', 'instacart', 'other')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'exported')),

  -- Optional export metadata (e.g. Instacart cart URL, print layout, etc.)
  export_payload_json JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grocery_lists_person_updated
  ON public.generated_grocery_lists (person_id, updated_at DESC);

COMMENT ON TABLE public.generated_grocery_lists IS
  'Grocery lists rolled up from planned_meals. Structural only.';

-- ============================================================================
-- Table: grocery_items
-- One row per item on a grocery list.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_list_id UUID NOT NULL REFERENCES public.generated_grocery_lists(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  aisle_category TEXT,

  food_object_id UUID REFERENCES public.food_objects(id) ON DELETE SET NULL,

  -- Planned meals this item was rolled up from (for traceability).
  source_planned_meal_ids UUID[] NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'have', 'bought', 'skipped')),

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grocery_items_list
  ON public.grocery_items (grocery_list_id);

CREATE INDEX IF NOT EXISTS idx_grocery_items_person
  ON public.grocery_items (person_id);

COMMENT ON TABLE public.grocery_items IS
  'Items on a grocery list. Links back to source planned_meals for traceability.';

-- ============================================================================
-- Table: imported_meals
-- Meals imported from a URL, video, manual entry, or photo. Mirrors the
-- planned_meals / journal_entries meal-derived shape so imports can be
-- dropped directly onto a plan slot without re-computation drift.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.imported_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('url', 'video', 'manual', 'photo', 'chat')),
  source_url TEXT,

  -- Items + totals, same shape as planned_meals.payload.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- NDS meal-derived shape (required on every import).
  protein_score_10 NUMERIC(4,2)
    CHECK (protein_score_10 IS NULL OR (protein_score_10 >= 0 AND protein_score_10 <= 10)),
  is_main_meal BOOLEAN NOT NULL DEFAULT FALSE,
  psq_multiplier NUMERIC(3,2)
    CHECK (psq_multiplier IS NULL OR (psq_multiplier >= 0 AND psq_multiplier <= 1)),
  meal_derived_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  nds_confidence TEXT NOT NULL DEFAULT 'low'
    CHECK (nds_confidence IN ('high', 'medium', 'low')),

  nds_version TEXT NOT NULL,
  classifier_version TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imported_meals_person_updated
  ON public.imported_meals (person_id, updated_at DESC);

COMMENT ON TABLE public.imported_meals IS
  'Meals imported from URLs, videos, photos, chat, or manual entry. Mirrors planned_meals NDS shape so imports can drop into plans without re-computation drift.';

-- ============================================================================
-- Table: imported_menus
-- Raw + parsed restaurant menus used by the eat-out recommender. Structural
-- only — the NDS-bearing recommendation lives on planned_eat_out_events.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.imported_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  restaurant_name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'url'
    CHECK (source_type IN ('url', 'manual_paste', 'photo', 'other')),
  source_url TEXT,

  raw_payload_json JSONB,
  parsed_payload_json JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imported_menus_person_updated
  ON public.imported_menus (person_id, updated_at DESC);

COMMENT ON TABLE public.imported_menus IS
  'Imported restaurant menus. Raw + parsed payloads feed planned_eat_out_events recommendations.';

-- ============================================================================
-- Table: ai_runs
-- Provider-agnostic audit trail for every AI call in the Plans lane. Stamps
-- the NDS/classifier versions used at call time because request/response
-- payloads routinely carry NDS structures.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,

  run_type TEXT NOT NULL
    CHECK (run_type IN (
      'plan_generate',
      'plan_regenerate',
      'substitution',
      'restaurant_rec',
      'menu_parse',
      'recipe_parse',
      'grocery_list',
      'nds_optimize'
    )),

  provider TEXT NOT NULL DEFAULT 'stub',
  model TEXT,

  request_payload_json JSONB NOT NULL,
  response_payload_json JSONB,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  error_text TEXT,
  latency_ms INTEGER,
  cost_cents INTEGER,

  nds_version TEXT NOT NULL,
  classifier_version TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_person_created
  ON public.ai_runs (person_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_runs_plan
  ON public.ai_runs (plan_id);

COMMENT ON TABLE public.ai_runs IS
  'Provider-agnostic audit trail for Plans-lane AI calls. Stamps NDS/classifier versions used at call time.';

-- ============================================================================
-- Table: program_plan_guidance
-- Structured directives from a program (e.g. Gut Check) that should bias
-- Plans generation (emphasize/avoid foods, macro targets, NDS targets).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.program_plan_guidance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  program_slug TEXT NOT NULL,
  program_run_id UUID,

  -- Canonical shape:
  --   {
  --     "emphasize": ["...food tags or food_object_ids..."],
  --     "avoid": ["..."],
  --     "macro_targets": { "protein_g": ..., "carbs_g": ..., "fat_g": ... },
  --     "nds_targets": { "nds_score_100_min": ..., "subscore_floors_10": { "wfr_10": ..., ... } },
  --     "notes_md": "..."
  --   }
  guidance_payload_json JSONB NOT NULL,

  active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE,
  effective_until DATE,

  nds_version TEXT NOT NULL,
  classifier_version TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_program_guidance_person_active
  ON public.program_plan_guidance (person_id, active);

CREATE INDEX IF NOT EXISTS idx_program_guidance_program
  ON public.program_plan_guidance (program_slug);

COMMENT ON TABLE public.program_plan_guidance IS
  'Structured program directives that bias Plans generation. Carries NDS targets.';

-- ============================================================================
-- Row Level Security
-- Policies mirror journal_entries: service-role writes bypass RLS; direct
-- client access is gated on people.auth_user_id = auth.uid().
-- ============================================================================

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_eat_out_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imported_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imported_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_plan_guidance ENABLE ROW LEVEL SECURITY;

-- Helper macro: person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
-- We expand this inline per policy for clarity and parity with journal_entries.

-- plans
CREATE POLICY "Users can read own plans" ON public.plans
  FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert own plans" ON public.plans
  FOR INSERT WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update own plans" ON public.plans
  FOR UPDATE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can delete own plans" ON public.plans
  FOR DELETE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- plan_days
CREATE POLICY "Users can read own plan_days" ON public.plan_days
  FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert own plan_days" ON public.plan_days
  FOR INSERT WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update own plan_days" ON public.plan_days
  FOR UPDATE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can delete own plan_days" ON public.plan_days
  FOR DELETE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- plan_slots
CREATE POLICY "Users can read own plan_slots" ON public.plan_slots
  FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert own plan_slots" ON public.plan_slots
  FOR INSERT WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update own plan_slots" ON public.plan_slots
  FOR UPDATE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can delete own plan_slots" ON public.plan_slots
  FOR DELETE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- planned_meals
CREATE POLICY "Users can read own planned_meals" ON public.planned_meals
  FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert own planned_meals" ON public.planned_meals
  FOR INSERT WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update own planned_meals" ON public.planned_meals
  FOR UPDATE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can delete own planned_meals" ON public.planned_meals
  FOR DELETE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- planned_substitutions
CREATE POLICY "Users can read own planned_substitutions" ON public.planned_substitutions
  FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert own planned_substitutions" ON public.planned_substitutions
  FOR INSERT WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update own planned_substitutions" ON public.planned_substitutions
  FOR UPDATE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can delete own planned_substitutions" ON public.planned_substitutions
  FOR DELETE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- planned_eat_out_events
CREATE POLICY "Users can read own planned_eat_out_events" ON public.planned_eat_out_events
  FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert own planned_eat_out_events" ON public.planned_eat_out_events
  FOR INSERT WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update own planned_eat_out_events" ON public.planned_eat_out_events
  FOR UPDATE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can delete own planned_eat_out_events" ON public.planned_eat_out_events
  FOR DELETE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- generated_grocery_lists
CREATE POLICY "Users can read own grocery_lists" ON public.generated_grocery_lists
  FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert own grocery_lists" ON public.generated_grocery_lists
  FOR INSERT WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update own grocery_lists" ON public.generated_grocery_lists
  FOR UPDATE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can delete own grocery_lists" ON public.generated_grocery_lists
  FOR DELETE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- grocery_items
CREATE POLICY "Users can read own grocery_items" ON public.grocery_items
  FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert own grocery_items" ON public.grocery_items
  FOR INSERT WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update own grocery_items" ON public.grocery_items
  FOR UPDATE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can delete own grocery_items" ON public.grocery_items
  FOR DELETE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- imported_meals
CREATE POLICY "Users can read own imported_meals" ON public.imported_meals
  FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert own imported_meals" ON public.imported_meals
  FOR INSERT WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update own imported_meals" ON public.imported_meals
  FOR UPDATE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can delete own imported_meals" ON public.imported_meals
  FOR DELETE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- imported_menus
CREATE POLICY "Users can read own imported_menus" ON public.imported_menus
  FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert own imported_menus" ON public.imported_menus
  FOR INSERT WITH CHECK (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update own imported_menus" ON public.imported_menus
  FOR UPDATE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can delete own imported_menus" ON public.imported_menus
  FOR DELETE USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- ai_runs — read-only from client; writes happen via service role.
CREATE POLICY "Users can read own ai_runs" ON public.ai_runs
  FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- program_plan_guidance — read-only from client; writes happen via service role.
CREATE POLICY "Users can read own program_plan_guidance" ON public.program_plan_guidance
  FOR SELECT USING (person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

-- ============================================================================
-- updated_at triggers — reuse the existing update_journal_updated_at() fn
-- created by scripts/createJournalTables.sql.
-- ============================================================================

DROP TRIGGER IF EXISTS plans_updated_at ON public.plans;
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS plan_days_updated_at ON public.plan_days;
CREATE TRIGGER plan_days_updated_at BEFORE UPDATE ON public.plan_days
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS plan_slots_updated_at ON public.plan_slots;
CREATE TRIGGER plan_slots_updated_at BEFORE UPDATE ON public.plan_slots
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS planned_meals_updated_at ON public.planned_meals;
CREATE TRIGGER planned_meals_updated_at BEFORE UPDATE ON public.planned_meals
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS planned_substitutions_updated_at ON public.planned_substitutions;
CREATE TRIGGER planned_substitutions_updated_at BEFORE UPDATE ON public.planned_substitutions
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS planned_eat_out_events_updated_at ON public.planned_eat_out_events;
CREATE TRIGGER planned_eat_out_events_updated_at BEFORE UPDATE ON public.planned_eat_out_events
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS generated_grocery_lists_updated_at ON public.generated_grocery_lists;
CREATE TRIGGER generated_grocery_lists_updated_at BEFORE UPDATE ON public.generated_grocery_lists
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS grocery_items_updated_at ON public.grocery_items;
CREATE TRIGGER grocery_items_updated_at BEFORE UPDATE ON public.grocery_items
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS imported_meals_updated_at ON public.imported_meals;
CREATE TRIGGER imported_meals_updated_at BEFORE UPDATE ON public.imported_meals
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS imported_menus_updated_at ON public.imported_menus;
CREATE TRIGGER imported_menus_updated_at BEFORE UPDATE ON public.imported_menus
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS ai_runs_updated_at ON public.ai_runs;
CREATE TRIGGER ai_runs_updated_at BEFORE UPDATE ON public.ai_runs
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS program_plan_guidance_updated_at ON public.program_plan_guidance;
CREATE TRIGGER program_plan_guidance_updated_at BEFORE UPDATE ON public.program_plan_guidance
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ============================================================================
-- Verification queries
-- ============================================================================

-- List all new Plans-lane tables:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN (
--       'plans','plan_days','plan_slots','planned_meals',
--       'planned_substitutions','planned_eat_out_events',
--       'generated_grocery_lists','grocery_items',
--       'imported_meals','imported_menus',
--       'ai_runs','program_plan_guidance'
--     )
--   ORDER BY table_name;

-- Confirm NDS flat columns exist on plan_days:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'plan_days'
--     AND column_name LIKE 'projected_%'
--   ORDER BY column_name;

-- Confirm NDS meal-derived columns exist on planned_meals / imported_meals:
--   SELECT table_name, column_name FROM information_schema.columns
--   WHERE table_name IN ('planned_meals','imported_meals')
--     AND column_name IN ('protein_score_10','is_main_meal','psq_multiplier','meal_derived_data','nds_confidence','nds_version','classifier_version')
--   ORDER BY table_name, column_name;
