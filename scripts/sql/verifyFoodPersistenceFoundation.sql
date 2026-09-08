-- Packet 2 post-apply verification (read-only).
-- Run only after addFoodPersistenceFoundation.sql in the intended environment.

-- Expected: zero. Every Haul, including pre-migration rows, has its legacy
-- primary source represented in the complete membership set.
SELECT gh.id AS haul_missing_primary_membership
FROM public.grocery_hauls gh
LEFT JOIN public.grocery_haul_source_lists source
  ON source.haul_id = gh.id
 AND source.grocery_list_id = gh.source_grocery_list_id
 AND source.person_id = gh.person_id
WHERE source.haul_id IS NULL;

-- Expected: zero. Membership owner must match both parent records.
SELECT source.haul_id, source.grocery_list_id
FROM public.grocery_haul_source_lists source
LEFT JOIN public.grocery_hauls haul
  ON haul.id = source.haul_id
 AND haul.person_id = source.person_id
LEFT JOIN public.generated_grocery_lists list
  ON list.id = source.grocery_list_id
 AND list.person_id = source.person_id
WHERE haul.id IS NULL OR list.id IS NULL;

-- Expected: zero. Every frozen item source is a same-owner Haul membership.
SELECT item.id AS haul_item_without_source_membership
FROM public.grocery_haul_items item
LEFT JOIN public.grocery_haul_source_lists source
  ON source.haul_id = item.haul_id
 AND source.grocery_list_id = item.source_grocery_list_id
 AND source.person_id = item.person_id
WHERE source.haul_id IS NULL;

-- Expected: zero. Every acquisition lot belongs to its aggregate owner.
SELECT lot.id AS lot_without_owned_pantry_item
FROM public.pantry_acquisition_lots lot
LEFT JOIN public.pantry_on_hand_items pantry
  ON pantry.id = lot.pantry_item_id
 AND pantry.person_id = lot.person_id
WHERE pantry.id IS NULL;

-- Expected: zero. If a source Haul item is recorded, it must belong to the
-- recorded source Haul and owner.
SELECT lot.id AS lot_with_invalid_haul_item_provenance
FROM public.pantry_acquisition_lots lot
LEFT JOIN public.grocery_haul_items item
  ON item.id = lot.source_haul_item_id
 AND item.haul_id = lot.source_haul_id
 AND item.person_id = lot.person_id
WHERE lot.source_haul_item_id IS NOT NULL
  AND item.id IS NULL;

-- Expected: both functions, invoker security, pinned public/pg_temp path.
SELECT
  p.proname,
  p.prosecdef AS is_security_definer,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_grocery_haul_from_list',
    'create_grocery_haul_from_lists'
  )
ORDER BY p.proname;

-- Expected for both: anon=false, authenticated=false, service_role=true.
SELECT
  p.proname,
  has_function_privilege(
    'anon',
    p.oid,
    'EXECUTE'
  ) AS anon_execute,
  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) AS authenticated_execute,
  has_function_privilege(
    'service_role',
    p.oid,
    'EXECUTE'
  ) AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_grocery_haul_from_list',
    'create_grocery_haul_from_lists'
  )
ORDER BY p.proname;
