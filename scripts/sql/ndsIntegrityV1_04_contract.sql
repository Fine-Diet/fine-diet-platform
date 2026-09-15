-- ============================================================================
-- NDS Integrity v1 — Step 03: CONTRACT phase
-- ============================================================================
--
-- Packet: FD-PLATFORM-NDS-01A. Run ONLY after steps 01, 02 and 03 are applied AND
-- the application deployment that reads/writes the new contract is fully live and
-- healthy. Until then the legacy queue must keep running.
--
-- LOCAL APPLICATION ONLY by the packet that produced it.
--
-- This step removes the legacy enqueue path. It is deliberately the LAST step
-- and is separated from expand so that a rollback of the application does not
-- require a rollback of DDL.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Detach the legacy enqueue trigger
-- ---------------------------------------------------------------------------
-- The legacy trigger derived date_local from the server's UTC interpretation and
-- coalesced on (person_id, date_local, status). Both are superseded.
--
-- Detaching comes FIRST. The reviewed version gated on the legacy queue being
-- empty while the trigger was still attached, which was both unreachable (nothing
-- transferred those rows — see step 03) and racy (a journal write could add a row
-- between the check and the drop). Once the trigger is gone the legacy table
-- cannot grow, so the transfer below sees a fixed set.

DROP TRIGGER IF EXISTS trigger_enqueue_nds_recompute ON public.journal_entries;
DROP FUNCTION IF EXISTS public.enqueue_nds_recompute();

-- ---------------------------------------------------------------------------
-- 2. Transfer any remaining legacy work, then assert readiness
-- ---------------------------------------------------------------------------
-- Both are idempotent, so running them here is safe even when the operator
-- already ran the transfer during the step 03 window.

SELECT * FROM public.nds_transfer_legacy_queue();

-- Raises and aborts this migration unless the trigger is detached and every
-- outstanding legacy row has been transferred.
SELECT public.nds_assert_ready_to_contract();

-- ---------------------------------------------------------------------------
-- 3. Deprecate, do not destroy
-- ---------------------------------------------------------------------------
-- The legacy table is RETAINED, not dropped. Keeping it preserves operational
-- history and makes step 99 a pure reversal of this migration rather than a
-- destructive change.
COMMENT ON TABLE public.nds_recompute_queue IS
  'DEPRECATED by NDS Integrity v1. Superseded by nds_recompute_work. Retained read-only for history; no trigger writes to it.';

-- ---------------------------------------------------------------------------
-- 4. Verification (read-only)
-- ---------------------------------------------------------------------------
SELECT trigger_name
FROM information_schema.triggers
WHERE event_object_table = 'journal_entries'
ORDER BY trigger_name;

SELECT COUNT(*) AS legacy_queue_rows_retained FROM public.nds_recompute_queue;

-- Nothing outstanding was abandoned: every retained pending/processing row has a
-- transfer timestamp and a ledger entry.
SELECT
  COUNT(*) FILTER (WHERE q.status IN ('pending', 'processing')) AS legacy_outstanding,
  COUNT(*) FILTER (WHERE q.status IN ('pending', 'processing') AND q.transferred_at IS NULL)
    AS legacy_outstanding_untransferred,
  (SELECT COUNT(*) FROM public.nds_legacy_transfer_ledger) AS transfer_ledger_rows
FROM public.nds_recompute_queue q;
