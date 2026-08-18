-- ============================================================================
-- Packet 11C isolated verification (scratch database only)
--
-- Do NOT run against production or a shared remote. Packet 11C is review-first
-- and does not authorize apply.
--
-- Contract proofs that do not need seed data (safe on a scratch clone after
-- the function exists):
-- ============================================================================

-- Function exists, SECURITY INVOKER, search_path pinned.
SELECT
  p.proname,
  p.prosecdef AS is_security_definer,  -- must be false
  p.proconfig                            -- must include search_path=public, pg_temp
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_grocery_haul_from_list';

-- PUBLIC has no EXECUTE; service_role does.
SELECT
  r.rolname,
  has_function_privilege(
    r.rolname,
    'public.create_grocery_haul_from_list(uuid,uuid,date,uuid)',
    'EXECUTE'
  ) AS can_execute
FROM pg_roles r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres');

-- ============================================================================
-- Atomic rollback proofs (scratch seed required)
--
-- Setup (replace UUIDs with scratch rows owned by a test person):
--   v_person, v_list with at least one grocery_items.status = 'pending'
--   v_token_a, v_token_b distinct UUIDs
--   v_date = CURRENT_DATE
--
-- 1. Happy path: Haul + snapshots in one call; List status unchanged.
--    SELECT public.create_grocery_haul_from_list(v_person, v_list, v_date, v_token_a);
--    Expect outcome=created, item_count = pending count.
--    Expect grocery_items.status still 'pending' (no List mutation).
--    Expect no pantry table writes.
--
-- 2. Zero pending leaves no Haul:
--    Call with a list that has only have/bought/skipped items and a fresh token.
--    Expect exception HAUL_CREATE_NO_PENDING_ITEMS.
--    Expect zero grocery_hauls rows for that token.
--
-- 3. Forced item-insert failure leaves no Haul:
--    BEGIN;
--      CREATE OR REPLACE FUNCTION pg_temp.fail_haul_item() RETURNS trigger
--      LANGUAGE plpgsql AS $t$ BEGIN RAISE EXCEPTION 'FORCED_ITEM_INSERT_FAILURE'; END; $t$;
--      CREATE TRIGGER trg_fail_haul_item
--        BEFORE INSERT ON public.grocery_haul_items
--        FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_haul_item();
--      SELECT public.create_grocery_haul_from_list(v_person, v_list, v_date, v_token_fail);
--      -- expect FORCED_ITEM_INSERT_FAILURE
--      SELECT COUNT(*) FROM public.grocery_hauls WHERE creation_token = v_token_fail;
--      -- expect 0
--    ROLLBACK;
--
-- 4. Same creation_token + same list/date reuses, never creates a second Haul:
--    Repeat call 1 with v_token_a, same list/date.
--    Expect outcome=reused and the same haul_id.
--
-- 5. Same creation_token + different list => HAUL_CREATE_TOKEN_MISMATCH:
--    Call with v_token_a, a different owned list id, same date.
--    Expect HAUL_CREATE_TOKEN_MISMATCH and no new grocery_hauls /
--    grocery_haul_items rows.
--
-- 6. Same creation_token + different shopping_date => HAUL_CREATE_TOKEN_MISMATCH:
--    Call with v_token_a, same list, a different date.
--    Expect HAUL_CREATE_TOKEN_MISMATCH and no new rows.
--
-- 7. Open list/date uniqueness (different token):
--    Call with v_token_b, same person/list/date while the first Haul is planned.
--    Expect HAUL_CREATE_OPEN_EXISTS and no second Haul.
--
-- 8. Cross-person/list:
--    Pass another person's list id. Expect HAUL_CREATE_LIST_NOT_FOUND.
--    Pass a person_id that does not match auth.uid() when JWT is present.
--    Expect HAUL_CREATE_FORBIDDEN.
-- ============================================================================
