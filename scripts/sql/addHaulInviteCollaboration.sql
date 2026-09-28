-- ============================================================================
-- Invite to Haul v1 — Phase B1: collaboration persistence + authorization spine
--
-- Repository-only, reviewed/idempotent SQL. Do NOT apply to production or a
-- shared remote without separate, explicit deployment authorization.
--
-- Product boundary (settled; not rediscovered here):
--   Narrow Haul-only collaboration. An accepted contributor can read the shared
--   Haul and add / edit / remove THEIR OWN Haul-only items while the Haul is a
--   Draft ('planned'). A contributor can never touch the owner's source Lists,
--   the Store roster, Haul metadata, pricing/readiness controls, or another
--   member's items. Contributor items never write back to grocery_items.
--
-- Prerequisites (apply first, in existing operator order):
--   createGroceryHaulFoundation.sql, addFoodPersistenceFoundation.sql,
--   addHaulBuilderPersistence.sql, addShoppingViewExecution.sql,
--   allowActiveHaulPendingPreparationEdits.sql, addGroceryHaulStoreRoster.sql
--   (markGroceryHaulExecutionInBasket.sql / optimizeShoppingExecutionOwnerPolicy.sql
--    are independent of this file.)
--
-- Design summary
--   1. grocery_haul_invitations is the ONLY collaboration table. Accepted
--      membership is the row whose status = 'accepted'; there is no second
--      membership table, so there is no duplicated lifecycle state.
--   2. grocery_haul_items keeps person_id = the Haul OWNER for every row. That
--      keeps every existing owner read, estimate, readiness and execution path
--      correct with no change. Contributor rows are distinguished by
--      origin_type + added_by_person_id, never by person_id.
--   3. source_grocery_list_id becomes nullable on grocery_haul_items and on
--      grocery_haul_execution_items. The existing composite source-membership FK
--      is MATCH SIMPLE, so a NULL source List disables it for Haul-only rows and
--      leaves it fully enforced for source-List snapshot rows. A CHECK pins the
--      only two coherent shapes.
--   4. All collaboration writes go through SECURITY INVOKER RPCs that are
--      EXECUTE-granted to service_role only and that RE-VERIFY identity and role
--      inside the database. authenticated/anon get SELECT-only with row
--      predicates; there are no direct client write paths.
--   5. No SECURITY DEFINER anywhere. All functions pin search_path.
--
-- Rollback: scripts/sql/rollbackHaulInviteCollaboration.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. grocery_haul_items: origin discriminator + attribution + nullable source
-- ----------------------------------------------------------------------------

ALTER TABLE public.grocery_haul_items
  ALTER COLUMN source_grocery_list_id DROP NOT NULL;

ALTER TABLE public.grocery_haul_items
  ADD COLUMN IF NOT EXISTS origin_type TEXT NOT NULL
    DEFAULT 'source_list_snapshot',
  ADD COLUMN IF NOT EXISTS added_by_person_id UUID NULL
    REFERENCES public.people(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_haul_items'::regclass
      AND conname = 'grocery_haul_items_origin_type_check'
  ) THEN
    ALTER TABLE public.grocery_haul_items
      ADD CONSTRAINT grocery_haul_items_origin_type_check
      CHECK (origin_type IN ('source_list_snapshot', 'haul_contributor'));
  END IF;

  -- The only two coherent shapes. NOT VALID + VALIDATE keeps the lock light on
  -- a live table and still checks every existing row.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grocery_haul_items'::regclass
      AND conname = 'grocery_haul_items_origin_coherent'
  ) THEN
    ALTER TABLE public.grocery_haul_items
      ADD CONSTRAINT grocery_haul_items_origin_coherent
      CHECK (
        (
          origin_type = 'source_list_snapshot'
          AND source_grocery_list_id IS NOT NULL
          AND added_by_person_id IS NULL
        )
        OR (
          -- Haul-only contributor item: must not pretend to come from a source
          -- List, a list item, a food snapshot, or a purchasing/price snapshot.
          -- added_by_person_id is enforced NOT NULL at INSERT by the origin guard
          -- trigger; the column is ON DELETE SET NULL so erasing a contributor's
          -- account never blocks or deletes the owner's Haul history.
          origin_type = 'haul_contributor'
          AND source_grocery_list_id IS NULL
          AND grocery_item_id IS NULL
          AND food_object_id_snapshot IS NULL
          AND source_type_snapshot IS NULL
          AND source_id_snapshot IS NULL
          AND source_status_snapshot = 'pending'
          AND source_purchasing_choice_id IS NULL
          AND source_price_observation_id IS NULL
        )
      ) NOT VALID;
    ALTER TABLE public.grocery_haul_items
      VALIDATE CONSTRAINT grocery_haul_items_origin_coherent;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_grocery_haul_items_added_by
  ON public.grocery_haul_items (haul_id, added_by_person_id)
  WHERE added_by_person_id IS NOT NULL;

COMMENT ON COLUMN public.grocery_haul_items.origin_type IS
  'source_list_snapshot: frozen copy of a source-List item (immutable snapshot provenance). haul_contributor: Haul-only item added by an accepted contributor; never written back to grocery_items / source Lists.';
COMMENT ON COLUMN public.grocery_haul_items.added_by_person_id IS
  'Attribution for haul_contributor rows. Stays on the item, not on the membership, so revoking a contributor never erases historical contribution. NULL only for source-List snapshot rows, or after the contributor person is erased (ON DELETE SET NULL).';
COMMENT ON COLUMN public.grocery_haul_items.source_grocery_list_id IS
  'Frozen item-level source List provenance for source_list_snapshot rows (must be a same-owner member of the Haul via grocery_haul_items_source_membership_fk, which is MATCH SIMPLE). NULL for haul_contributor rows, where that FK intentionally does not apply.';

-- ----------------------------------------------------------------------------
-- 2. grocery_haul_execution_items: source List is nullable for Haul-only rows
-- ----------------------------------------------------------------------------

ALTER TABLE public.grocery_haul_execution_items
  ALTER COLUMN source_grocery_list_id DROP NOT NULL;

COMMENT ON COLUMN public.grocery_haul_execution_items.source_grocery_list_id IS
  'Frozen source List copied at activation. NULL exactly when the linked Haul item is a haul_contributor item (enforced by guard_grocery_haul_execution_item_source).';

CREATE OR REPLACE FUNCTION public.guard_grocery_haul_execution_item_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_origin TEXT;
BEGIN
  SELECT origin_type INTO v_origin
  FROM public.grocery_haul_items
  WHERE id = NEW.haul_item_id
    AND haul_id = NEW.haul_id
    AND person_id = NEW.person_id;

  IF v_origin IS NULL THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_SOURCE_MISMATCH';
  END IF;

  -- Nullness must match origin in both directions: a Haul-only item has no
  -- source List, and a source-List snapshot item always has one.
  IF (NEW.source_grocery_list_id IS NULL) IS DISTINCT FROM (v_origin = 'haul_contributor') THEN
    RAISE EXCEPTION 'HAUL_EXECUTION_SOURCE_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_haul_execution_items_source_guard
  ON public.grocery_haul_execution_items;
CREATE TRIGGER grocery_haul_execution_items_source_guard
  BEFORE INSERT ON public.grocery_haul_execution_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_grocery_haul_execution_item_source();

-- ----------------------------------------------------------------------------
-- 3. grocery_haul_invitations — the single collaboration table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.grocery_haul_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  haul_id UUID NOT NULL,
  owner_person_id UUID NOT NULL,

  -- Trim + lower-case, matching account linking (app/api/account/link-person):
  -- normalizedEmail = email.trim().toLowerCase().
  invited_email_normalized TEXT NOT NULL,

  -- Resolved to a people row when known. Set at acceptance at the latest.
  -- CASCADE: erasing the invitee's person removes their membership row; their
  -- items keep history with added_by_person_id SET NULL.
  invited_person_id UUID NULL
    REFERENCES public.people(id) ON DELETE CASCADE,

  role TEXT NOT NULL DEFAULT 'contributor',
  status TEXT NOT NULL DEFAULT 'pending',

  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grocery_haul_invitations_role_check
    CHECK (role = 'contributor'),
  CONSTRAINT grocery_haul_invitations_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked')),
  CONSTRAINT grocery_haul_invitations_email_normalized
    CHECK (
      invited_email_normalized = lower(btrim(invited_email_normalized))
      AND invited_email_normalized ~ '^[^@[:space:]]+@[^@[:space:]]+$'
      AND char_length(invited_email_normalized) <= 320
    ),
  CONSTRAINT grocery_haul_invitations_state_coherent
    CHECK (
      (status = 'pending'
        AND accepted_at IS NULL AND revoked_at IS NULL)
      OR (status = 'accepted'
        AND accepted_at IS NOT NULL AND revoked_at IS NULL
        AND invited_person_id IS NOT NULL)
      OR (status = 'revoked'
        AND revoked_at IS NOT NULL)
    ),

  -- Invitations die with the Haul (and with the owner).
  CONSTRAINT grocery_haul_invitations_haul_owner_fk
    FOREIGN KEY (haul_id, owner_person_id)
    REFERENCES public.grocery_hauls (id, person_id)
    ON DELETE CASCADE
);

-- One LIVE invitation/membership per Haul + email. Revoked rows are history, so
-- a controlled reinvite is simply a new pending row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_haul_invitations_live_email
  ON public.grocery_haul_invitations (haul_id, invited_email_normalized)
  WHERE status IN ('pending', 'accepted');

-- ...and one live membership per Haul + person, even across email changes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_haul_invitations_live_person
  ON public.grocery_haul_invitations (haul_id, invited_person_id)
  WHERE status IN ('pending', 'accepted') AND invited_person_id IS NOT NULL;

-- Membership lookup used by RLS predicates and the access resolver.
CREATE INDEX IF NOT EXISTS idx_grocery_haul_invitations_member
  ON public.grocery_haul_invitations (invited_person_id, haul_id)
  WHERE status = 'accepted';

-- Invitee lookup by normalized email (pending invitations addressed to me).
CREATE INDEX IF NOT EXISTS idx_grocery_haul_invitations_email_pending
  ON public.grocery_haul_invitations (invited_email_normalized)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_grocery_haul_invitations_haul
  ON public.grocery_haul_invitations (haul_id, created_at);

CREATE INDEX IF NOT EXISTS idx_grocery_haul_invitations_owner_pending
  ON public.grocery_haul_invitations (owner_person_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.grocery_haul_invitations IS
  'Haul-only collaboration. status=accepted rows ARE the accepted contributor membership. Email alone never activates membership: acceptance binds the invitation to the linked people row whose normalized email matches (enforced in accept_grocery_haul_invitation and guard_grocery_haul_invitation). Writes are service_role RPC only.';

-- Lifecycle + identity-binding guard. Enforced in the database so that even a
-- direct service_role write cannot forge membership.
CREATE OR REPLACE FUNCTION public.guard_grocery_haul_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_haul_status TEXT;
  v_owner_email TEXT;
  v_person_email TEXT;
  v_person_auth UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'HAUL_INVITE_INVALID_STATE';
    END IF;

    SELECT status INTO v_haul_status
    FROM public.grocery_hauls
    WHERE id = NEW.haul_id AND person_id = NEW.owner_person_id;
    IF v_haul_status IS NULL THEN
      RAISE EXCEPTION 'HAUL_INVITE_NOT_FOUND';
    END IF;
    IF v_haul_status <> 'planned' THEN
      RAISE EXCEPTION 'HAUL_INVITE_NOT_DRAFT';
    END IF;

    SELECT lower(btrim(email)) INTO v_owner_email
    FROM public.people WHERE id = NEW.owner_person_id;
    IF NEW.invited_person_id = NEW.owner_person_id
       OR v_owner_email = NEW.invited_email_normalized THEN
      RAISE EXCEPTION 'HAUL_INVITE_SELF';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.haul_id IS DISTINCT FROM OLD.haul_id
     OR NEW.owner_person_id IS DISTINCT FROM OLD.owner_person_id
     OR NEW.invited_email_normalized IS DISTINCT FROM OLD.invited_email_normalized
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.invited_at IS DISTINCT FROM OLD.invited_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'HAUL_INVITE_IMMUTABLE';
  END IF;

  -- The resolved person can be set once and never re-pointed.
  IF OLD.invited_person_id IS NOT NULL
     AND NEW.invited_person_id IS DISTINCT FROM OLD.invited_person_id THEN
    RAISE EXCEPTION 'HAUL_INVITE_IMMUTABLE';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Legal transitions only. revoked is terminal; reinvite is a new row.
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('accepted', 'revoked'))
      OR (OLD.status = 'accepted' AND NEW.status = 'revoked')
    ) THEN
      RAISE EXCEPTION 'HAUL_INVITE_INVALID_TRANSITION';
    END IF;

    IF NEW.status = 'accepted' THEN
      -- Identity binding: the accepting person must be a linked account whose
      -- normalized email equals the invitation target.
      SELECT lower(btrim(email)), auth_user_id
      INTO v_person_email, v_person_auth
      FROM public.people WHERE id = NEW.invited_person_id;

      IF v_person_email IS NULL
         OR v_person_auth IS NULL
         OR v_person_email IS DISTINCT FROM NEW.invited_email_normalized THEN
        RAISE EXCEPTION 'HAUL_INVITE_IDENTITY_MISMATCH';
      END IF;
      IF NEW.invited_person_id = NEW.owner_person_id THEN
        RAISE EXCEPTION 'HAUL_INVITE_SELF';
      END IF;

      SELECT status INTO v_haul_status
      FROM public.grocery_hauls
      WHERE id = NEW.haul_id AND person_id = NEW.owner_person_id;
      IF v_haul_status IS NULL OR v_haul_status NOT IN ('planned', 'active') THEN
        RAISE EXCEPTION 'HAUL_INVITE_HAUL_NOT_OPEN';
      END IF;
    END IF;

    IF NEW.status = 'revoked' THEN
      NEW.revoked_at := COALESCE(NEW.revoked_at, now());
    END IF;
  ELSE
    -- Same status: only bookkeeping columns may move.
    IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
      RAISE EXCEPTION 'HAUL_INVITE_IMMUTABLE';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_haul_invitations_guard
  ON public.grocery_haul_invitations;
CREATE TRIGGER grocery_haul_invitations_guard
  BEFORE INSERT OR UPDATE ON public.grocery_haul_invitations
  FOR EACH ROW EXECUTE FUNCTION public.guard_grocery_haul_invitation();

-- ----------------------------------------------------------------------------
-- 4. Item guards: origin on INSERT, immutability on UPDATE
-- ----------------------------------------------------------------------------

-- A Haul-only item can only be created for an accepted contributor of a Draft
-- Haul, and must carry attribution. Owners cannot mint Haul-only items through
-- this path in v1; that is a deliberate product boundary, enforced here.
CREATE OR REPLACE FUNCTION public.guard_grocery_haul_item_origin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NEW.origin_type IS DISTINCT FROM 'haul_contributor' THEN
    RETURN NEW;
  END IF;

  IF NEW.added_by_person_id IS NULL THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_ATTRIBUTION_REQUIRED';
  END IF;

  SELECT status INTO v_status
  FROM public.grocery_hauls
  WHERE id = NEW.haul_id AND person_id = NEW.person_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_HAUL_NOT_FOUND';
  END IF;
  IF v_status <> 'planned' THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_NOT_DRAFT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.grocery_haul_invitations
    WHERE haul_id = NEW.haul_id
      AND owner_person_id = NEW.person_id
      AND invited_person_id = NEW.added_by_person_id
      AND status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_NOT_MEMBER';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_haul_items_origin_guard
  ON public.grocery_haul_items;
CREATE TRIGGER grocery_haul_items_origin_guard
  BEFORE INSERT ON public.grocery_haul_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_grocery_haul_item_origin();

-- Supersedes the guard in allowActiveHaulPendingPreparationEdits.sql. Changes
-- vs that version (everything else is byte-for-byte the same behaviour):
--   * origin_type is immutable; added_by_person_id is immutable except the
--     ON DELETE SET NULL cleanup (contributor person erased).
--   * name/quantity/unit "snapshot" columns stay immutable for source-List
--     snapshot rows, but are the contributor-authored content of haul_contributor
--     rows and may change - only while the Haul is a Draft.
--   * those content columns are included in the reference-cleanup allowance so a
--     content change can never ride through the early-return path.
CREATE OR REPLACE FUNCTION public.guard_grocery_haul_item_preparation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_execution_state TEXT;
  v_only_reference_cleanup BOOLEAN;
  v_content_changed BOOLEAN;
BEGIN
  IF NEW.haul_id IS DISTINCT FROM OLD.haul_id
     OR NEW.person_id IS DISTINCT FROM OLD.person_id
     OR NEW.source_grocery_list_id IS DISTINCT FROM OLD.source_grocery_list_id
     OR NEW.origin_type IS DISTINCT FROM OLD.origin_type
     OR NEW.source_status_snapshot IS DISTINCT FROM OLD.source_status_snapshot
     OR NEW.source_type_snapshot IS DISTINCT FROM OLD.source_type_snapshot
     OR NEW.source_id_snapshot IS DISTINCT FROM OLD.source_id_snapshot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (
       OLD.origin_type = 'source_list_snapshot'
       AND (
         NEW.name_snapshot IS DISTINCT FROM OLD.name_snapshot
         OR NEW.quantity_snapshot IS DISTINCT FROM OLD.quantity_snapshot
         OR NEW.unit_snapshot IS DISTINCT FROM OLD.unit_snapshot
       )
     ) THEN
    RAISE EXCEPTION 'HAUL_ITEM_SNAPSHOT_IMMUTABLE';
  END IF;

  IF NEW.added_by_person_id IS DISTINCT FROM OLD.added_by_person_id
     AND NOT (OLD.added_by_person_id IS NOT NULL AND NEW.added_by_person_id IS NULL) THEN
    RAISE EXCEPTION 'HAUL_ITEM_SNAPSHOT_IMMUTABLE';
  END IF;

  v_content_changed :=
    NEW.name_snapshot IS DISTINCT FROM OLD.name_snapshot
    OR NEW.quantity_snapshot IS DISTINCT FROM OLD.quantity_snapshot
    OR NEW.unit_snapshot IS DISTINCT FROM OLD.unit_snapshot;

  -- Preserve the foundation's ON DELETE SET NULL behavior for historical
  -- pointers. The copied name/quantity/unit/source snapshots remain frozen.
  v_only_reference_cleanup :=
    (
      NEW.grocery_item_id IS NOT DISTINCT FROM OLD.grocery_item_id
      OR (OLD.grocery_item_id IS NOT NULL AND NEW.grocery_item_id IS NULL)
    )
    AND (
      NEW.food_object_id_snapshot IS NOT DISTINCT FROM OLD.food_object_id_snapshot
      OR (
        OLD.food_object_id_snapshot IS NOT NULL
        AND NEW.food_object_id_snapshot IS NULL
      )
    )
    AND (
      NEW.selected_food_object_id IS NOT DISTINCT FROM OLD.selected_food_object_id
      OR (
        OLD.selected_food_object_id IS NOT NULL
        AND NEW.selected_food_object_id IS NULL
      )
    )
    AND (
      NEW.added_by_person_id IS NOT DISTINCT FROM OLD.added_by_person_id
      OR (OLD.added_by_person_id IS NOT NULL AND NEW.added_by_person_id IS NULL)
    )
    AND NOT v_content_changed
    AND NEW.final_quantity IS NOT DISTINCT FROM OLD.final_quantity
    AND NEW.product_title IS NOT DISTINCT FROM OLD.product_title
    AND NEW.brand_name IS NOT DISTINCT FROM OLD.brand_name
    AND NEW.purchase_unit IS NOT DISTINCT FROM OLD.purchase_unit
    AND NEW.package_size IS NOT DISTINCT FROM OLD.package_size
    AND NEW.package_unit IS NOT DISTINCT FROM OLD.package_unit
    AND NEW.package_count IS NOT DISTINCT FROM OLD.package_count
    AND NEW.retailer IS NOT DISTINCT FROM OLD.retailer
    AND NEW.store_location IS NOT DISTINCT FROM OLD.store_location
    AND NEW.postal_code IS NOT DISTINCT FROM OLD.postal_code
    AND NEW.price_amount IS NOT DISTINCT FROM OLD.price_amount
    AND NEW.price_currency IS NOT DISTINCT FROM OLD.price_currency
    AND NEW.price_source IS NOT DISTINCT FROM OLD.price_source
    AND NEW.source_purchasing_choice_id IS NOT DISTINCT FROM OLD.source_purchasing_choice_id
    AND NEW.source_price_observation_id IS NOT DISTINCT FROM OLD.source_price_observation_id
    AND NEW.resolution_source IS NOT DISTINCT FROM OLD.resolution_source
    AND NEW.price_retrieved_at IS NOT DISTINCT FROM OLD.price_retrieved_at;

  IF v_only_reference_cleanup
     AND (
       NEW.grocery_item_id IS DISTINCT FROM OLD.grocery_item_id
       OR NEW.food_object_id_snapshot IS DISTINCT FROM OLD.food_object_id_snapshot
       OR NEW.selected_food_object_id IS DISTINCT FROM OLD.selected_food_object_id
       OR NEW.added_by_person_id IS DISTINCT FROM OLD.added_by_person_id
     ) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.grocery_item_id IS DISTINCT FROM OLD.grocery_item_id
     OR NEW.food_object_id_snapshot IS DISTINCT FROM OLD.food_object_id_snapshot THEN
    RAISE EXCEPTION 'HAUL_ITEM_SNAPSHOT_IMMUTABLE';
  END IF;

  SELECT status INTO v_status
  FROM public.grocery_hauls
  WHERE id = OLD.haul_id AND person_id = OLD.person_id
  FOR UPDATE;

  IF v_status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'HAUL_PREPARATION_HISTORICAL';
  END IF;

  -- Contributor-authored content is Draft-only, even for the owner.
  IF v_content_changed AND v_status IS DISTINCT FROM 'planned' THEN
    RAISE EXCEPTION 'HAUL_PREPARATION_NOT_DRAFT';
  END IF;

  IF v_status = 'planned' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF v_status = 'active' THEN
    SELECT execution.state INTO v_execution_state
    FROM public.grocery_haul_execution_items execution
    WHERE execution.haul_item_id = OLD.id
      AND execution.haul_id = OLD.haul_id
      AND execution.person_id = OLD.person_id
    FOR UPDATE;

    IF v_execution_state IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'HAUL_PREPARATION_EXECUTION_LOCKED';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'HAUL_PREPARATION_NOT_DRAFT';
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. RLS + grants
-- ----------------------------------------------------------------------------
-- authenticated/anon never write these tables directly. Reads are row-scoped.
-- No policy references grocery_hauls from the invitations table, so the
-- hauls/items -> invitations policy dependency cannot recurse.

ALTER TABLE public.grocery_haul_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read own grocery_haul_invitations"
  ON public.grocery_haul_invitations;
CREATE POLICY "Owners can read own grocery_haul_invitations"
  ON public.grocery_haul_invitations
  FOR SELECT USING (
    owner_person_id IN (
      SELECT p.id FROM public.people p
      WHERE p.auth_user_id = (select auth.uid())
    )
  );

-- An invitee can read invitations addressed to them: their own accepted
-- membership, or a live pending invitation matching their linked account email.
DROP POLICY IF EXISTS "Invitees can read own grocery_haul_invitations"
  ON public.grocery_haul_invitations;
CREATE POLICY "Invitees can read own grocery_haul_invitations"
  ON public.grocery_haul_invitations
  FOR SELECT USING (
    status IN ('pending', 'accepted')
    AND (
      invited_person_id IN (
        SELECT p.id FROM public.people p
        WHERE p.auth_user_id = (select auth.uid())
      )
      OR (
        status = 'pending'
        AND invited_email_normalized IN (
          SELECT lower(btrim(p.email)) FROM public.people p
          WHERE p.auth_user_id = (select auth.uid())
        )
      )
    )
  );

-- Accepted contributors may READ the shared Haul and its items. They get no
-- read on source-List membership, the Store roster, or execution rows in v1.
DROP POLICY IF EXISTS "Contributors can read shared grocery_hauls"
  ON public.grocery_hauls;
CREATE POLICY "Contributors can read shared grocery_hauls"
  ON public.grocery_hauls
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.grocery_haul_invitations inv
      JOIN public.people p ON p.id = inv.invited_person_id
      WHERE inv.haul_id = grocery_hauls.id
        AND inv.status = 'accepted'
        AND p.auth_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Contributors can read shared grocery_haul_items"
  ON public.grocery_haul_items;
CREATE POLICY "Contributors can read shared grocery_haul_items"
  ON public.grocery_haul_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.grocery_haul_invitations inv
      JOIN public.people p ON p.id = inv.invited_person_id
      WHERE inv.haul_id = grocery_haul_items.haul_id
        AND inv.status = 'accepted'
        AND p.auth_user_id = (select auth.uid())
    )
  );

REVOKE ALL PRIVILEGES ON public.grocery_haul_invitations FROM anon, authenticated;
GRANT SELECT ON public.grocery_haul_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_haul_invitations TO service_role;

-- ----------------------------------------------------------------------------
-- 6. RPCs (SECURITY INVOKER, service_role only, identity re-verified in-DB)
-- ----------------------------------------------------------------------------

-- Owner: invite an email to a Draft Haul.
--   outcome: created | duplicate_pending | already_member
-- Caps (abuse control; enforced under the Haul row lock):
--   * at most 10 live (pending + accepted) invitations per Haul
--   * at most 20 pending invitations per owner across all Hauls
CREATE OR REPLACE FUNCTION public.create_grocery_haul_invitation(
  p_actor_person_id UUID,
  p_haul_id UUID,
  p_email TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT;
  v_haul public.grocery_hauls%ROWTYPE;
  v_person_id UUID;
  v_person_auth UUID;
  v_existing public.grocery_haul_invitations%ROWTYPE;
  v_invitation public.grocery_haul_invitations%ROWTYPE;
BEGIN
  IF p_actor_person_id IS NULL OR p_haul_id IS NULL OR p_email IS NULL THEN
    RAISE EXCEPTION 'HAUL_INVITE_INVALID_ARGS';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = p_actor_person_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'HAUL_INVITE_FORBIDDEN';
  END IF;

  v_email := lower(btrim(p_email));
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' OR char_length(v_email) > 320 THEN
    RAISE EXCEPTION 'HAUL_INVITE_INVALID_EMAIL';
  END IF;

  SELECT * INTO v_haul
  FROM public.grocery_hauls
  WHERE id = p_haul_id
  FOR UPDATE;
  IF NOT FOUND OR v_haul.person_id <> p_actor_person_id THEN
    -- Non-owners get the same answer as a missing Haul.
    RAISE EXCEPTION 'HAUL_INVITE_NOT_FOUND';
  END IF;
  IF v_haul.status <> 'planned' THEN
    RAISE EXCEPTION 'HAUL_INVITE_NOT_DRAFT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.people
    WHERE id = p_actor_person_id AND lower(btrim(email)) = v_email
  ) THEN
    RAISE EXCEPTION 'HAUL_INVITE_SELF';
  END IF;

  SELECT * INTO v_existing
  FROM public.grocery_haul_invitations
  WHERE haul_id = p_haul_id
    AND invited_email_normalized = v_email
    AND status IN ('pending', 'accepted');
  IF FOUND THEN
    SELECT auth_user_id INTO v_person_auth
    FROM public.people WHERE id = v_existing.invited_person_id;
    RETURN jsonb_build_object(
      'invitation_id', v_existing.id,
      'haul_id', v_existing.haul_id,
      'status', v_existing.status,
      'invited_email_normalized', v_existing.invited_email_normalized,
      'invited_person_id', v_existing.invited_person_id,
      'invited_account_linked', v_person_auth IS NOT NULL,
      'outcome', CASE WHEN v_existing.status = 'accepted'
        THEN 'already_member' ELSE 'duplicate_pending' END
    );
  END IF;

  IF (
    SELECT count(*) FROM public.grocery_haul_invitations
    WHERE haul_id = p_haul_id AND status IN ('pending', 'accepted')
  ) >= 10 THEN
    RAISE EXCEPTION 'HAUL_INVITE_LIMIT';
  END IF;
  IF (
    SELECT count(*) FROM public.grocery_haul_invitations
    WHERE owner_person_id = p_actor_person_id AND status = 'pending'
  ) >= 20 THEN
    RAISE EXCEPTION 'HAUL_INVITE_LIMIT';
  END IF;

  -- Resolve to an existing Fine Diet person by normalized email when there is
  -- one. This is identity RESOLUTION only; it is never authorization.
  SELECT id, auth_user_id INTO v_person_id, v_person_auth
  FROM public.people
  WHERE lower(btrim(email)) = v_email
  LIMIT 1;

  INSERT INTO public.grocery_haul_invitations (
    haul_id, owner_person_id, invited_email_normalized, invited_person_id
  ) VALUES (
    p_haul_id, p_actor_person_id, v_email, v_person_id
  )
  RETURNING * INTO v_invitation;

  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id,
    'haul_id', v_invitation.haul_id,
    'status', v_invitation.status,
    'invited_email_normalized', v_invitation.invited_email_normalized,
    'invited_person_id', v_invitation.invited_person_id,
    'invited_account_linked', v_person_auth IS NOT NULL,
    'outcome', 'created'
  );
END;
$$;

-- Owner: revoke a pending invitation or remove an accepted member.
-- Contributor items are retained (attribution is historical truth).
CREATE OR REPLACE FUNCTION public.revoke_grocery_haul_invitation(
  p_actor_person_id UUID,
  p_haul_id UUID,
  p_invitation_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_haul public.grocery_hauls%ROWTYPE;
  v_invitation public.grocery_haul_invitations%ROWTYPE;
  v_previous TEXT;
BEGIN
  IF p_actor_person_id IS NULL OR p_haul_id IS NULL OR p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'HAUL_INVITE_INVALID_ARGS';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = p_actor_person_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'HAUL_INVITE_FORBIDDEN';
  END IF;

  SELECT * INTO v_haul
  FROM public.grocery_hauls
  WHERE id = p_haul_id
  FOR UPDATE;
  IF NOT FOUND OR v_haul.person_id <> p_actor_person_id THEN
    RAISE EXCEPTION 'HAUL_INVITE_NOT_FOUND';
  END IF;

  SELECT * INTO v_invitation
  FROM public.grocery_haul_invitations
  WHERE id = p_invitation_id
    AND haul_id = p_haul_id
    AND owner_person_id = p_actor_person_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HAUL_INVITE_NOT_FOUND';
  END IF;

  IF v_invitation.status = 'revoked' THEN
    RETURN jsonb_build_object(
      'invitation_id', v_invitation.id,
      'haul_id', v_invitation.haul_id,
      'status', 'revoked',
      'previous_status', 'revoked',
      'outcome', 'noop'
    );
  END IF;

  v_previous := v_invitation.status;
  UPDATE public.grocery_haul_invitations
  SET status = 'revoked', revoked_at = now()
  WHERE id = v_invitation.id
  RETURNING * INTO v_invitation;

  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id,
    'haul_id', v_invitation.haul_id,
    'status', 'revoked',
    'previous_status', v_previous,
    'outcome', 'revoked'
  );
END;
$$;

-- Invitee: accept. Binds the invitation to the linked people row whose
-- normalized email matches the invitation target. Email alone is not enough:
-- the caller must be an authenticated, LINKED account (people.auth_user_id).
-- The server additionally requires a confirmed Auth email before calling this.
CREATE OR REPLACE FUNCTION public.accept_grocery_haul_invitation(
  p_actor_person_id UUID,
  p_invitation_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_person_email TEXT;
  v_person_auth UUID;
  v_invitation public.grocery_haul_invitations%ROWTYPE;
BEGIN
  IF p_actor_person_id IS NULL OR p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'HAUL_INVITE_INVALID_ARGS';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = p_actor_person_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'HAUL_INVITE_FORBIDDEN';
  END IF;

  SELECT lower(btrim(email)), auth_user_id
  INTO v_person_email, v_person_auth
  FROM public.people WHERE id = p_actor_person_id;
  IF v_person_email IS NULL THEN
    RAISE EXCEPTION 'HAUL_INVITE_FORBIDDEN';
  END IF;
  IF v_person_auth IS NULL THEN
    RAISE EXCEPTION 'HAUL_INVITE_ACCOUNT_NOT_LINKED';
  END IF;

  SELECT * INTO v_invitation
  FROM public.grocery_haul_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HAUL_INVITE_NOT_FOUND';
  END IF;

  IF v_invitation.invited_email_normalized IS DISTINCT FROM v_person_email THEN
    RAISE EXCEPTION 'HAUL_INVITE_IDENTITY_MISMATCH';
  END IF;
  IF v_invitation.owner_person_id = p_actor_person_id THEN
    RAISE EXCEPTION 'HAUL_INVITE_SELF';
  END IF;

  IF v_invitation.status = 'revoked' THEN
    RAISE EXCEPTION 'HAUL_INVITE_REVOKED';
  END IF;
  IF v_invitation.status = 'accepted' THEN
    IF v_invitation.invited_person_id IS DISTINCT FROM p_actor_person_id THEN
      RAISE EXCEPTION 'HAUL_INVITE_IDENTITY_MISMATCH';
    END IF;
    RETURN jsonb_build_object(
      'invitation_id', v_invitation.id,
      'haul_id', v_invitation.haul_id,
      'status', 'accepted',
      'outcome', 'already_accepted'
    );
  END IF;

  UPDATE public.grocery_haul_invitations
  SET status = 'accepted',
      invited_person_id = p_actor_person_id,
      accepted_at = now()
  WHERE id = v_invitation.id
  RETURNING * INTO v_invitation;

  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id,
    'haul_id', v_invitation.haul_id,
    'status', 'accepted',
    'outcome', 'accepted'
  );
END;
$$;

-- Contributor: add a Haul-only item to a Draft Haul. The item is owned
-- (person_id) by the Haul owner and attributed (added_by_person_id) to the
-- contributor. Contributors cannot set pricing, product, store or readiness
-- fields; those remain owner-only preparation controls.
CREATE OR REPLACE FUNCTION public.add_grocery_haul_contributor_item(
  p_actor_person_id UUID,
  p_haul_id UUID,
  p_name TEXT,
  p_quantity NUMERIC,
  p_unit TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_haul_status TEXT;
  v_owner UUID;
  v_name TEXT;
  v_unit TEXT;
  v_quantity NUMERIC;
  v_item public.grocery_haul_items%ROWTYPE;
BEGIN
  IF p_actor_person_id IS NULL OR p_haul_id IS NULL THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_INVALID_ARGS';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = p_actor_person_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF v_name = '' OR char_length(v_name) > 200 THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_INVALID_ITEM';
  END IF;
  v_unit := NULLIF(btrim(COALESCE(p_unit, '')), '');
  IF v_unit IS NOT NULL AND char_length(v_unit) > 40 THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_INVALID_ITEM';
  END IF;
  v_quantity := COALESCE(p_quantity, 1);
  IF v_quantity <= 0 OR v_quantity > 100000 THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_INVALID_ITEM';
  END IF;

  -- FOR SHARE: serializes against start_grocery_haul_execution (FOR UPDATE), so
  -- an item is either in the Haul before activation seeds it or rejected as
  -- not-Draft; it can never slip in half-way.
  SELECT status, person_id INTO v_haul_status, v_owner
  FROM public.grocery_hauls
  WHERE id = p_haul_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
  END IF;

  -- Membership row is share-locked so a concurrent revoke cannot interleave.
  PERFORM 1 FROM public.grocery_haul_invitations
  WHERE haul_id = p_haul_id
    AND invited_person_id = p_actor_person_id
    AND status = 'accepted'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
  END IF;

  IF v_haul_status <> 'planned' THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_NOT_DRAFT';
  END IF;

  IF (
    SELECT count(*) FROM public.grocery_haul_items
    WHERE haul_id = p_haul_id
      AND origin_type = 'haul_contributor'
      AND added_by_person_id = p_actor_person_id
  ) >= 100 THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_ITEM_LIMIT';
  END IF;

  INSERT INTO public.grocery_haul_items (
    haul_id, person_id, source_grocery_list_id, grocery_item_id,
    name_snapshot, quantity_snapshot, unit_snapshot,
    source_status_snapshot, final_quantity,
    origin_type, added_by_person_id
  ) VALUES (
    p_haul_id, v_owner, NULL, NULL,
    v_name, v_quantity, v_unit,
    'pending', v_quantity,
    'haul_contributor', p_actor_person_id
  )
  RETURNING * INTO v_item;

  RETURN to_jsonb(v_item);
END;
$$;

-- Contributor (own items) or Owner (any contributor item): edit content.
-- p_patch keys (all optional): name, quantity, unit. A present key is applied
-- (unit: null clears); an absent key is left alone. final_quantity follows the
-- requested quantity ONLY while it still equals the previous requested
-- quantity, so an owner adjustment (or exclusion via 0) is never overwritten.
CREATE OR REPLACE FUNCTION public.update_grocery_haul_contributor_item(
  p_actor_person_id UUID,
  p_haul_id UUID,
  p_item_id UUID,
  p_patch JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_haul public.grocery_hauls%ROWTYPE;
  v_is_owner BOOLEAN;
  v_item public.grocery_haul_items%ROWTYPE;
  v_name TEXT;
  v_unit TEXT;
  v_quantity NUMERIC;
  v_final NUMERIC;
  v_updated public.grocery_haul_items%ROWTYPE;
BEGIN
  IF p_actor_person_id IS NULL OR p_haul_id IS NULL OR p_item_id IS NULL
     OR p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_INVALID_ARGS';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = p_actor_person_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
  END IF;

  SELECT * INTO v_haul
  FROM public.grocery_hauls
  WHERE id = p_haul_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
  END IF;

  v_is_owner := v_haul.person_id = p_actor_person_id;
  IF NOT v_is_owner THEN
    PERFORM 1 FROM public.grocery_haul_invitations
    WHERE haul_id = p_haul_id
      AND invited_person_id = p_actor_person_id
      AND status = 'accepted'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
    END IF;
  END IF;

  SELECT * INTO v_item
  FROM public.grocery_haul_items
  WHERE id = p_item_id
    AND haul_id = p_haul_id
    AND person_id = v_haul.person_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_ITEM_NOT_FOUND';
  END IF;

  IF v_item.origin_type <> 'haul_contributor' THEN
    -- Source-List snapshot rows are never editable through this path.
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
  END IF;
  IF NOT v_is_owner AND v_item.added_by_person_id IS DISTINCT FROM p_actor_person_id THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
  END IF;

  IF v_haul.status <> 'planned' THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_NOT_DRAFT';
  END IF;

  v_name := v_item.name_snapshot;
  v_unit := v_item.unit_snapshot;
  v_quantity := v_item.quantity_snapshot;
  v_final := v_item.final_quantity;

  IF p_patch ? 'name' THEN
    v_name := btrim(COALESCE(p_patch ->> 'name', ''));
    IF v_name = '' OR char_length(v_name) > 200 THEN
      RAISE EXCEPTION 'HAUL_CONTRIBUTOR_INVALID_ITEM';
    END IF;
  END IF;
  IF p_patch ? 'unit' THEN
    v_unit := NULLIF(btrim(COALESCE(p_patch ->> 'unit', '')), '');
    IF v_unit IS NOT NULL AND char_length(v_unit) > 40 THEN
      RAISE EXCEPTION 'HAUL_CONTRIBUTOR_INVALID_ITEM';
    END IF;
  END IF;
  IF p_patch ? 'quantity' THEN
    IF jsonb_typeof(p_patch -> 'quantity') <> 'number' THEN
      RAISE EXCEPTION 'HAUL_CONTRIBUTOR_INVALID_ITEM';
    END IF;
    v_quantity := (p_patch ->> 'quantity')::NUMERIC;
    IF v_quantity <= 0 OR v_quantity > 100000 THEN
      RAISE EXCEPTION 'HAUL_CONTRIBUTOR_INVALID_ITEM';
    END IF;
    IF v_item.final_quantity IS NOT DISTINCT FROM v_item.quantity_snapshot THEN
      v_final := v_quantity;
    END IF;
  END IF;

  UPDATE public.grocery_haul_items
  SET name_snapshot = v_name,
      unit_snapshot = v_unit,
      quantity_snapshot = v_quantity,
      final_quantity = v_final
  WHERE id = v_item.id
  RETURNING * INTO v_updated;

  RETURN to_jsonb(v_updated);
END;
$$;

-- Contributor (own items) or Owner (any contributor item): remove.
CREATE OR REPLACE FUNCTION public.remove_grocery_haul_contributor_item(
  p_actor_person_id UUID,
  p_haul_id UUID,
  p_item_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_haul public.grocery_hauls%ROWTYPE;
  v_is_owner BOOLEAN;
  v_item public.grocery_haul_items%ROWTYPE;
BEGIN
  IF p_actor_person_id IS NULL OR p_haul_id IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_INVALID_ARGS';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = p_actor_person_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
  END IF;

  SELECT * INTO v_haul
  FROM public.grocery_hauls
  WHERE id = p_haul_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
  END IF;

  v_is_owner := v_haul.person_id = p_actor_person_id;
  IF NOT v_is_owner THEN
    PERFORM 1 FROM public.grocery_haul_invitations
    WHERE haul_id = p_haul_id
      AND invited_person_id = p_actor_person_id
      AND status = 'accepted'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
    END IF;
  END IF;

  SELECT * INTO v_item
  FROM public.grocery_haul_items
  WHERE id = p_item_id
    AND haul_id = p_haul_id
    AND person_id = v_haul.person_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_ITEM_NOT_FOUND';
  END IF;

  IF v_item.origin_type <> 'haul_contributor' THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
  END IF;
  IF NOT v_is_owner AND v_item.added_by_person_id IS DISTINCT FROM p_actor_person_id THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_FORBIDDEN';
  END IF;

  IF v_haul.status <> 'planned' THEN
    RAISE EXCEPTION 'HAUL_CONTRIBUTOR_NOT_DRAFT';
  END IF;

  DELETE FROM public.grocery_haul_items WHERE id = v_item.id;

  RETURN jsonb_build_object(
    'item_id', v_item.id,
    'haul_id', v_item.haul_id,
    'outcome', 'removed'
  );
END;
$$;

-- EXECUTE: service_role only. No PUBLIC / anon / authenticated.
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.create_grocery_haul_invitation(uuid, uuid, text)',
    'public.revoke_grocery_haul_invitation(uuid, uuid, uuid)',
    'public.accept_grocery_haul_invitation(uuid, uuid)',
    'public.add_grocery_haul_contributor_item(uuid, uuid, text, numeric, text)',
    'public.update_grocery_haul_contributor_item(uuid, uuid, uuid, jsonb)',
    'public.remove_grocery_haul_contributor_item(uuid, uuid, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END
$$;

-- ============================================================================
-- Verification (run after apply; every query should return zero rows)
-- ============================================================================
-- SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosecdef
--     AND proname LIKE '%haul%';                                  -- no SECURITY DEFINER
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'grocery_haul_invitations'
--     AND grantee IN ('anon', 'authenticated') AND privilege_type <> 'SELECT';
-- SELECT id FROM public.grocery_haul_items
--   WHERE origin_type = 'haul_contributor' AND source_grocery_list_id IS NOT NULL;
