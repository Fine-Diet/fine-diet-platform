-- ============================================================================
-- Plans Phase 15 (Trusted resolution workflow for missing-item requests)
-- — additive schema only.
--
-- Packet 14 already writes the resolved status, resolved_food_object_id,
-- resolved_by_user_id, resolved_at, and resolution_notes columns. Packet
-- 15 adds two small provenance fields so the admin console (and anyone
-- auditing the backlog) can tell at a glance whether a resolution also
-- performed alias enrichment, and with what value.
--
-- Notes:
--   - food_objects.aliases (TEXT[]) already exists and is already
--     consulted by the Packet 6 ingredient matcher. No separate alias
--     table is required; Packet 15 enriches in place via a reviewed
--     admin action.
--   - Dedupe for the open subset is still provided by the partial
--     unique index added in Packet 14.
-- ============================================================================

ALTER TABLE public.missing_item_requests
  ADD COLUMN IF NOT EXISTS alias_enrichment_applied BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.missing_item_requests
  ADD COLUMN IF NOT EXISTS alias_enrichment_value TEXT;

COMMENT ON COLUMN public.missing_item_requests.alias_enrichment_applied IS
  'Phase 15: true when resolving this request also appended an alias to food_objects.aliases.';
COMMENT ON COLUMN public.missing_item_requests.alias_enrichment_value IS
  'Phase 15: the alias string that was appended (lowercased, trimmed). Null when no enrichment was applied.';
