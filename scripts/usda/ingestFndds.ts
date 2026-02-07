/**
 * USDA FNDDS (Food and Nutrient Database for Dietary Studies) Ingestion
 *
 * Ingests FNDDS/survey-style CSV into food_objects with source_dataset='fndds'.
 * Uses source_id = `fndds_${fdc_id}` so rows do not conflict with existing
 * survey/foundation/branded (source_provider, source_id) rows.
 *
 * Data: Use the same folder structure as Survey Foods (food.csv, food_nutrient.csv,
 * food_portion.csv) from FoodData Central, or a dedicated FNDDS export.
 *
 * Usage:
 *   npx tsx scripts/usda/ingestFndds.ts --limit 100
 *   npx tsx scripts/usda/ingestFndds.ts --since fndds_2710000
 *   npx tsx scripts/usda/ingestFndds.ts --print-stats
 *
 * Options:
 *   --limit N               Max foods to process
 *   --since FDC_ID          Resume from last source_id (checkpoint or this value)
 *   --dry-run               Preview without inserting
 *   --batch N               Batch size (default: 500)
 *   --reset-checkpoint      Delete checkpoint before starting
 *   --print-stats           Print dataset stats and exit
 *   --folder NAME           Subfolder under data/usa_fdc (default: FNDDS_FOLDER below)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const DATA_ROOT = path.join(__dirname, '../../data/usa_fdc');
const CHECKPOINT_DIR = path.join(__dirname, '.checkpoints');
const OUTPUT_DIR = path.join(__dirname, 'output');

// Default: Survey Foods CSV (FNDDS on FoodData Central). Override with --folder.
const FNDDS_FOLDER = 'FoodData_Central_survey_food_csv_2024-10-31';

if (!fs.existsSync(CHECKPOINT_DIR)) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const NUTRIENT_MAP: Record<number, keyof NutrientValues> = {
  1008: 'calories',
  2047: 'calories',
  2048: 'calories',
  1003: 'protein_g',
  1005: 'carbs_g',
  1004: 'fat_g',
  1079: 'fiber_g',
  1063: 'sugar_g',
  1093: 'sodium_mg',
};

const EXTENDED_NUTRIENT_IDS: Record<number, string> = {
  1087: 'calcium_mg',
  1089: 'iron_mg',
  1090: 'magnesium_mg',
  1091: 'phosphorus_mg',
  1092: 'potassium_mg',
  1095: 'zinc_mg',
  1162: 'vitamin_c_mg',
  1114: 'vitamin_d_ug',
  1177: 'folate_ug',
  1178: 'vitamin_b12_ug',
};

interface NutrientValues {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
}

interface FoodObjectInsert {
  canonical_name: string;
  brand_name: string | null;
  aliases: string[];
  source_type: 'common';
  source_provider: 'usda';
  source_id: string;
  source_dataset: 'fndds';
  upc: string | null;
  serving_size_g: number;
  serving_unit: string;
  serving_description: string | null;
  household_serving_text: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  nutrients_extended: Record<string, number> | null;
  nutrient_provenance: string;
  nutrient_confidence: string;
  category: string | null;
  is_verified: boolean;
  is_deleted: boolean;
  person_id: null;
}

interface Checkpoint {
  dataset: string;
  lastFdcId: string;
  lastSourceId: string;
  lastSuccessfulSourceId: string;
  processed: number;
  inserted: number;
  skipped: number;
  errors: number;
  lastRunAt: string;
}

interface ParsedArgs {
  limit?: number;
  since?: string;
  dryRun: boolean;
  batchSize: number;
  resetCheckpoint: boolean;
  printStats: boolean;
  folder: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function* readCSV<T>(
  filePath: string,
  transform: (headers: string[], row: string[]) => T
): AsyncGenerator<T> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] = [];
  let isFirst = true;
  for await (const line of rl) {
    if (isFirst) {
      headers = parseCSVLine(line);
      isFirst = false;
      continue;
    }
    const row = parseCSVLine(line);
    yield transform(headers, row);
  }
}

function isTransientError(error: unknown): boolean {
  const message = (error as Error)?.message || String(error);
  if (message.includes('fetch failed') || message.includes('ECONNRESET') || message.includes('ETIMEDOUT')) return true;
  if (message.includes('timeout') || message.includes('network')) return true;
  const status = (error as { status?: number })?.status;
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  return !!(status && status >= 500 && status < 600);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt >= retries) throw error;
      const delay = Math.min(500 * Math.pow(2, attempt) + Math.random() * 1000, 30000);
      console.log(`   ⚠️  Retry ${attempt + 1}/${retries + 1} in ${Math.round(delay / 1000)}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function fixApostropheCasing(text: string): string {
  if (!text) return text;
  return text
    .replace(/'S\b/g, "'s")
    .replace(/'T\b/g, "'t")
    .replace(/'Re\b/g, "'re")
    .replace(/'Ve\b/g, "'ve")
    .replace(/'Ll\b/g, "'ll")
    .replace(/'D\b/g, "'d")
    .replace(/'M\b/g, "'m");
}

function normalizeName(description: string): string {
  if (!description) return 'Unknown';
  let name = description.trim().replace(/\s+/g, ' ');
  name = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  name = name.replace(/,\s*/g, ', ');
  return fixApostropheCasing(name);
}

function sourceIdFromFdcId(fdcId: string): string {
  return `fndds_${fdcId}`;
}

function loadCheckpoint(): Checkpoint | null {
  const p = path.join(CHECKPOINT_DIR, 'fndds.json');
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

function saveCheckpoint(cp: Checkpoint): void {
  fs.writeFileSync(path.join(CHECKPOINT_DIR, 'fndds.json'), JSON.stringify(cp, null, 2));
}

function deleteCheckpoint(): void {
  const p = path.join(CHECKPOINT_DIR, 'fndds.json');
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log('   🗑️  Deleted checkpoint');
  }
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let since: string | undefined;
  let dryRun = false;
  let batchSize = 500;
  let resetCheckpoint = false;
  let printStats = false;
  let folder = FNDDS_FOLDER;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (arg === '--since' && args[i + 1]) {
      since = args[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--batch' && args[i + 1]) {
      batchSize = parseInt(args[++i], 10);
    } else if (arg === '--reset-checkpoint') {
      resetCheckpoint = true;
    } else if (arg === '--print-stats') {
      printStats = true;
    } else if (arg === '--folder' && args[i + 1]) {
      folder = args[++i];
    }
  }

  return { limit, since, dryRun, batchSize, resetCheckpoint, printStats, folder };
}

async function loadAllNutrients(
  nutrientPath: string
): Promise<Map<string, NutrientValues & { extended: Record<string, number> }>> {
  const map = new Map<string, NutrientValues & { extended: Record<string, number> }>();
  if (!fs.existsSync(nutrientPath)) return map;

  for await (const row of readCSV(nutrientPath, (h, r) => ({
    fdc_id: r[h.indexOf('fdc_id')],
    nutrient_id: parseInt(r[h.indexOf('nutrient_id')], 10),
    amount: parseFloat(r[h.indexOf('amount')]) || 0,
  }))) {
    if (!row.fdc_id || isNaN(row.nutrient_id)) continue;
    let entry = map.get(row.fdc_id);
    if (!entry) {
      entry = { extended: {} };
      map.set(row.fdc_id, entry);
    }
    const fieldName = NUTRIENT_MAP[row.nutrient_id];
    if (fieldName && (entry as NutrientValues)[fieldName] === undefined) {
      (entry as NutrientValues)[fieldName] = row.amount;
    }
    const extName = EXTENDED_NUTRIENT_IDS[row.nutrient_id];
    if (extName && row.amount > 0) entry.extended[extName] = row.amount;
  }
  return map;
}

async function getDatasetCsvStats(foodCsvPath: string): Promise<{ rowCount: number; minFdcId: number; maxFdcId: number }> {
  if (!fs.existsSync(foodCsvPath)) return { rowCount: 0, minFdcId: 0, maxFdcId: 0 };
  let rowCount = 0;
  let minFdcId = Infinity;
  let maxFdcId = -Infinity;
  for await (const row of readCSV(foodCsvPath, (h, r) => ({ fdc_id: parseInt(r[h.indexOf('fdc_id')], 10) }))) {
    rowCount++;
    if (row.fdc_id < minFdcId) minFdcId = row.fdc_id;
    if (row.fdc_id > maxFdcId) maxFdcId = row.fdc_id;
  }
  return {
    rowCount,
    minFdcId: minFdcId === Infinity ? 0 : minFdcId,
    maxFdcId: maxFdcId === -Infinity ? 0 : maxFdcId,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function main(): Promise<void> {
  const options = parseArgs();
  const datasetPath = path.join(DATA_ROOT, options.folder);
  const foodCsvPath = path.join(datasetPath, 'food.csv');
  const nutrientPath = path.join(datasetPath, 'food_nutrient.csv');
  const portionPath = path.join(datasetPath, 'food_portion.csv');
  const categoryPath = path.join(datasetPath, 'food_category.csv');

  if (options.printStats) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    console.log('\n' + '='.repeat(70));
    console.log('📊 FNDDS Dataset Stats');
    console.log('='.repeat(70));
    if (!fs.existsSync(datasetPath)) {
      console.error('   ❌ Folder not found: ' + datasetPath);
      return;
    }
    const csvStats = await getDatasetCsvStats(foodCsvPath);
    const { count: dbCount } = await supabase
      .from('food_objects')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .eq('source_provider', 'usda')
      .eq('source_dataset', 'fndds');
    const checkpoint = loadCheckpoint();

    console.log('\n   CSV:');
    console.log(`      Rows: ${csvStats.rowCount.toLocaleString()}`);
    console.log(`      Min fdc_id: ${csvStats.minFdcId.toLocaleString()}`);
    console.log(`      Max fdc_id: ${csvStats.maxFdcId.toLocaleString()}`);
    console.log('\n   Database (source_dataset=fndds):');
    console.log(`      Rows: ${(dbCount ?? 0).toLocaleString()}`);
    console.log('\n   Checkpoint:');
    if (checkpoint) {
      console.log(`      Last source_id: ${checkpoint.lastSuccessfulSourceId ?? 'none'}`);
      console.log(`      Processed: ${checkpoint.processed.toLocaleString()}`);
      console.log(`      Inserted: ${checkpoint.inserted.toLocaleString()}`);
    } else {
      console.log('      None');
    }
    console.log('='.repeat(70));
    return;
  }

  if (!fs.existsSync(datasetPath)) {
    console.error('❌ Dataset folder not found: ' + datasetPath);
    console.error('   Place FNDDS/Survey CSV folder under data/usa_fdc/ or use --folder <name>');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  if (options.resetCheckpoint) deleteCheckpoint();
  const existingCheckpoint = loadCheckpoint();
  const sinceSourceId = options.since ?? existingCheckpoint?.lastSuccessfulSourceId ?? null;

  console.log('\n' + '='.repeat(70));
  console.log('📦 Ingesting FNDDS');
  console.log('   Path: ' + datasetPath);
  console.log('   source_dataset: fndds');
  console.log('   source_id: fndds_<fdc_id>');
  if (options.limit) console.log('   Limit: ' + options.limit);
  if (sinceSourceId) console.log('   Since: ' + sinceSourceId);
  if (options.dryRun) console.log('   🔍 DRY RUN');
  console.log('='.repeat(70));

  const portionMap = new Map<string, { gram_weight?: string; portion_description?: string; modifier?: string }>();
  if (fs.existsSync(portionPath)) {
    for await (const row of readCSV(portionPath, (h, r) => ({
      fdc_id: r[h.indexOf('fdc_id')],
      gram_weight: r[h.indexOf('gram_weight')],
      portion_description: r[h.indexOf('portion_description')],
      modifier: r[h.indexOf('modifier')],
    }))) {
      if (!portionMap.has(row.fdc_id)) portionMap.set(row.fdc_id, row);
    }
  }

  let categoryMap = new Map<string, string>();
  if (fs.existsSync(categoryPath)) {
    for await (const row of readCSV(categoryPath, (h, r) => ({
      id: r[h.indexOf('id')],
      description: r[h.indexOf('description')],
    }))) {
      categoryMap.set(row.id, row.description);
    }
  }

  console.log('   Loading nutrients...');
  const nutrientMap = await loadAllNutrients(nutrientPath);
  console.log('   ✓ Nutrients loaded for ' + nutrientMap.size.toLocaleString() + ' foods');

  let processed = 0;
  let inserted = 0;
  let skippedByCheckpoint = 0;
  let errors = 0;
  let lastFdcId = '';
  let lastSuccessfulSourceId = sinceSourceId || '';
  let batch: FoodObjectInsert[] = [];
  const startTime = Date.now();

  // Parse since for numeric comparison (fdc_id)
  const sinceFdcIdNum = sinceSourceId?.startsWith('fndds_')
    ? parseInt(sinceSourceId.replace(/^fndds_/, ''), 10)
    : null;
  const isNaNSince = sinceFdcIdNum !== null && isNaN(sinceFdcIdNum);

  async function flushBatch(): Promise<void> {
    if (batch.length === 0 || options.dryRun) return;
    try {
      await withRetry(async () => {
        const { error } = await supabase
          .from('food_objects')
          .upsert(batch, { onConflict: 'source_provider,source_id', ignoreDuplicates: false });
        if (error) throw error;
      });
      inserted += batch.length;
      lastSuccessfulSourceId = batch[batch.length - 1].source_id;
    } catch (err) {
      errors += batch.length;
      console.error('   ❌ Batch failed: ' + (err as Error).message);
    }
    batch = [];
  }

  for await (const food of readCSV(foodCsvPath, (h, r) => ({
    fdc_id: r[h.indexOf('fdc_id')],
    description: r[h.indexOf('description')],
    data_type: r[h.indexOf('data_type')],
    food_category_id: r[h.indexOf('food_category_id')],
  }))) {
    const sourceId = sourceIdFromFdcId(food.fdc_id);
    const fdcIdNum = parseInt(food.fdc_id, 10);
    if (!isNaNSince && sinceFdcIdNum !== null && fdcIdNum <= sinceFdcIdNum) {
      skippedByCheckpoint++;
      continue;
    }
    if (options.limit && processed >= options.limit) break;

    processed++;
    lastFdcId = food.fdc_id;

    const portion = portionMap.get(food.fdc_id);
    let servingSizeG = 100;
    let servingUnit = 'g';
    let servingDescription: string | null = null;
    let householdServingText: string | null = null;
    if (portion) {
      const gw = parseFloat(portion.gram_weight || '');
      if (!isNaN(gw) && gw > 0) servingSizeG = gw;
      servingDescription = portion.portion_description || null;
      householdServingText = portion.modifier || null;
      const unitMatch = (portion.portion_description || '').match(/^[\d.]+\s*(\w+)/);
      if (unitMatch) servingUnit = unitMatch[1].toLowerCase();
    }

    const nutrients = nutrientMap.get(food.fdc_id);
    const category = food.food_category_id ? categoryMap.get(food.food_category_id) || null : null;

    const row: FoodObjectInsert = {
      canonical_name: normalizeName(food.description),
      brand_name: null,
      aliases: [food.description],
      source_type: 'common',
      source_provider: 'usda',
      source_id: sourceId,
      source_dataset: 'fndds',
      upc: null,
      serving_size_g: servingSizeG,
      serving_unit: servingUnit,
      serving_description: servingDescription,
      household_serving_text: householdServingText,
      calories: nutrients?.calories ?? null,
      protein_g: nutrients?.protein_g ?? null,
      carbs_g: nutrients?.carbs_g ?? null,
      fat_g: nutrients?.fat_g ?? null,
      fiber_g: nutrients?.fiber_g ?? null,
      sugar_g: nutrients?.sugar_g ?? null,
      sodium_mg: nutrients?.sodium_mg ?? null,
      nutrients_extended: nutrients?.extended && Object.keys(nutrients.extended).length > 0 ? nutrients.extended : null,
      nutrient_provenance: 'usda',
      nutrient_confidence: 'high',
      category,
      is_verified: true,
      is_deleted: false,
      person_id: null,
    };

    batch.push(row);

    if (batch.length >= options.batchSize) {
      await flushBatch();
      saveCheckpoint({
        dataset: 'fndds',
        lastFdcId,
        lastSourceId: sourceIdFromFdcId(lastFdcId),
        lastSuccessfulSourceId,
        processed,
        inserted,
        skipped: skippedByCheckpoint,
        errors,
        lastRunAt: new Date().toISOString(),
      });
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(
        `   📊 ${processed.toLocaleString()} | I:${inserted} E:${errors} | ${(processed / elapsed).toFixed(0)}/s | last: ${lastSuccessfulSourceId}`
      );
    }
  }

  await flushBatch();

  saveCheckpoint({
    dataset: 'fndds',
    lastFdcId,
    lastSourceId: lastFdcId ? sourceIdFromFdcId(lastFdcId) : '',
    lastSuccessfulSourceId,
    processed,
    inserted,
    skipped: skippedByCheckpoint,
    errors,
    lastRunAt: new Date().toISOString(),
  });

  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\n' + '='.repeat(70));
  console.log('✅ FNDDS ingestion complete');
  console.log('='.repeat(70));
  console.log('   Skipped (checkpoint): ' + skippedByCheckpoint.toLocaleString());
  console.log('   Processed: ' + processed.toLocaleString());
  console.log('   Inserted: ' + inserted.toLocaleString());
  console.log('   Errors: ' + errors.toLocaleString());
  console.log('   Time: ' + elapsed.toFixed(1) + 's');
  console.log('   Last: ' + (lastSuccessfulSourceId || 'none'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
