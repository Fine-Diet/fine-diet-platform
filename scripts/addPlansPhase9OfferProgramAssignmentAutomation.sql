-- ============================================================================
-- Plans Phase 9 (Offer/Stripe purchase → program assignment automation) —
-- additive schema.
--
-- Packet 9 automates the handoff:
--   offers.assigns_program_slug  : REPO mapping from an offer to the
--                                  program_slug that an automated
--                                  assignment should target.
--   program_assignments.auto_created : distinguishes rows produced by
--                                  automation from admin-entered ones so
--                                  the inspection UI can label them.
--   idx_program_assignments_provenance_unique : partial UNIQUE index that
--                                  keys (person_id, program_slug,
--                                  source_ref). Guarantees idempotency at
--                                  the DB layer for replayed Stripe events
--                                  or replayed backfills that keep the same
--                                  source_ref.
--
-- Fully additive. Packet 7/8 schemas are untouched.
--
-- Run via Supabase MCP `apply_migration`
-- (`add_plans_phase_9_offer_program_assignment_automation`) or in the SQL editor.
-- ============================================================================

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS assigns_program_slug TEXT;

COMMENT ON COLUMN public.offers.assigns_program_slug IS
  'Packet 9: if set, purchases/grants of this offer auto-create a program_assignments row for this slug.';

ALTER TABLE public.program_assignments
  ADD COLUMN IF NOT EXISTS auto_created BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.program_assignments.auto_created IS
  'Packet 9: true if this row was produced by the Offer → Program assignment automation (Stripe webhook, admin offer grant, admin entitlement grant, or backfill). Admin-entered rows stay false.';

-- Idempotency anchor: one assignment per (person, program, source_ref).
-- Source_ref NULL rows (manual/admin) stay unconstrained so staff can
-- stack overlapping manual assignments intentionally.
CREATE UNIQUE INDEX IF NOT EXISTS idx_program_assignments_provenance_unique
  ON public.program_assignments (person_id, program_slug, source_ref)
  WHERE source_ref IS NOT NULL;
