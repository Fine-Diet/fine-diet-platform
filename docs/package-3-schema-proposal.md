# Package 3 — Schema Proposal (NOT applied)

**Hold:** No production DDL, data mutation, backfill, or cleanup in this package.

Package 3 implements archive + URL dedup in the application layer (`document_json` lifecycle + exact normalized URL match + paginated compatibility scan). Sequential re-import is deterministic; **concurrent uniqueness is not guaranteed** without the unique index below. The following DDL is proposed for a later reviewed migration packet.

## 1. `meal_documents` lifecycle columns

```sql
ALTER TABLE public.meal_documents
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS nutrition_status text NULL;

ALTER TABLE public.meal_documents
  ADD CONSTRAINT meal_documents_nutrition_status_check
  CHECK (
    nutrition_status IS NULL OR nutrition_status IN (
      'calculated', 'imported', 'user_entered', 'unavailable', 'stale', 'unknown'
    )
  );

CREATE INDEX IF NOT EXISTS meal_documents_person_active_updated_idx
  ON public.meal_documents (person_id, updated_at DESC)
  WHERE archived_at IS NULL;
```

**Why:** Indexable library browse without over-fetching JSONB; keeps `review_state` CHECK (`draft|needs_review|confirmed`) intact.

## 2. Normalized import URL for deterministic dedup

```sql
ALTER TABLE public.imported_meals
  ADD COLUMN IF NOT EXISTS normalized_source_url text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS imported_meals_person_normalized_url_uidx
  ON public.imported_meals (person_id, normalized_source_url)
  WHERE normalized_source_url IS NOT NULL;
```

Optional mirror on `meal_documents.normalized_source_url` for library-level uniqueness.

## 3. Explicitly out of scope here

- Dropping `journal_meal_templates`
- Changing `review_state` CHECK to include `archived`
- Backfilling historical rows
- Unique-active plan constraints (Package 4)
