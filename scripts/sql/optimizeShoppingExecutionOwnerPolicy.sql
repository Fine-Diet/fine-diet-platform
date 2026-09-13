-- ============================================================================
-- Signed-In App Upgrade Packet 10A — Shopping execution owner SELECT initplan
--
-- Repository-only, reviewed/idempotent SQL. Do not apply to production or a
-- shared remote without a separate controlled deployment authorization.
--
-- Scope: replace only "Users can read own grocery_haul_execution_items".
-- Ownership semantics are unchanged: person_id must match people.id where
-- people.auth_user_id matches the current auth user. The sole change is
-- evaluating auth.uid() once per statement via (select auth.uid()).
-- ============================================================================

ALTER TABLE public.grocery_haul_execution_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own grocery_haul_execution_items"
  ON public.grocery_haul_execution_items;

CREATE POLICY "Users can read own grocery_haul_execution_items"
  ON public.grocery_haul_execution_items
  FOR SELECT USING (
    person_id IN (
      SELECT people.id
      FROM public.people
      WHERE people.auth_user_id = (select auth.uid())
    )
  );
