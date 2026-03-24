/**
 * Open Food Facts Phase 1 Importer
 *
 * One-off/manual import of OFF JSONL gzip export.
 * Filters to U.S.-only products. Does NOT integrate with search or curated foods.
 *
 * Usage:
 *   npx tsx scripts/importOpenFoodFactsPhase1.ts --file data/openfoodfacts-products.jsonl.gz
 *   npx tsx scripts/importOpenFoodFactsPhase1.ts --file data/openfoodfacts-products.jsonl.gz --max-kept 10000
 *   npx tsx scripts/importOpenFoodFactsPhase1.ts --file data/openfoodfacts-products.jsonl.gz --max-kept 100
 *
 * Options:
 *   --file PATH        Path to JSONL .gz file (REQUIRED)
 *   --max-kept N       Max U.S. products to import (default: no limit for full run)
 *   --dry-run          Parse and count only, no DB writes
 *   --batch N          Batch size (default: 500)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as zlib from 'zlib';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OffProductRaw {
  code?: string;
  product_name?: string;
  generic_name?: string;
  brands?: string;
  brand_owner?: string;
  quantity?: string;
  serving_size?: string;
  categories?: string;
  categories_tags?: string[];
  countries?: string;
  countries_tags?: string[];
  ingredients_text?: string;
  allergens?: string;
  allergens_tags?: string[];
  labels?: string;
  labels_tags?: string[];
  image_url?: string;
  image_front_url?: string;
  image_nutrition_url?: string;
  nutriments?: Record<string, unknown>;
  nutriscore_grade?: string;
  nova_group?: number;
  ecoscore_grade?: string;
  created_t?: number;
  last_modified_t?: number;
  [key: string]: unknown;
}

interface OffProductRow {
  off_product_id: string;
  barcode: string | null;
  product_name: string | null;
  generic_name: string | null;
  brands: string | null;
  brand_owner: string | null;
  quantity: string | null;
  serving_size: string | null;
  categories: string | null;
  categories_tags: string[] | null;
  countries: string | null;
  countries_tags: string[] | null;
  ingredients_text: string | null;
  allergens: string | null;
  labels: string[] | null;
  image_url: string | null;
  image_front_url: string | null;
  image_nutrition_url: string | null;
  energy_kcal_100g: number | null;
  protein_g_100g: number | null;
  carbs_g_100g: number | null;
  fat_g_100g: number | null;
  fiber_g_100g: number | null;
  sugars_g_100g: number | null;
  sodium_mg_100g: number | null;
  salt_g_100g: number | null;
  nutriscore_grade: string | null;
  nova_group: number | null;
  ecoscore_grade: string | null;
  off_created_t: number | null;
  off_last_modified_t: number | null;
  raw_off_payload: OffProductRaw;
  import_run_id: string;
}

interface ParsedArgs {
  file: string;
  maxKept: number | null;
  dryRun: boolean;
  batchSize: number;
}

// ---------------------------------------------------------------------------
// US filter
// ---------------------------------------------------------------------------

function isUsProduct(p: OffProductRaw): boolean {
  const tags = p.countries_tags;
  if (Array.isArray(tags) && tags.some((t) => String(t).toLowerCase() === 'en:united-states')) {
    return true;
  }
  const countries = p.countries;
  if (typeof countries === 'string') {
    const lower = countries.toLowerCase();
    if (lower.includes('united states') || lower.includes('usa')) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Field mapping
// ---------------------------------------------------------------------------

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toStrArr(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const arr = v.map((x) => String(x).trim()).filter(Boolean);
  return arr.length ? arr : null;
}

function mapProduct(raw: OffProductRaw, importRunId: string): OffProductRow | null {
  const code = raw.code ?? raw._id;
  const offProductId = typeof code === 'string' && code.trim() ? code.trim() : null;
  if (!offProductId) return null;

  const nut = raw.nutriments ?? {};
  const sodium100g = toNum(nut.sodium_100g);
  const sodiumMg = sodium100g != null ? sodium100g * 1000 : null;

  const labels = toStrArr(raw.labels_tags ?? raw.labels);
  const allergens = toStr(raw.allergens) ?? (Array.isArray(raw.allergens_tags) && raw.allergens_tags.length
    ? (raw.allergens_tags as string[]).join(', ')
    : null);

  return {
    off_product_id: offProductId,
    barcode: toStr(raw.code ?? offProductId),
    product_name: toStr(raw.product_name),
    generic_name: toStr(raw.generic_name),
    brands: toStr(raw.brands),
    brand_owner: toStr(raw.brand_owner),
    quantity: toStr(raw.quantity),
    serving_size: toStr(raw.serving_size),
    categories: toStr(raw.categories),
    categories_tags: toStrArr(raw.categories_tags),
    countries: toStr(raw.countries),
    countries_tags: toStrArr(raw.countries_tags),
    ingredients_text: toStr(raw.ingredients_text),
    allergens: allergens ? toStr(allergens) : null,
    labels,
    image_url: toStr(raw.image_url),
    image_front_url: toStr(raw.image_front_url),
    image_nutrition_url: toStr(raw.image_nutrition_url),
    energy_kcal_100g: toNum(nut['energy-kcal_100g'] ?? nut.energy_kcal_100g),
    protein_g_100g: toNum(nut.proteins_100g),
    carbs_g_100g: toNum(nut.carbohydrates_100g),
    fat_g_100g: toNum(nut.fat_100g),
    fiber_g_100g: toNum(nut.fiber_100g),
    sugars_g_100g: toNum(nut.sugars_100g),
    sodium_mg_100g: sodiumMg,
    salt_g_100g: toNum(nut.salt_100g),
    nutriscore_grade: toStr(raw.nutriscore_grade),
    nova_group: toNum(raw.nova_group) != null ? Math.round(toNum(raw.nova_group)!) : null,
    ecoscore_grade: toStr(raw.ecoscore_grade),
    off_created_t: typeof raw.created_t === 'number' ? raw.created_t : null,
    off_last_modified_t: typeof raw.last_modified_t === 'number' ? raw.last_modified_t : null,
    raw_off_payload: raw,
    import_run_id: importRunId,
  };
}

function collectAliases(row: OffProductRow): Array<{ off_product_id: string; source: 'product_name' | 'generic_name' | 'brands' | 'barcode'; value: string }> {
  const out: Array<{ off_product_id: string; source: 'product_name' | 'generic_name' | 'brands' | 'barcode'; value: string }> = [];
  const id = row.off_product_id;
  if (row.product_name) out.push({ off_product_id: id, source: 'product_name', value: row.product_name });
  if (row.generic_name) out.push({ off_product_id: id, source: 'generic_name', value: row.generic_name });
  if (row.brands) out.push({ off_product_id: id, source: 'brands', value: row.brands });
  if (row.barcode) out.push({ off_product_id: id, source: 'barcode', value: row.barcode });
  return out;
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let file = '';
  let maxKept: number | null = null;
  let dryRun = false;
  let batchSize = 500;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' && args[i + 1]) {
      file = args[++i].trim();
    } else if (arg === '--max-kept' && args[i + 1]) {
      maxKept = parseInt(args[++i], 10);
      if (isNaN(maxKept) || maxKept < 1) maxKept = null;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--batch' && args[i + 1]) {
      batchSize = parseInt(args[++i], 10);
      if (isNaN(batchSize) || batchSize < 1) batchSize = 500;
    }
  }

  if (!file) {
    console.error('❌ Missing required --file');
    console.error('');
    console.error('Usage: npx tsx scripts/importOpenFoodFactsPhase1.ts --file <PATH> [options]');
    console.error('  --file PATH     Path to JSONL .gz (REQUIRED)');
    console.error('  --max-kept N    Max U.S. products to import (e.g. 10000)');
    console.error('  --dry-run       Parse and count only');
    console.error('  --batch N       Batch size (default: 500)');
    process.exit(1);
  }

  return { file, maxKept, dryRun, batchSize };
}

// ---------------------------------------------------------------------------
// Stream JSONL from gzip
// ---------------------------------------------------------------------------

async function* readJsonlGz(filePath: string): AsyncGenerator<OffProductRaw> {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error('File not found: ' + resolved);
  }
  const stream = fs.createReadStream(resolved).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as OffProductRaw | { product?: OffProductRaw };
      const obj = (parsed as { product?: OffProductRaw }).product ?? (parsed as OffProductRaw);
      yield obj;
    } catch {
      // Skip malformed lines
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let importRunId: string | null = null;
  const runErrors: string[] = [];
  let runFinalized = false;

  if (!opts.dryRun) {
    const { data: run, error } = await supabase
      .from('off_import_runs')
      .insert({
        records_seen: 0,
        records_kept_us: 0,
        records_inserted: 0,
        records_updated: 0,
        records_skipped: 0,
        records_skipped_no_id: 0,
        records_skipped_upsert_error: 0,
        status: 'running',
        source_file: opts.file,
      })
      .select('id')
      .single();
    if (error) {
      console.error('❌ Failed to create import run:', error.message);
      process.exit(1);
    }
    importRunId = run.id;
    console.log('   Import run ID:', importRunId);
  }

  console.log('\n' + '='.repeat(70));
  console.log('📦 Open Food Facts Phase 1 Import');
  console.log('   File:', opts.file);
  if (opts.maxKept) console.log('   Max kept (U.S.):', opts.maxKept);
  if (opts.dryRun) console.log('   🔍 DRY RUN');
  console.log('='.repeat(70));

  let recordsSeen = 0;
  let recordsKeptUs = 0;
  let recordsInserted = 0;
  let recordsUpdated = 0;
  let recordsSkippedNoId = 0;
  let recordsSkippedUpsertError = 0;
  const startTime = Date.now();
  let productBatch: OffProductRow[] = [];
  let aliasBatch: Array<{ off_product_id: string; source: string; value: string }> = [];

  const finalizeRun = async (status: 'completed' | 'failed', extraError?: string): Promise<void> => {
    if (runFinalized || !importRunId) return;
    runFinalized = true;
    const errorSummary = [...runErrors, extraError].filter(Boolean).join('\n') || null;
    await supabase
      .from('off_import_runs')
      .update({
        finished_at: new Date().toISOString(),
        records_seen: recordsSeen,
        records_kept_us: recordsKeptUs,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_skipped: recordsSkippedNoId + recordsSkippedUpsertError,
        records_skipped_no_id: recordsSkippedNoId,
        records_skipped_upsert_error: recordsSkippedUpsertError,
        status,
        error_summary: errorSummary,
      })
      .eq('id', importRunId);
  };

  shutdownFinalize = async () => {
    if (importRunId && !runFinalized) {
      await finalizeRun('failed', 'Process interrupted (SIGINT/SIGTERM)');
    }
  };

  const upsertRows = async (
    rows: OffProductRow[],
    existingSet: Set<string>
  ): Promise<{ ok: boolean; error: unknown }> => {
    const payload = rows.map((r) => ({ ...r, last_seen_at: new Date().toISOString() }));
    const { error } = await supabase
      .from('off_products_mirror')
      .upsert(payload, { onConflict: 'off_product_id', ignoreDuplicates: false });
    if (error) return { ok: false, error };
    for (const row of rows) {
      if (existingSet.has(row.off_product_id)) recordsUpdated++;
      else recordsInserted++;
    }
    return { ok: true, error: null };
  };

  const flushProducts = async (): Promise<void> => {
    if (productBatch.length === 0 || opts.dryRun) return;
    const ids = productBatch.map((r) => r.off_product_id);
    const { data: existing } = await supabase
      .from('off_products_mirror')
      .select('off_product_id')
      .in('off_product_id', ids);
    const existingSet = new Set((existing ?? []).map((r) => r.off_product_id));
    const rows = productBatch.map((row) => ({ ...row }));
    productBatch = [];

    const doRetryWithSubBatches = async (
      batch: OffProductRow[],
      err: unknown
    ): Promise<void> => {
      const errStr =
        err instanceof Error ? err.message : JSON.stringify(err ?? 'Unknown error');
      console.error('[OFF Import] Batch upsert failed, retrying with sub-batches:', errStr);
      runErrors.push(`Batch (${batch.length} rows): ${errStr}`);

      if (batch.length <= 1) {
        for (const row of batch) {
          const { ok, error: rowErr } = await upsertRows([row], existingSet);
          if (!ok) {
            recordsSkippedUpsertError++;
            const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
            runErrors.push(`Row ${row.off_product_id}: ${msg}`);
          }
        }
        return;
      }

      const mid = Math.floor(batch.length / 2);
      const left = batch.slice(0, mid);
      const right = batch.slice(mid);
      for (const sub of [left, right]) {
        const { ok, error: subErr } = await upsertRows(sub, existingSet);
        if (!ok) await doRetryWithSubBatches(sub, subErr);
      }
    };

    const { ok, error } = await upsertRows(rows, existingSet);
    if (!ok) {
      const errStr = error instanceof Error ? error.message : JSON.stringify(error ?? 'Unknown');
      console.error('[OFF Import] Upsert error:', errStr);
      await doRetryWithSubBatches(rows, error);
    }
  };

  const flushAliases = async (): Promise<void> => {
    if (aliasBatch.length === 0 || opts.dryRun) return;
    const productIds = Array.from(new Set(aliasBatch.map((a) => a.off_product_id)));
    for (const pid of productIds) {
      await supabase.from('off_product_search_aliases').delete().eq('off_product_id', pid);
    }
    if (aliasBatch.length > 0) {
      await supabase.from('off_product_search_aliases').insert(aliasBatch);
    }
    aliasBatch = [];
  };

  try {
    for await (const raw of readJsonlGz(opts.file)) {
      recordsSeen++;
      if (recordsSeen % 50000 === 0) {
        console.log(`   Seen: ${recordsSeen.toLocaleString()} | Kept: ${recordsKeptUs.toLocaleString()}`);
      }

      if (!isUsProduct(raw)) continue;
      recordsKeptUs++;

      if (opts.maxKept != null && recordsKeptUs > opts.maxKept) break;

      const row = mapProduct(raw, importRunId ?? '00000000-0000-0000-0000-000000000000');
      if (!row) {
        recordsSkippedNoId++;
        continue;
      }

      productBatch.push(row);
      aliasBatch.push(...collectAliases(row));

      if (productBatch.length >= opts.batchSize) {
        await flushProducts();
        await flushAliases();
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(
          `   📊 Kept: ${recordsKeptUs.toLocaleString()} | Imported: ${(recordsInserted + recordsUpdated).toLocaleString()} | ${(recordsKeptUs / elapsed).toFixed(0)}/s`
        );
      }
    }

    await flushProducts();
    await flushAliases();

    if (!opts.dryRun && importRunId) await finalizeRun('completed');

    const elapsed = (Date.now() - startTime) / 1000;
    const recordsSkipped = recordsSkippedNoId + recordsSkippedUpsertError;
    console.log('\n' + '='.repeat(70));
    console.log('✅ Import complete');
    console.log('='.repeat(70));
    console.log('   Records seen:', recordsSeen.toLocaleString());
    console.log('   Records kept (U.S.):', recordsKeptUs.toLocaleString());
    console.log('   Records inserted:', recordsInserted.toLocaleString());
    console.log('   Records updated:', recordsUpdated.toLocaleString());
    console.log('   Records skipped (no id):', recordsSkippedNoId.toLocaleString());
    console.log('   Records skipped (upsert error):', recordsSkippedUpsertError.toLocaleString());
    console.log('   Records skipped (total):', recordsSkipped.toLocaleString());
    console.log('   Time:', elapsed.toFixed(1) + 's');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[OFF Import] Fatal error:', errMsg);
    if (importRunId) await finalizeRun('failed', errMsg);
    throw err;
  } finally {
    if (!runFinalized && importRunId) {
      await finalizeRun('failed', 'Process interrupted or exited unexpectedly');
    }
  }
}

let shutdownFinalize: (() => Promise<void>) | null = null;

function onInterrupt(signal: string, code: number) {
  return () => {
    (async () => {
      console.error(`\n[OFF Import] Interrupted (${signal})`);
      if (shutdownFinalize) await shutdownFinalize();
      process.exit(code);
    })();
  };
}
process.on('SIGINT', onInterrupt('SIGINT', 130));
process.on('SIGTERM', onInterrupt('SIGTERM', 143));

main()
  .then(() => {
    shutdownFinalize = null;
  })
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
