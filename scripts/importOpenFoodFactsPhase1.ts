/**
 * Open Food Facts Phase 1 Importer
 *
 * One-off/manual import of OFF JSONL gzip export.
 * Coverage-first mirror import with market labeling. Does NOT integrate with
 * search ranking or curated foods.
 *
 * Usage:
 *   npx tsx scripts/importOpenFoodFactsPhase1.ts --file data/openfoodfacts-products.jsonl.gz
 *   npx tsx scripts/importOpenFoodFactsPhase1.ts --file data/openfoodfacts-products.jsonl.gz --max-kept 10000
 *   npx tsx scripts/importOpenFoodFactsPhase1.ts --file data/openfoodfacts-products.jsonl.gz --max-kept 100
 *
 * Options:
 *   --file PATH        Path to JSONL .gz file (REQUIRED)
 *   --max-kept N       Max mirrored products to import (default: no limit for full run)
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
  market_confidence: 'explicit_us' | 'likely_us' | 'known_non_us' | 'unknown';
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
  flushDelayMs: number;
}

interface WriteResult {
  ok: boolean;
  error: unknown;
}

interface SanitizedValue<T> {
  value: T;
  removedNullBytes: boolean;
}

const loggedSanitizedRowIds = new Set<string>();

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : JSON.stringify(error ?? 'Unknown error');
}

function isSchemaCacheErrorMessage(message: string): boolean {
  return message.toLowerCase().includes('schema cache');
}

function getRetryDelayMs(message: string, attempt: number): number {
  if (isSchemaCacheErrorMessage(message)) {
    return Math.min(15000, 2000 * attempt);
  }
  return 1000 * attempt;
}

// ---------------------------------------------------------------------------
// Market classification
// ---------------------------------------------------------------------------

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeBarcode(value: unknown): string | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits || null;
}

function hasImperialUnit(value: unknown): boolean {
  if (!hasNonEmptyText(value)) return false;
  return /\b(fl\.?\s?oz|fluid\sounces?|oz|ounces?|lb|lbs|pounds?|qt|quarts?|pt|pints?|gal|gallons?)\b/i.test(String(value));
}

function detectMarketConfidence(
  p: OffProductRaw
): 'explicit_us' | 'likely_us' | 'known_non_us' | 'unknown' {
  const tags = p.countries_tags;
  if (Array.isArray(tags) && tags.some((t) => String(t).toLowerCase() === 'en:united-states')) {
    return 'explicit_us';
  }

  if (Array.isArray(tags) && tags.some((t) => hasNonEmptyText(t))) {
    return 'known_non_us';
  }

  const countries = p.countries;
  if (typeof countries === 'string') {
    const lower = countries.toLowerCase();
    if (lower.includes('united states') || lower.includes('usa')) return 'explicit_us';
    if (lower.trim().length > 0) return 'known_non_us';
  }

  const barcode = normalizeBarcode(p.code);
  const looksLikeUsUpc = barcode != null && (barcode.length === 12 || (barcode.length === 13 && barcode.startsWith('0')));
  const hasBrandMetadata = hasNonEmptyText(p.brands) || hasNonEmptyText(p.brand_owner);
  const hasImperialPackaging = hasImperialUnit(p.quantity) || hasImperialUnit(p.serving_size);

  if (looksLikeUsUpc && (hasImperialPackaging || hasBrandMetadata)) {
    return 'likely_us';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Field mapping
// ---------------------------------------------------------------------------

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function stripNullBytes(value: string): SanitizedValue<string> {
  if (!value.includes('\u0000')) return { value, removedNullBytes: false };
  return { value: value.replace(/\u0000/g, ''), removedNullBytes: true };
}

function sanitizeUnknown<T>(value: T): SanitizedValue<T> {
  if (typeof value === 'string') {
    const sanitized = stripNullBytes(value);
    return { value: sanitized.value as T, removedNullBytes: sanitized.removedNullBytes };
  }

  if (Array.isArray(value)) {
    let removedNullBytes = false;
    const sanitized = value.map((entry) => {
      const result = sanitizeUnknown(entry);
      if (result.removedNullBytes) removedNullBytes = true;
      return result.value;
    });
    return { value: sanitized as T, removedNullBytes };
  }

  if (value && typeof value === 'object') {
    let removedNullBytes = false;
    const sanitizedEntries = Object.entries(value).map(([key, entryValue]) => {
      const sanitizedKey = stripNullBytes(key);
      const sanitizedValue = sanitizeUnknown(entryValue);
      if (sanitizedKey.removedNullBytes || sanitizedValue.removedNullBytes) {
        removedNullBytes = true;
      }
      return [sanitizedKey.value, sanitizedValue.value];
    });
    return { value: Object.fromEntries(sanitizedEntries) as T, removedNullBytes };
  }

  return { value, removedNullBytes: false };
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = stripNullBytes(String(v)).value.trim();
  return s === '' ? null : s;
}

function toStrArr(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const arr = v.map((x) => stripNullBytes(String(x)).value.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapProduct(
  raw: OffProductRaw,
  importRunId: string,
  marketConfidence: 'explicit_us' | 'likely_us' | 'known_non_us' | 'unknown'
): OffProductRow | null {
  const sanitizedRawResult = sanitizeUnknown(raw);
  const sanitizedRaw = sanitizedRawResult.value;
  const code = sanitizedRaw.code ?? sanitizedRaw._id;
  const offProductId = typeof code === 'string' && code.trim() ? code.trim() : null;
  if (!offProductId) return null;

  if (sanitizedRawResult.removedNullBytes && !loggedSanitizedRowIds.has(offProductId)) {
    loggedSanitizedRowIds.add(offProductId);
    console.warn(`[OFF Import] Stripped null bytes from row ${offProductId}`);
  }

  const nut = sanitizedRaw.nutriments ?? {};
  const sodium100g = toNum(nut.sodium_100g);
  const sodiumMg = sodium100g != null ? sodium100g * 1000 : null;

  const labels = toStrArr(sanitizedRaw.labels_tags ?? sanitizedRaw.labels);
  const allergens = toStr(sanitizedRaw.allergens) ?? (Array.isArray(sanitizedRaw.allergens_tags) && sanitizedRaw.allergens_tags.length
    ? (sanitizedRaw.allergens_tags as string[]).join(', ')
    : null);

  return {
    off_product_id: offProductId,
    barcode: toStr(sanitizedRaw.code ?? offProductId),
    market_confidence: marketConfidence,
    product_name: toStr(sanitizedRaw.product_name),
    generic_name: toStr(sanitizedRaw.generic_name),
    brands: toStr(sanitizedRaw.brands),
    brand_owner: toStr(sanitizedRaw.brand_owner),
    quantity: toStr(sanitizedRaw.quantity),
    serving_size: toStr(sanitizedRaw.serving_size),
    categories: toStr(sanitizedRaw.categories),
    categories_tags: toStrArr(sanitizedRaw.categories_tags),
    countries: toStr(sanitizedRaw.countries),
    countries_tags: toStrArr(sanitizedRaw.countries_tags),
    ingredients_text: toStr(sanitizedRaw.ingredients_text),
    allergens: allergens ? toStr(allergens) : null,
    labels,
    image_url: toStr(sanitizedRaw.image_url),
    image_front_url: toStr(sanitizedRaw.image_front_url),
    image_nutrition_url: toStr(sanitizedRaw.image_nutrition_url),
    energy_kcal_100g: toNum(nut['energy-kcal_100g'] ?? nut.energy_kcal_100g),
    protein_g_100g: toNum(nut.proteins_100g),
    carbs_g_100g: toNum(nut.carbohydrates_100g),
    fat_g_100g: toNum(nut.fat_100g),
    fiber_g_100g: toNum(nut.fiber_100g),
    sugars_g_100g: toNum(nut.sugars_100g),
    sodium_mg_100g: sodiumMg,
    salt_g_100g: toNum(nut.salt_100g),
    nutriscore_grade: toStr(sanitizedRaw.nutriscore_grade),
    nova_group: toNum(sanitizedRaw.nova_group) != null ? Math.round(toNum(sanitizedRaw.nova_group)!) : null,
    ecoscore_grade: toStr(sanitizedRaw.ecoscore_grade),
    off_created_t: typeof sanitizedRaw.created_t === 'number' ? sanitizedRaw.created_t : null,
    off_last_modified_t: typeof sanitizedRaw.last_modified_t === 'number' ? sanitizedRaw.last_modified_t : null,
    raw_off_payload: sanitizedRaw,
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
  let flushDelayMs = 0;

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
    } else if (arg === '--flush-delay-ms' && args[i + 1]) {
      flushDelayMs = parseInt(args[++i], 10);
      if (isNaN(flushDelayMs) || flushDelayMs < 0) flushDelayMs = 0;
    }
  }

  if (!file) {
    console.error('❌ Missing required --file');
    console.error('');
    console.error('Usage: npx tsx scripts/importOpenFoodFactsPhase1.ts --file <PATH> [options]');
    console.error('  --file PATH     Path to JSONL .gz (REQUIRED)');
    console.error('  --max-kept N    Max mirrored products to import (e.g. 10000)');
    console.error('  --dry-run       Parse and count only');
    console.error('  --batch N       Batch size (default: 500)');
    console.error('  --flush-delay-ms N  Sleep after each successful flush (default: 0)');
    process.exit(1);
  }

  return { file, maxKept, dryRun, batchSize, flushDelayMs };
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
  let runFinalizing = false;

  if (!opts.dryRun) {
    const { data: run, error } = await supabase
      .from('off_import_runs')
      .insert({
        records_seen: 0,
        records_kept_us: 0,
        records_kept_total: 0,
        records_inserted: 0,
        records_updated: 0,
        records_skipped: 0,
        records_skipped_no_id: 0,
        records_skipped_upsert_error: 0,
        status: 'running',
        source_file: opts.file,
        max_kept_used: opts.maxKept,
        batch_size_used: opts.batchSize,
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
  if (opts.maxKept) console.log('   Max kept (total mirror rows):', opts.maxKept);
  if (opts.flushDelayMs > 0) console.log('   Flush delay (ms):', opts.flushDelayMs);
  if (opts.dryRun) console.log('   🔍 DRY RUN');
  console.log('='.repeat(70));

  let recordsSeen = 0;
  let recordsKeptUs = 0;
  let recordsKeptTotal = 0;
  let recordsInserted = 0;
  let recordsUpdated = 0;
  let recordsSkippedNoId = 0;
  let recordsSkippedUpsertError = 0;
  let aliasWriteErrors = 0;
  const startTime = Date.now();
  let productBatch: OffProductRow[] = [];
  let aliasBatch: Array<{ off_product_id: string; source: string; value: string }> = [];

  const finalizeRun = async (status: 'completed' | 'failed', extraError?: string): Promise<void> => {
    if (runFinalized || runFinalizing || !importRunId) return;
    runFinalizing = true;
    const errorSummary = [...runErrors, extraError].filter(Boolean).join('\n') || null;
    const payload = {
      finished_at: new Date().toISOString(),
      records_seen: recordsSeen,
      records_kept_us: recordsKeptUs,
      records_kept_total: recordsKeptTotal,
      records_inserted: recordsInserted,
      records_updated: recordsUpdated,
      records_skipped: recordsSkippedNoId + recordsSkippedUpsertError,
      records_skipped_no_id: recordsSkippedNoId,
      records_skipped_upsert_error: recordsSkippedUpsertError,
      status,
      error_summary: errorSummary,
    };

    const maxAttempts = 10;
    let lastMessage = 'Unknown finalize error';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { error } = await supabase
        .from('off_import_runs')
        .update(payload)
        .eq('id', importRunId);

      if (!error) {
        runFinalized = true;
        runFinalizing = false;
        return;
      }

      lastMessage = error.message ?? 'Unknown finalize error';
      console.error(
        `[OFF Import] Finalize run failed (attempt ${attempt}/${maxAttempts}): ${lastMessage}`
      );

      if (attempt < maxAttempts) {
        await sleep(getRetryDelayMs(lastMessage, attempt));
      }
    }

    runFinalizing = false;
    throw new Error(`Failed to finalize OFF import run after ${maxAttempts} attempts: ${lastMessage}`);
  };

  shutdownFinalize = async () => {
    if (importRunId && !runFinalized) {
      await finalizeRun('failed', 'Process interrupted (SIGINT/SIGTERM)');
    }
  };

  const upsertRows = async (
    rows: OffProductRow[],
    existingSet: Set<string>
  ): Promise<WriteResult> => {
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
    const skippedBefore = recordsSkippedUpsertError;
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

    if (recordsSkippedUpsertError > skippedBefore) {
      throw new Error(
        `Unresolved OFF mirror upsert failures remained after retries (${recordsSkippedUpsertError - skippedBefore} rows in last flush)`
      );
    }
  };

  const flushAliases = async (): Promise<void> => {
    if (aliasBatch.length === 0 || opts.dryRun) return;
    const productIds = Array.from(new Set(aliasBatch.map((a) => a.off_product_id)));

    const runAliasWrite = async (
      label: string,
      operation: () => Promise<{ error: { message?: string } | null }>
    ): Promise<void> => {
      const maxAttempts = 10;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { error } = await operation();
        if (!error) return;
        const message = error.message ?? 'Unknown alias write error';
        if (attempt < maxAttempts) {
          console.warn(
            `[OFF Import] ${label} failed (attempt ${attempt}/${maxAttempts}), retrying: ${message}`
          );
          await sleep(getRetryDelayMs(message, attempt));
          continue;
        }

        aliasWriteErrors++;
        const msg = `${label} failed after ${maxAttempts} attempts: ${message}`;
        runErrors.push(msg);
        throw new Error(msg);
      }
    };

    await runAliasWrite(
      `Alias delete for batch of ${productIds.length} products`,
      async () => await supabase.from('off_product_search_aliases').delete().in('off_product_id', productIds)
    );

    if (aliasBatch.length > 0) {
      const aliasRows = aliasBatch;
      aliasBatch = [];
      const aliasChunkSize = Math.max(50, Math.min(opts.batchSize, 100));
      for (let i = 0; i < aliasRows.length; i += aliasChunkSize) {
        const chunk = aliasRows.slice(i, i + aliasChunkSize);
        await runAliasWrite(
          `Alias insert chunk ${Math.floor(i / aliasChunkSize) + 1} (${chunk.length} rows)`,
          async () => await supabase.from('off_product_search_aliases').insert(chunk)
        );
      }
    }
  };

  try {
    for await (const raw of readJsonlGz(opts.file)) {
      recordsSeen++;
      if (recordsSeen % 50000 === 0) {
        console.log(
          `   Seen: ${recordsSeen.toLocaleString()} | Mirrored: ${recordsKeptTotal.toLocaleString()} | U.S.-likely: ${recordsKeptUs.toLocaleString()}`
        );
      }

      const marketConfidence = detectMarketConfidence(raw);
      recordsKeptTotal++;
      if (marketConfidence === 'explicit_us' || marketConfidence === 'likely_us') {
        recordsKeptUs++;
      }

      if (opts.maxKept != null && recordsKeptTotal > opts.maxKept) break;

      const row = mapProduct(raw, importRunId ?? '00000000-0000-0000-0000-000000000000', marketConfidence);
      if (!row) {
        recordsSkippedNoId++;
        continue;
      }

      productBatch.push(row);
      aliasBatch.push(...collectAliases(row));

      if (productBatch.length >= opts.batchSize) {
        await flushProducts();
        await flushAliases();
        if (opts.flushDelayMs > 0) await sleep(opts.flushDelayMs);
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(
          `   📊 Mirrored: ${recordsKeptTotal.toLocaleString()} | U.S.-likely: ${recordsKeptUs.toLocaleString()} | Imported: ${(recordsInserted + recordsUpdated).toLocaleString()} | ${(recordsKeptTotal / elapsed).toFixed(0)}/s`
        );
      }
    }

    await flushProducts();
    await flushAliases();

    if (!opts.dryRun && importRunId) {
      const completionError =
        recordsSkippedUpsertError > 0
          ? `Run finished with unresolved OFF mirror upsert failures (${recordsSkippedUpsertError})`
          : aliasWriteErrors > 0
            ? `Run finished with alias write failures (${aliasWriteErrors})`
            : null;

      if (completionError) {
        await finalizeRun('failed', completionError);
        throw new Error(completionError);
      }

      await finalizeRun('completed');
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const recordsSkipped = recordsSkippedNoId + recordsSkippedUpsertError;
    console.log('\n' + '='.repeat(70));
    console.log('✅ Import complete');
    console.log('='.repeat(70));
    console.log('   Records seen:', recordsSeen.toLocaleString());
    console.log('   Records kept (total):', recordsKeptTotal.toLocaleString());
    console.log('   Records kept (U.S.-likely subset):', recordsKeptUs.toLocaleString());
    console.log('   Records inserted:', recordsInserted.toLocaleString());
    console.log('   Records updated:', recordsUpdated.toLocaleString());
    console.log('   Records skipped (no id):', recordsSkippedNoId.toLocaleString());
    console.log('   Records skipped (upsert error):', recordsSkippedUpsertError.toLocaleString());
    console.log('   Records skipped (total):', recordsSkipped.toLocaleString());
    console.log('   Time:', elapsed.toFixed(1) + 's');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[OFF Import] Fatal error:', errMsg);
    if (importRunId) {
      try {
        await finalizeRun('failed', errMsg);
      } catch (finalizeErr) {
        console.error('[OFF Import] Finalize-after-failure also failed:', formatErrorMessage(finalizeErr));
      }
    }
    throw err;
  } finally {
    if (!runFinalized && importRunId) {
      try {
        await finalizeRun('failed', 'Process interrupted or exited unexpectedly');
      } catch (finalizeErr) {
        console.error('[OFF Import] Final finalize attempt failed:', formatErrorMessage(finalizeErr));
      }
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
