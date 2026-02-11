# USDA Ingestion Monitoring & Health Checks

This document explains how to monitor USDA FoodData Central ingestion progress and verify data correctness.

## Quick Start

### CLI Health Check (Local)

```bash
# Check all datasets
npx tsx scripts/usda/healthCheck.ts --dataset all

# Check specific dataset
npx tsx scripts/usda/healthCheck.ts --dataset branded

# With custom checkpoint
npx tsx scripts/usda/healthCheck.ts --dataset branded --checkpoint 2500000 --window 20000
```

### Supabase SQL (Dashboard)

Run `scripts/sql/usdaHealthChecks.sql` in Supabase Dashboard → SQL Editor.

---

## Key Metrics to Monitor

### 1. Non-Numeric Source IDs (should be 0)

```sql
SELECT count(*) FROM food_objects
WHERE is_deleted = false AND source_provider = 'usda'
  AND source_id !~ '^[0-9]+$';
```

**Why it matters:** Non-numeric `source_id` values break bigint casts and indicate data corruption. The one known bad row (`id='39eee46d-...'`) should be quarantined with `is_deleted=true`.

### 2. Untagged USDA Rows (should trend to 0)

```sql
SELECT count(*) FROM food_objects
WHERE is_deleted = false AND source_provider = 'usda'
  AND source_dataset IS NULL;
```

**Why it matters:** After backfill + new ingests (with `source_dataset` populated), this should be 0. Non-zero indicates either:
- Backfill hasn't run yet
- Old rows before `source_dataset` was added

### 3. Foundation Still Branded (should be 0)

```sql
SELECT count(*) FROM food_objects
WHERE is_deleted = false AND source_provider = 'usda'
  AND source_dataset = 'foundation' AND source_type != 'common';
```

**Why it matters:** Foundation foods should have `source_type='common'`. If non-zero, the backfill didn't correctly fix misclassified rows.

### 4. Dataset/Type Mismatches (should be 0)

Expected mappings:
| source_dataset | expected source_type |
|----------------|---------------------|
| branded        | branded             |
| foundation     | common              |
| sr_legacy      | common              |
| survey         | common              |

Any deviation indicates a classification bug.

---

## Understanding Ingestion Progress

### Processed vs Inserted vs Skipped

When running the ingestion script, you'll see:

```
📊 Progress: 100,000 processed | 45,000 inserted | 55,000 skipped | 0 failed
```

| Metric | Meaning |
|--------|---------|
| **Processed** | Total CSV rows scanned (including rows already in DB) |
| **Inserted** | New rows actually written to the database |
| **Skipped** | Rows already in DB (deduped by `source_provider + source_id`) |
| **Failed** | Rows that failed to insert (constraint violations, etc.) |

**Why "processed" grows fast but DB total grows slowly:**

- On a resume/re-run, most rows are already in the DB
- The script skips them (upsert with no changes)
- Only truly new rows (higher `fdc_id` than checkpoint) get inserted

### Checkpoint Files

Location: `scripts/usda/.checkpoints/<dataset>.json`

```json
{
  "dataset": "branded",
  "lastFdcId": "2650000",
  "lastSuccessfulFdcId": "2649500",
  "processed": 1500000,
  "inserted": 342000,
  "skipped": 1158000,
  "failed": 0,
  "timestamp": "2026-01-26T15:30:00.000Z"
}
```

| Field | Meaning |
|-------|---------|
| `lastFdcId` | Highest `fdc_id` seen in current run |
| `lastSuccessfulFdcId` | Checkpoint for resume (only advances on successful batch) |
| `processed` | Cumulative rows processed |
| `inserted` | Cumulative rows inserted |

---

## Saved Queries for Supabase

Save these 3 queries in Supabase Dashboard for quick access:

### 1. USDA Health Dashboard

```sql
SELECT 
  (SELECT count(*) FROM food_objects WHERE is_deleted=false AND source_provider='usda') as total_usda,
  (SELECT count(*) FROM food_objects WHERE is_deleted=false AND source_provider='usda' AND source_dataset='branded') as branded,
  (SELECT count(*) FROM food_objects WHERE is_deleted=false AND source_provider='usda' AND source_dataset='foundation') as foundation,
  (SELECT count(*) FROM food_objects WHERE is_deleted=false AND source_provider='usda' AND source_dataset='sr_legacy') as sr_legacy,
  (SELECT count(*) FROM food_objects WHERE is_deleted=false AND source_provider='usda' AND source_dataset='survey') as survey,
  (SELECT count(*) FROM food_objects WHERE is_deleted=false AND source_provider='usda' AND source_dataset IS NULL) as untagged,
  (SELECT count(*) FROM food_objects WHERE is_deleted=false AND source_provider='usda' AND source_id !~ '^[0-9]+$') as non_numeric_ids,
  (SELECT count(*) FROM food_objects WHERE is_deleted=false AND source_provider='usda' AND source_dataset='foundation' AND source_type!='common') as foundation_wrong_type;
```

### 2. Branded Progress Check

Replace `{{CHECKPOINT}}` with your current checkpoint value:

```sql
SELECT 
  count(*) as rows_at_or_above_checkpoint,
  max(CASE WHEN source_id ~ '^[0-9]+$' THEN source_id::bigint END) as max_fdc_id
FROM food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset = 'branded'
  AND source_id ~ '^[0-9]+$'
  AND source_id::bigint >= {{CHECKPOINT}};
```

### 3. FDC_ID Ranges by Dataset

```sql
SELECT 
  source_dataset,
  count(*) as total,
  min(CASE WHEN source_id ~ '^[0-9]+$' THEN source_id::bigint END) as min_fdc_id,
  max(CASE WHEN source_id ~ '^[0-9]+$' THEN source_id::bigint END) as max_fdc_id
FROM food_objects
WHERE is_deleted = false AND source_provider = 'usda'
GROUP BY source_dataset
ORDER BY min_fdc_id NULLS LAST;
```

---

## What "Good" Looks Like

After full ingestion + backfill:

| Metric | Expected Value |
|--------|---------------|
| `non_numeric_ids` | 0 |
| `foundation_still_branded` | 0 |
| `untagged_usda` | 0 |
| `dataset_type_mismatches` | 0 |
| `branded` count | ~340,000+ (growing) |
| `foundation` count | ~78,000 |
| `sr_legacy` count | ~7,800 |
| `survey` count | ~5,500 |

---

## Troubleshooting

### "Checkpoint says done but DB has fewer rows"

The ingestion script has a verification guard. If checkpoint indicates completion but DB count is significantly lower, it will warn and offer options:
- Reset checkpoint: `--reset-checkpoint`
- Continue anyway (may skip valid rows)

### High "skipped" count

Normal on re-runs. The script dedupes by `source_provider + source_id`, so existing rows are skipped.

### Slow progress

Branded dataset is 2M+ foods. At 500 rows/batch with network latency, expect:
- ~4,000 rows/minute = ~8+ hours for full ingestion
- Check `scripts/usda/.checkpoints/branded.json` for real-time progress

### Non-numeric source_id errors

One known bad row exists (quarantined). If you see new ones:
1. Identify: `SELECT * FROM food_objects WHERE source_id !~ '^[0-9]+$' AND is_deleted=false;`
2. Quarantine: `UPDATE food_objects SET is_deleted=true WHERE id='<uuid>';`
