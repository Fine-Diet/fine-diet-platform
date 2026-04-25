# Open Food Facts (OFF) — Mirror & Search Fallback

This project mirrors a **coverage-first** subset of Open Food Facts into Supabase and uses it as a **last-resort** search layer when USDA / curated results are empty.

## Architecture (already wired in code)

1. **`off_products_mirror`** — normalized OFF rows + `raw_off_payload` JSONB  
2. **`off_product_search_aliases`** — name/brand/barcode strings for matching (rebuilt each batch on import)  
3. **`off_import_runs`** — one row per import run with counts  
4. **Search** (`lib/food/foodServerService.ts`): after USDA results, if still no hits → `searchOffFallback()` queries `off_products_mirror` (ILIKE on `product_name` / `brands`).  
5. **Promotions** (optional): run `scripts/sql/phase3OffMirror.sql` and `phase4OffPromotions.sql` for admin review queue (`/admin/off-promotions`).

Nutrition in the mirror is **per 100g** (OFF convention). The UI maps that to display via `normalizeOffRow()` in `lib/food/offNormalization.ts`.

---

## 1. Run SQL migrations (Supabase → SQL Editor)

**Order matters.**

| Order | File | Purpose |
|-------|------|---------|
| 1 | `scripts/sql/createOffMirrorTables.sql` | `off_import_runs`, `off_products_mirror`, `off_product_search_aliases` |
| 2 | `scripts/sql/alterOffImportRunsAddSkipReasons.sql` | Extra columns on `off_import_runs` (required by importer) |
| 3 | `scripts/sql/alterOffImportRunsAddExecutionConfig.sql` | Records `max_kept_used` and `batch_size_used` on `off_import_runs` |
| 4 | `scripts/sql/alterOffImportRunsAddCoverageCounts.sql` | Adds `records_kept_total` for coverage-first runs |
| 5 | `scripts/sql/alterOffProductsMirrorAddMarketConfidence.sql` | Adds `market_confidence` for market labeling |
| 6 | `scripts/sql/createFoodSearchEvents.sql` | Telemetry (if not already applied) |
| 7 | `scripts/sql/alterFoodSearchEventsPhase3.sql` | Phase 3 columns on `food_search_events` |
| 8 | `scripts/sql/phase3OffMirror.sql` | Promotion candidates + telemetry |
| 9 | `scripts/sql/phase4OffPromotions.sql` | Audit log + review fields |

Skip 6–7 if you only need the mirror + search fallback without the admin promotion workflow.

---

## 2. Download the OFF export

Use the **world** JSONL gzip from Open Food Facts (full product dump), not a country-limited slice:

- See: [Open Food Facts data](https://world.openfoodfacts.org/data) (e.g. `openfoodfacts-products.jsonl.gz`).

Place it at (for example):

```
data/openfoodfacts-products.jsonl.gz
```

The importer now mirrors the full OFF world export and assigns market context in-process:

- `explicit_us`: `countries_tags` includes `en:united-states` or `countries` explicitly mentions the United States / USA
- `likely_us`: UPC-style barcodes plus supporting brand or imperial-packaging signals when OFF country metadata is missing
- `known_non_us`: OFF country metadata points somewhere other than the United States
- `unknown`: no strong market signal is present in OFF metadata

> **Size:** Several GB compressed. Do not commit this file (see `.gitignore`).

---

## 3. Run the importer

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

```bash
# Dry run — parse and classify rows only (no DB writes)
npx tsx scripts/importOpenFoodFactsPhase1.ts \
  --file data/openfoodfacts-products.jsonl.gz \
  --dry-run \
  --max-kept 5000

# Full import (can take hours; streams gzip)
npx tsx scripts/importOpenFoodFactsPhase1.ts \
  --file data/openfoodfacts-products.jsonl.gz

# Limit for testing
npx tsx scripts/importOpenFoodFactsPhase1.ts \
  --file data/openfoodfacts-products.jsonl.gz \
  --max-kept 50000
```

Options:

| Flag | Description |
|------|-------------|
| `--file PATH` | **Required.** Path to `.jsonl.gz` |
| `--max-kept N` | Stop after N mirrored products are classified/imported |
| `--dry-run` | No database writes |
| `--batch N` | Upsert batch size (default 500) |

Re-runs **upsert** on `off_product_id` — safe to run again after a new dump.

---

## 4. Verify

- **Supabase:** `SELECT count(*) FROM off_products_mirror;`
- **App:** Search for a product that is **not** in USDA but should exist in OFF (e.g. obscure brand). Results should appear under the OFF fallback section when USDA returns nothing.

---

## 5. Troubleshooting

| Issue | Cause |
|-------|--------|
| `Failed to create import run` | Run `createOffMirrorTables.sql` + `alterOffImportRunsAddSkipReasons.sql` |
| No OFF results in search | Mirror empty or query doesn’t match `product_name`/`brands` (first token); ensure import finished |
| `column ... does not exist` | Run migrations in the order above |

---

## Related files

- `scripts/importOpenFoodFactsPhase1.ts` — importer  
- `lib/food/offNormalization.ts` — serving display helpers  
- `lib/food/foodServerService.ts` — `searchOffFallback`, `searchPromotedOffFoods`  
- `pages/admin/off-promotions.tsx` — promotion queue (after Phase 3+4 SQL)
