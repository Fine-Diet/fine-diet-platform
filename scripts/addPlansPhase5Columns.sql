-- ============================================================================
-- Plans Phase 5 (Eat-out and restaurant planning) — additive schema
--
-- Phase 1 pre-created `imported_menus` and `planned_eat_out_events` as
-- structural placeholders. Packet 5 locks the product contract and
-- requires a few columns that were not part of the Phase 1 shape:
--
--   imported_menus:
--     - parse_status            pending/parsed/failed/manual_review
--     - raw_input_text          plain-text body for manual_paste inputs
--
--   planned_eat_out_events:
--     - plan_slot_id            FK to plan_slots (Packet 5 locks the
--                                 eat-out event to a real slot, not a
--                                 free-floating day-level event)
--
-- Additive only: no existing columns are dropped, renamed, or retyped.
-- Run in Supabase SQL Editor.
-- ============================================================================

-- imported_menus.parse_status
ALTER TABLE public.imported_menus
  ADD COLUMN IF NOT EXISTS parse_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (parse_status IN ('pending', 'parsed', 'failed', 'manual_review'));

-- imported_menus.raw_input_text
ALTER TABLE public.imported_menus
  ADD COLUMN IF NOT EXISTS raw_input_text TEXT;

-- planned_eat_out_events.plan_slot_id — nullable for backfill safety,
-- but all Packet 5 creations will set this.
ALTER TABLE public.planned_eat_out_events
  ADD COLUMN IF NOT EXISTS plan_slot_id UUID
    REFERENCES public.plan_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_planned_eat_out_slot
  ON public.planned_eat_out_events (plan_slot_id);

-- Helpful read path when rendering an imported menu in review UI.
CREATE INDEX IF NOT EXISTS idx_imported_menus_person_parse_status
  ON public.imported_menus (person_id, parse_status, updated_at DESC);

COMMENT ON COLUMN public.imported_menus.parse_status IS
  'Parse pipeline state for the menu — mirrors imported_meals.parse_status.';

COMMENT ON COLUMN public.imported_menus.raw_input_text IS
  'Plain-text menu input preserved verbatim for manual_review and audit.';

COMMENT ON COLUMN public.planned_eat_out_events.plan_slot_id IS
  'Plan slot this eat-out event attaches to. Packet 5 locks the eat-out event to a real slot.';
