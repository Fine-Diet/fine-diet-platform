-- Packet 52 — Reusable Template and Pattern Provenance Clarity
--
-- Adds explicit instantiation provenance for planned meals created by applying
-- reusable day templates or week patterns. Upstream ancestry remains in the
-- existing source_template_id / source_imported_meal_id columns.

ALTER TABLE public.planned_meals
  ADD COLUMN IF NOT EXISTS reusable_provenance JSONB;

COMMENT ON COLUMN public.planned_meals.reusable_provenance IS
  'Explicit provenance for meals instantiated from reusable day templates or week patterns. NULL for direct/manual/import-created planned meals.';
