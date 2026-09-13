-- ============================================================================
-- NDS Integrity v1 — Step 03: CONTRACT phase
-- ============================================================================
--
-- Packet: FD-PLATFORM-NDS-01. Run ONLY after steps 01 and 02 are applied AND the
-- application deployment that reads/writes the new contract is fully live and
-- healthy. Until then the legacy queue must keep running.
--
-- LOCAL APPLICATION ONLY by the packet that produced it.
--
-- This step removes the legacy enqueue path. It is deliberately the LAST step
-- and is separated from expand so that a rollback of the application does not
-- require a rollback of DDL.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Preconditions — abort rather than contract on an unready database
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_unversioned BIGINT;
  v_outstanding BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = 'public.nds_recompute_work'::regclass
  ) THEN
    RAISE EXCEPTION 'nds_recompute_work is missing: apply step 02 before contracting';
  END IF;

  -- Every score that the new resolver will serve as `fresh` must carry a source
  -- revision. Rows without one are not grandfathered; they are recomputed.
  SELECT COUNT(*) INTO v_unversioned
  FROM public.daily_nds
  WHERE source_revision IS NULL;

  IF v_unversioned > 0 THEN
    RAISE NOTICE 'daily_nds has % rows without source_revision; they will be treated as invalid and recomputed on read.', v_unversioned;
  END IF;

  SELECT COUNT(*) INTO v_outstanding
  FROM public.nds_recompute_queue
  WHERE status IN ('pending', 'processing');

  IF v_outstanding > 0 THEN
    RAISE EXCEPTION 'legacy nds_recompute_queue still has % pending/processing rows; drain via the new worker before contracting', v_outstanding;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Remove the legacy enqueue trigger
-- ---------------------------------------------------------------------------
-- The legacy trigger derived date_local from the server's UTC interpretation and
-- coalesced on (person_id, date_local, status). Both are superseded.

DROP TRIGGER IF EXISTS trigger_enqueue_nds_recompute ON public.journal_entries;
DROP FUNCTION IF EXISTS public.enqueue_nds_recompute();

-- The legacy table is RETAINED, not dropped. Keeping it preserves operational
-- history and makes step 99 a pure reversal of this migration rather than a
-- destructive change.
COMMENT ON TABLE public.nds_recompute_queue IS
  'DEPRECATED by NDS Integrity v1. Superseded by nds_recompute_work. Retained read-only for history; no trigger writes to it.';

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
SELECT trigger_name
FROM information_schema.triggers
WHERE event_object_table = 'journal_entries'
ORDER BY trigger_name;

SELECT COUNT(*) AS legacy_queue_rows_retained FROM public.nds_recompute_queue;
