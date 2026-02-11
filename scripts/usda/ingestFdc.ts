/**
 * USDA FoodData Central Ingestion Script
 * 
 * Ingests USDA FDC CSV data into the food_objects table.
 * Supports incremental ingestion with checkpoints.
 * 
 * IMPORTANT: Run scripts/usda/addUsdaIndexes.sql BEFORE first ingestion!
 * 
 * Usage:
 *   npx tsx scripts/usda/ingestFdc.ts --dataset foundation --limit 100
 *   npx tsx scripts/usda/ingestFdc.ts --dataset branded --limit 1000
 *   npx tsx scripts/usda/ingestFdc.ts --dataset all --dry-run
 * 
 * Options:
 *   --dataset               foundation|branded|sr_legacy|survey|all (required)
 *   --limit N               Max foods to process (for testing)
 *   --since FDC_ID          Resume from fdc_id (checkpoint)
 *   --dry-run               Preview without inserting
 *   --batch N               Batch size for commits (default: 500)
 *   --reset-checkpoint      Delete checkpoint before starting
 *   --max-consecutive-errors N  Stop after N consecutive batch failures (default: 3)
 *   --print-stats           Print dataset stats and exit (no ingestion)
 * 
 * For Branded dataset (2M+ foods):
 *   Uses memory-efficient streaming - nutrients are processed per-batch,
 *   not loaded entirely into memory.
 * 
 * Handles:
 *   - UPC duplicates (intra-batch dedupe + row-level fallback)
 *   - Transient "fetch failed" errors (retry with backoff)
 *   - Provisional promotion (upgrades scan records to USDA data)
 * 
 * Output files:
 *   - scripts/usda/.checkpoints/<dataset>.json - Resume checkpoint
 *   - scripts/usda/output/duplicates.jsonl - UPC collision log
 *   - scripts/usda/output/errors.jsonl - Hard error log
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const DATA_ROOT = path.join(__dirname, '../../data/usa_fdc');
const CHECKPOINT_DIR = path.join(__dirname, '.checkpoints');
const OUTPUT_DIR = path.join(__dirname, 'output');

// Ensure directories exist
if (!fs.existsSync(CHECKPOINT_DIR)) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Dataset configurations
const DATASETS: Record<string, { folder: string; sourceType: 'branded' | 'common'; confidence: 'high' | 'medium'; isLarge: boolean }> = {
  foundation: {
    folder: 'FoodData_Central_foundation_food_csv_2025-12-18',
    sourceType: 'common',
    confidence: 'high',
    isLarge: false,
  },
  branded: {
    folder: 'FoodData_Central_branded_food_csv_2025-12-18',
    sourceType: 'branded',
    confidence: 'medium',
    isLarge: true, // 2M+ foods, 26M+ nutrient rows - needs streaming
  },
  sr_legacy: {
    folder: 'FoodData_Central_sr_legacy_food_csv_2018-04',
    sourceType: 'common',
    confidence: 'medium',
    isLarge: false,
  },
  survey: {
    folder: 'FoodData_Central_survey_food_csv_2024-10-31',
    sourceType: 'common',
    confidence: 'medium',
    isLarge: false,
  },
};

// Nutrient ID mapping to our fields
const NUTRIENT_MAP: Record<number, keyof NutrientValues> = {
  // Energy (prefer 1008, fallback to 2047/2048)
  1008: 'calories',
  2047: 'calories',
  2048: 'calories',
  // Macros
  1003: 'protein_g',
  1005: 'carbs_g',
  1004: 'fat_g',
  // Key micros
  1079: 'fiber_g',
  1063: 'sugar_g',
  1093: 'sodium_mg',
};

// Extended nutrients for nutrients_extended JSONB
const EXTENDED_NUTRIENT_IDS: Record<number, string> = {
  1087: 'calcium_mg',
  1089: 'iron_mg',
  1090: 'magnesium_mg',
  1091: 'phosphorus_mg',
  1092: 'potassium_mg',
  1095: 'zinc_mg',
  1098: 'copper_mg',
  1101: 'manganese_mg',
  1103: 'selenium_ug',
  1106: 'vitamin_a_ug',
  1162: 'vitamin_c_mg',
  1114: 'vitamin_d_ug',
  1109: 'vitamin_e_mg',
  1185: 'vitamin_k_ug',
  1165: 'thiamin_mg',
  1166: 'riboflavin_mg',
  1167: 'niacin_mg',
  1175: 'vitamin_b6_mg',
  1177: 'folate_ug',
  1178: 'vitamin_b12_ug',
  1180: 'choline_mg',
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

interface FoodRow {
  fdc_id: string;
  description: string;
  data_type: string;
  food_category_id?: string;
}

interface BrandedFoodRow {
  fdc_id: string;
  brand_owner?: string;
  brand_name?: string;
  gtin_upc?: string;
  serving_size?: string;
  serving_size_unit?: string;
  household_serving_fulltext?: string;
  branded_food_category?: string;
}

interface FoodPortionRow {
  fdc_id: string;
  portion_description?: string;
  gram_weight?: string;
  modifier?: string;
}

interface Checkpoint {
  dataset: string;
  lastFdcId: string;
  lastSuccessfulFdcId: string; // Only advances on successful batch
  processed: number;
  inserted: number;
  updated: number;
  errors: number;
  skipped: number;
  promoted: number;
  lastRunAt: string;
}

interface ParsedArgs {
  dataset: string;
  limit?: number;
  since?: string;
  dryRun: boolean;
  batchSize: number;
  resetCheckpoint: boolean;
  maxConsecutiveErrors: number;
  printStats: boolean;
}

// Food object type for database insert
interface FoodObjectInsert {
  canonical_name: string;
  brand_name: string | null;
  aliases: string[];
  source_type: 'branded' | 'common';
  source_provider: string;
  source_id: string;
  source_dataset: string;  // Dataset name: 'branded' | 'foundation' | 'sr_legacy' | 'survey'
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

// Duplicate log entry
interface DuplicateLogEntry {
  fdc_id: string;
  upc: string;
  canonical_name: string;
  brand_name: string | null;
  existing_id?: string;
  existing_source_provider?: string;
  existing_source_id?: string | null;
  existing_source_type?: string;
  reason: string;
  action: 'skipped' | 'promoted' | 'intra_batch_dedupe';
  timestamp: string;
}

// Error log entry
interface ErrorLogEntry {
  fdc_id: string;
  upc: string | null;
  canonical_name: string;
  error: string;
  errorType: 'transient_final' | 'constraint' | 'unknown';
  timestamp: string;
}

// Dataset statistics
interface DatasetStats {
  csvRowCount: number;
  csvMinFdcId: number;
  csvMaxFdcId: number;
  dbTotal: number;
  dbWithUpc: number;
  checkpointFdcId: string | null;
  checkpointProcessed: number;
}

// ============================================================================
// FDC ID Comparison (numeric, not string)
// ============================================================================

/**
 * Compare two fdc_id values NUMERICALLY.
 * String comparison would incorrectly order: "999999" > "1000001"
 * Returns: negative if a < b, zero if equal, positive if a > b
 */
function compareFdcIds(a: string, b: string): number {
  const numA = parseInt(a, 10);
  const numB = parseInt(b, 10);
  return numA - numB;
}

/**
 * Check if fdc_id should be skipped based on checkpoint.
 * Uses numeric comparison to avoid string ordering bugs.
 */
function shouldSkipByCheckpoint(fdcId: string, checkpointFdcId: string | null): boolean {
  if (!checkpointFdcId) return false;
  return compareFdcIds(fdcId, checkpointFdcId) <= 0;
}

// ============================================================================
// Retry Helper for Transient Errors
// ============================================================================

interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

function isTransientError(error: unknown): boolean {
  if (!error) return false;
  
  const errorStr = String(error);
  const message = (error as Error)?.message || errorStr;
  
  // Check for common transient errors
  if (message.includes('fetch failed')) return true;
  if (message.includes('ECONNRESET')) return true;
  if (message.includes('ETIMEDOUT')) return true;
  if (message.includes('socket hang up')) return true;
  if (message.includes('network')) return true;
  if (message.includes('timeout')) return true;
  if (message.includes('ENOTFOUND')) return true;
  if (message.includes('ECONNREFUSED')) return true;
  
  // Check for HTTP status codes
  const status = (error as { status?: number })?.status;
  if (status === 429) return true; // Rate limit
  if (status === 502) return true; // Bad gateway
  if (status === 503) return true; // Service unavailable
  if (status === 504) return true; // Gateway timeout
  if (status && status >= 500 && status < 600) return true; // Other server errors
  
  return false;
}

function isUpcConstraintError(error: unknown): boolean {
  const message = (error as Error)?.message || String(error);
  return message.includes('idx_food_objects_upc_unique') || 
         (message.includes('duplicate key') && message.includes('upc'));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { retries = 5, baseDelayMs = 500, maxDelayMs = 30000 } = options;
  
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (!isTransientError(error) || attempt >= retries) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs
      );
      
      console.log(`   ⚠️  Transient error (attempt ${attempt + 1}/${retries + 1}): ${(error as Error).message}`);
      console.log(`   ⏳ Retrying in ${Math.round(delay / 1000)}s...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// ============================================================================
// CSV Parsing Helpers
// ============================================================================

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

async function* readCSV<T>(filePath: string, transform: (headers: string[], row: string[]) => T): AsyncGenerator<T> {
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

async function buildLookupMap<K, V>(
  filePath: string,
  keyExtractor: (headers: string[], row: string[]) => K,
  valueExtractor: (headers: string[], row: string[]) => V,
  progressInterval?: number
): Promise<Map<K, V>> {
  const map = new Map<K, V>();
  
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${path.basename(filePath)}`);
    return map;
  }
  
  let count = 0;
  for await (const _ of readCSV(filePath, (h, r) => {
    const key = keyExtractor(h, r);
    const value = valueExtractor(h, r);
    map.set(key, value);
    count++;
    if (progressInterval && count % progressInterval === 0) {
      console.log(`      Loaded ${(count / 1000000).toFixed(1)}M rows...`);
    }
    return null;
  })) {
    // Just iterate to build map
  }
  
  return map;
}

// ============================================================================
// Dataset Statistics
// ============================================================================

/**
 * Get min/max fdc_id and row count from a food.csv file.
 * Streams the file to avoid loading into memory.
 */
async function getDatasetCsvStats(foodCsvPath: string): Promise<{ rowCount: number; minFdcId: number; maxFdcId: number }> {
  if (!fs.existsSync(foodCsvPath)) {
    return { rowCount: 0, minFdcId: 0, maxFdcId: 0 };
  }
  
  let rowCount = 0;
  let minFdcId = Infinity;
  let maxFdcId = -Infinity;
  
  for await (const row of readCSV(foodCsvPath, (h, r) => ({
    fdc_id: parseInt(r[h.indexOf('fdc_id')], 10),
  }))) {
    rowCount++;
    if (row.fdc_id < minFdcId) minFdcId = row.fdc_id;
    if (row.fdc_id > maxFdcId) maxFdcId = row.fdc_id;
  }
  
  return { 
    rowCount, 
    minFdcId: minFdcId === Infinity ? 0 : minFdcId, 
    maxFdcId: maxFdcId === -Infinity ? 0 : maxFdcId 
  };
}

/**
 * Get database counts for USDA foods.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDbStats(supabase: any, sourceType: 'branded' | 'common'): Promise<{ total: number; withUpc: number }> {
  try {
    const { count: total } = await withRetry(async () => {
      return await supabase
        .from('food_objects')
        .select('*', { count: 'exact', head: true })
        .eq('source_provider', 'usda')
        .eq('source_type', sourceType)
        .eq('is_deleted', false);
    });
    
    const { count: withUpc } = await withRetry(async () => {
      return await supabase
        .from('food_objects')
        .select('*', { count: 'exact', head: true })
        .eq('source_provider', 'usda')
        .eq('source_type', sourceType)
        .eq('is_deleted', false)
        .not('upc', 'is', null);
    });
    
    return { total: total || 0, withUpc: withUpc || 0 };
  } catch (error) {
    console.error('   ⚠️  Failed to fetch DB stats:', (error as Error).message);
    return { total: 0, withUpc: 0 };
  }
}

/**
 * Print comprehensive dataset statistics.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function printDatasetStats(
  supabase: any,
  datasetName: string,
  config: typeof DATASETS[string]
): Promise<void> {
  const datasetPath = path.join(DATA_ROOT, config.folder);
  const foodCsvPath = path.join(datasetPath, 'food.csv');
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 Dataset Stats: ${datasetName.toUpperCase()}`);
  console.log('='.repeat(70));
  
  if (!fs.existsSync(datasetPath)) {
    console.error(`   ❌ Dataset folder not found: ${datasetPath}`);
    return;
  }
  
  // Get CSV stats
  console.log('   Scanning CSV file...');
  const csvStats = await getDatasetCsvStats(foodCsvPath);
  
  // Get DB stats
  console.log('   Fetching DB counts...');
  const dbStats = await getDbStats(supabase, config.sourceType);
  
  // Get checkpoint
  const checkpoint = loadCheckpoint(datasetName);
  
  console.log('\n   CSV Statistics:');
  console.log(`      Row count:    ${csvStats.rowCount.toLocaleString()}`);
  console.log(`      Min fdc_id:   ${csvStats.minFdcId.toLocaleString()}`);
  console.log(`      Max fdc_id:   ${csvStats.maxFdcId.toLocaleString()}`);
  
  console.log('\n   Database Statistics:');
  console.log(`      Total rows:   ${dbStats.total.toLocaleString()}`);
  console.log(`      With UPC:     ${dbStats.withUpc.toLocaleString()}`);
  console.log(`      Coverage:     ${csvStats.rowCount > 0 ? ((dbStats.total / csvStats.rowCount) * 100).toFixed(1) : 0}%`);
  
  console.log('\n   Checkpoint:');
  if (checkpoint) {
    console.log(`      fdc_id:       ${checkpoint.lastSuccessfulFdcId || 'none'}`);
    console.log(`      Processed:    ${checkpoint.processed.toLocaleString()}`);
    console.log(`      Inserted:     ${checkpoint.inserted.toLocaleString()}`);
    console.log(`      Skipped:      ${checkpoint.skipped.toLocaleString()}`);
    console.log(`      Errors:       ${checkpoint.errors.toLocaleString()}`);
    console.log(`      Last run:     ${checkpoint.lastRunAt}`);
    
    // Check for completion false-positive
    if (checkpoint.lastSuccessfulFdcId) {
      const checkpointNum = parseInt(checkpoint.lastSuccessfulFdcId, 10);
      const isAtEnd = checkpointNum >= csvStats.maxFdcId;
      const isMissingRows = dbStats.total < csvStats.rowCount * 0.9; // More than 10% missing
      
      if (isAtEnd && isMissingRows) {
        console.log('\n   ⚠️  WARNING: CHECKPOINT COMPLETION FALSE-POSITIVE DETECTED');
        console.log(`      Checkpoint indicates completion (${checkpoint.lastSuccessfulFdcId} >= ${csvStats.maxFdcId})`);
        console.log(`      But DB only has ${dbStats.total.toLocaleString()} / ${csvStats.rowCount.toLocaleString()} rows (${((dbStats.total / csvStats.rowCount) * 100).toFixed(1)}%)`);
        console.log('      Recommendation: Run with --reset-checkpoint to re-ingest');
      }
    }
  } else {
    console.log(`      No checkpoint found for ${datasetName}`);
  }
  
  console.log('='.repeat(70));
}

// ============================================================================
// Nutrient Loading (Memory-Efficient for Large Datasets)
// ============================================================================

/**
 * Load nutrients for a specific set of fdc_ids by streaming the CSV.
 * Used for large datasets to avoid loading all nutrients into memory.
 */
async function loadNutrientsForFdcIds(
  nutrientPath: string,
  fdcIds: Set<string>
): Promise<Map<string, NutrientValues & { extended: Record<string, number> }>> {
  const nutrientMap = new Map<string, NutrientValues & { extended: Record<string, number> }>();
  
  if (!fs.existsSync(nutrientPath)) {
    return nutrientMap;
  }
  
  for await (const row of readCSV(nutrientPath, (headers, values) => {
    const idx = (col: string) => headers.indexOf(col);
    return {
      fdc_id: values[idx('fdc_id')],
      nutrient_id: parseInt(values[idx('nutrient_id')], 10),
      amount: parseFloat(values[idx('amount')]) || 0,
    };
  })) {
    // Skip if not in our target set
    if (!fdcIds.has(row.fdc_id)) continue;
    if (!row.fdc_id || isNaN(row.nutrient_id)) continue;
    
    let entry = nutrientMap.get(row.fdc_id);
    if (!entry) {
      entry = { extended: {} };
      nutrientMap.set(row.fdc_id, entry);
    }
    
    const fieldName = NUTRIENT_MAP[row.nutrient_id];
    if (fieldName && entry[fieldName] === undefined) {
      entry[fieldName] = row.amount;
    }
    
    const extendedName = EXTENDED_NUTRIENT_IDS[row.nutrient_id];
    if (extendedName && row.amount > 0) {
      entry.extended[extendedName] = row.amount;
    }
  }
  
  return nutrientMap;
}

/**
 * Load all nutrients into memory (for small datasets only).
 */
async function loadAllNutrients(
  nutrientPath: string
): Promise<Map<string, NutrientValues & { extended: Record<string, number> }>> {
  const nutrientMap = new Map<string, NutrientValues & { extended: Record<string, number> }>();
  
  if (!fs.existsSync(nutrientPath)) {
    return nutrientMap;
  }
  
  console.log('   Loading food_nutrient.csv into memory...');
  let nutrientCount = 0;
  
  for await (const row of readCSV(nutrientPath, (headers, values) => {
    const idx = (col: string) => headers.indexOf(col);
    return {
      fdc_id: values[idx('fdc_id')],
      nutrient_id: parseInt(values[idx('nutrient_id')], 10),
      amount: parseFloat(values[idx('amount')]) || 0,
    };
  })) {
    if (!row.fdc_id || isNaN(row.nutrient_id)) continue;
    
    let entry = nutrientMap.get(row.fdc_id);
    if (!entry) {
      entry = { extended: {} };
      nutrientMap.set(row.fdc_id, entry);
    }
    
    const fieldName = NUTRIENT_MAP[row.nutrient_id];
    if (fieldName && entry[fieldName] === undefined) {
      entry[fieldName] = row.amount;
    }
    
    const extendedName = EXTENDED_NUTRIENT_IDS[row.nutrient_id];
    if (extendedName && row.amount > 0) {
      entry.extended[extendedName] = row.amount;
    }
    
    nutrientCount++;
    if (nutrientCount % 1000000 === 0) {
      console.log(`      Processed ${(nutrientCount / 1000000).toFixed(1)}M nutrient rows...`);
    }
  }
  
  console.log(`   ✓ Loaded nutrients for ${nutrientMap.size.toLocaleString()} foods`);
  return nutrientMap;
}

// ============================================================================
// Checkpoint Management
// ============================================================================

function loadCheckpoint(dataset: string): Checkpoint | null {
  const checkpointPath = path.join(CHECKPOINT_DIR, `${dataset}.json`);
  if (fs.existsSync(checkpointPath)) {
    try {
      return JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

function saveCheckpoint(checkpoint: Checkpoint): void {
  const checkpointPath = path.join(CHECKPOINT_DIR, `${checkpoint.dataset}.json`);
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

function deleteCheckpoint(dataset: string): void {
  const checkpointPath = path.join(CHECKPOINT_DIR, `${dataset}.json`);
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
    console.log(`   🗑️  Deleted checkpoint for ${dataset}`);
  }
}

// ============================================================================
// Logging Helpers
// ============================================================================

function logDuplicate(entry: DuplicateLogEntry): void {
  const logPath = path.join(OUTPUT_DIR, 'duplicates.jsonl');
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
}

function logError(entry: ErrorLogEntry): void {
  const logPath = path.join(OUTPUT_DIR, 'errors.jsonl');
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
}

// ============================================================================
// Name Normalization
// ============================================================================

/**
 * Fix apostrophe/contraction casing in a title-cased string.
 * Converts possessive 'S and contractions to lowercase while preserving O'Reilly-style names.
 * (Duplicated from lib/food/naturalCase.ts to keep script self-contained)
 */
function fixApostropheCasing(text: string): string {
  if (!text) return text;
  return text
    .replace(/'S\b/g, "'s")     // possessive
    .replace(/'T\b/g, "'t")     // can't, won't
    .replace(/'Re\b/g, "'re")   // we're, you're
    .replace(/'Ve\b/g, "'ve")   // I've, we've
    .replace(/'Ll\b/g, "'ll")   // I'll, we'll
    .replace(/'D\b/g, "'d")     // I'd, we'd
    .replace(/'M\b/g, "'m");    // I'm
}

function normalizeName(description: string): string {
  if (!description) return 'Unknown';
  
  let name = description.trim().replace(/\s+/g, ' ');
  name = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  name = name.replace(/,\s*/g, ', ');
  
  // Fix apostrophe casing (e.g., Wendy'S → Wendy's)
  name = fixApostropheCasing(name);
  
  return name;
}

// ============================================================================
// UPC Deduplication
// ============================================================================

/**
 * Count non-null nutrient fields for completeness scoring.
 */
function nutrientCompleteness(row: FoodObjectInsert): number {
  let count = 0;
  if (row.calories !== null) count++;
  if (row.protein_g !== null) count++;
  if (row.carbs_g !== null) count++;
  if (row.fat_g !== null) count++;
  if (row.sugar_g !== null) count++;
  if (row.fiber_g !== null) count++;
  if (row.sodium_mg !== null) count++;
  return count;
}

/**
 * Compare two rows to determine which is "better" for UPC deduplication.
 * Returns true if row A is better than row B.
 */
function isBetterRow(a: FoodObjectInsert, b: FoodObjectInsert): boolean {
  // 1. Prefer row with brand_name
  const aHasBrand = a.brand_name && a.brand_name.trim().length > 0;
  const bHasBrand = b.brand_name && b.brand_name.trim().length > 0;
  if (aHasBrand && !bHasBrand) return true;
  if (!aHasBrand && bHasBrand) return false;
  
  // 2. Prefer higher nutrient completeness
  const aCompleteness = nutrientCompleteness(a);
  const bCompleteness = nutrientCompleteness(b);
  if (aCompleteness > bCompleteness) return true;
  if (aCompleteness < bCompleteness) return false;
  
  // 3. Prefer longer canonical_name (more descriptive)
  if (a.canonical_name.length > b.canonical_name.length) return true;
  if (a.canonical_name.length < b.canonical_name.length) return false;
  
  // 4. Tie-breaker: higher source_id (fdc_id) - use numeric comparison
  return compareFdcIds(a.source_id, b.source_id) > 0;
}

/**
 * Deduplicate batch by UPC, keeping the "best" row for each UPC.
 * Returns deduplicated batch and logs discarded rows.
 */
function deduplicateBatchByUpc(batch: FoodObjectInsert[]): { 
  dedupedBatch: FoodObjectInsert[]; 
  dedupedCount: number;
} {
  const upcMap = new Map<string, FoodObjectInsert>();
  const noUpcRows: FoodObjectInsert[] = [];
  let dedupedCount = 0;
  
  for (const row of batch) {
    if (!row.upc) {
      noUpcRows.push(row);
      continue;
    }
    
    const existing = upcMap.get(row.upc);
    if (!existing) {
      upcMap.set(row.upc, row);
    } else if (isBetterRow(row, existing)) {
      // Log the row being replaced
      logDuplicate({
        fdc_id: existing.source_id,
        upc: existing.upc!,
        canonical_name: existing.canonical_name,
        brand_name: existing.brand_name,
        reason: 'upc_unique_collision',
        action: 'intra_batch_dedupe',
        timestamp: new Date().toISOString(),
      });
      upcMap.set(row.upc, row);
      dedupedCount++;
    } else {
      // Log the row being discarded
      logDuplicate({
        fdc_id: row.source_id,
        upc: row.upc,
        canonical_name: row.canonical_name,
        brand_name: row.brand_name,
        reason: 'upc_unique_collision',
        action: 'intra_batch_dedupe',
        timestamp: new Date().toISOString(),
      });
      dedupedCount++;
    }
  }
  
  return {
    dedupedBatch: [...Array.from(upcMap.values()), ...noUpcRows],
    dedupedCount,
  };
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let dataset = '';
  let limit: number | undefined;
  let since: string | undefined;
  let dryRun = false;
  let batchSize = 500;
  let resetCheckpoint = false;
  let maxConsecutiveErrors = 3;
  let printStats = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dataset' && args[i + 1]) {
      dataset = args[++i];
    } else if (arg === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (arg === '--since' && args[i + 1]) {
      since = args[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--batch' && args[i + 1]) {
      batchSize = parseInt(args[++i], 10);
    } else if (arg === '--reset-checkpoint') {
      resetCheckpoint = true;
    } else if (arg === '--max-consecutive-errors' && args[i + 1]) {
      maxConsecutiveErrors = parseInt(args[++i], 10);
    } else if (arg === '--print-stats') {
      printStats = true;
    }
  }
  
  if (!dataset || (dataset !== 'all' && !DATASETS[dataset])) {
    console.error('Usage: npx tsx scripts/usda/ingestFdc.ts --dataset <foundation|branded|sr_legacy|survey|all> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --limit N                    Max foods to process');
    console.error('  --since FDC_ID               Resume from fdc_id');
    console.error('  --dry-run                    Preview without inserting');
    console.error('  --batch N                    Batch size (default: 500)');
    console.error('  --reset-checkpoint           Delete checkpoint before starting');
    console.error('  --max-consecutive-errors N   Stop after N consecutive failures (default: 3)');
    console.error('  --print-stats                Print dataset stats and exit');
    console.error('');
    console.error('IMPORTANT: Run scripts/usda/addUsdaIndexes.sql in Supabase before first ingestion!');
    process.exit(1);
  }
  
  return { dataset, limit, since, dryRun, batchSize, resetCheckpoint, maxConsecutiveErrors, printStats };
}

// ============================================================================
// Batch Commit with Error Handling and Row-Level Fallback
// ============================================================================

interface BatchResult {
  inserted: number;
  updated: number;
  hardErrors: number; // Errors that should count toward consecutive error limit
  skipped: number;    // UPC dupes - do NOT count as errors
  promoted: number;
  success: boolean;   // True if batch completed (even with skips), false only on hard failure
  errorMessage?: string;
  firstFailingSourceId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function commitBatch(supabase: any, batch: FoodObjectInsert[]): Promise<BatchResult> {
  if (batch.length === 0) {
    return { inserted: 0, updated: 0, hardErrors: 0, skipped: 0, promoted: 0, success: true };
  }
  
  // Step 1: Deduplicate batch by UPC
  const { dedupedBatch, dedupedCount } = deduplicateBatchByUpc(batch);
  if (dedupedCount > 0) {
    console.log(`   📋 Deduplicated ${dedupedCount} intra-batch UPC duplicates`);
  }
  
  // Step 2: Try batch upsert with retry
  try {
    const result = await withRetry(async () => {
      const { data, error } = await supabase
        .from('food_objects')
        .upsert(dedupedBatch, {
          onConflict: 'source_provider,source_id',
          ignoreDuplicates: false,
        })
        .select('id');
      
      if (error) throw error;
      return data;
    });
    
    return {
      inserted: result?.length || 0,
      updated: 0,
      hardErrors: 0,
      skipped: dedupedCount, // Intra-batch dupes
      promoted: 0,
      success: true,
    };
  } catch (error) {
    const errorMessage = (error as Error)?.message || String(error);
    
    // Check if it's a UPC unique constraint violation - fallback to row-level
    if (isUpcConstraintError(error)) {
      console.log(`   ⚠️  UPC collision detected, falling back to row-level processing...`);
      const rowResult = await processRowByRow(supabase, dedupedBatch);
      // Add intra-batch deduped count to skipped
      rowResult.skipped += dedupedCount;
      return rowResult;
    }
    
    // Check for common constraint error (missing index)
    if (errorMessage.includes('ON CONFLICT')) {
      console.error(`\n   ❌ CONSTRAINT ERROR: ${errorMessage}`);
      console.error(`   💡 Did you run scripts/usda/addUsdaIndexes.sql in Supabase?`);
      console.error(`   💡 See docs/USDA-INGESTION.md for setup instructions.\n`);
    }
    
    // Log all rows as errors
    for (const row of dedupedBatch) {
      logError({
        fdc_id: row.source_id,
        upc: row.upc,
        canonical_name: row.canonical_name,
        error: errorMessage,
        errorType: isTransientError(error) ? 'transient_final' : 'constraint',
        timestamp: new Date().toISOString(),
      });
    }
    
    return {
      inserted: 0,
      updated: 0,
      hardErrors: dedupedBatch.length,
      skipped: dedupedCount,
      promoted: 0,
      success: false,
      errorMessage,
      firstFailingSourceId: dedupedBatch[0]?.source_id,
    };
  }
}

/**
 * Process rows one at a time when batch fails due to UPC collision.
 * Handles promotion of provisional records and skipping of true duplicates.
 * UPC collisions are NOT counted as hard errors.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processRowByRow(supabase: any, batch: FoodObjectInsert[]): Promise<BatchResult> {
  let inserted = 0;
  let updated = 0;
  let hardErrors = 0;
  let skipped = 0;
  let promoted = 0;
  
  for (const row of batch) {
    try {
      // Try upsert by USDA key
      const result = await withRetry(async () => {
        const { data, error } = await supabase
          .from('food_objects')
          .upsert(row, {
            onConflict: 'source_provider,source_id',
            ignoreDuplicates: false,
          })
          .select('id');
        
        if (error) throw error;
        return data;
      });
      
      if (result && result.length > 0) {
        inserted++;
      }
    } catch (error) {
      // Check if it's a UPC unique constraint violation
      if (isUpcConstraintError(error)) {
        // Handle UPC collision - this is NOT a hard error
        const handleResult = await handleUpcCollision(supabase, row);
        
        if (handleResult.action === 'promoted') {
          promoted++;
          updated++;
        } else if (handleResult.action === 'skipped') {
          skipped++;
        } else {
          // Error during collision handling - log but don't count as hard error
          logError({
            fdc_id: row.source_id,
            upc: row.upc,
            canonical_name: row.canonical_name,
            error: handleResult.error || 'Unknown collision handling error',
            errorType: 'unknown',
            timestamp: new Date().toISOString(),
          });
          skipped++; // Still count as skipped, not hard error
        }
      } else {
        // Non-UPC error - this IS a hard error
        const errorMessage = (error as Error)?.message || String(error);
        console.error(`   ❌ Row error (source_id=${row.source_id}): ${errorMessage}`);
        
        logError({
          fdc_id: row.source_id,
          upc: row.upc,
          canonical_name: row.canonical_name,
          error: errorMessage,
          errorType: isTransientError(error) ? 'transient_final' : 'unknown',
          timestamp: new Date().toISOString(),
        });
        
        hardErrors++;
      }
    }
  }
  
  // Success means all rows were processed (even if some were skipped/promoted)
  // Only hard errors indicate failure
  return {
    inserted,
    updated,
    hardErrors,
    skipped,
    promoted,
    success: hardErrors === 0,
  };
}

/**
 * Handle UPC collision: either promote provisional or skip.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUpcCollision(
  supabase: any, 
  newRow: FoodObjectInsert
): Promise<{ action: 'promoted' | 'skipped' | 'error'; error?: string }> {
  if (!newRow.upc) {
    return { action: 'error', error: 'No UPC on row' };
  }
  
  try {
    // Query existing record with this UPC
    const { data: existing, error: queryError } = await withRetry(async () => {
      return await supabase
        .from('food_objects')
        .select('id, source_type, source_provider, source_id, canonical_name')
        .eq('upc', newRow.upc)
        .eq('is_deleted', false)
        .limit(1)
        .single();
    });
    
    if (queryError || !existing) {
      return { action: 'error', error: queryError?.message || 'No existing record found' };
    }
    
    // Check if existing is a provisional/scan record
    const isProvisional = 
      existing.source_type === 'provisional' || 
      existing.source_provider === 'scan';
    
    if (isProvisional) {
      // PROMOTE: Update the existing provisional record with USDA data
      const { error: updateError } = await withRetry(async () => {
        return await supabase
          .from('food_objects')
          .update({
            canonical_name: newRow.canonical_name,
            brand_name: newRow.brand_name,
            aliases: newRow.aliases,
            source_type: newRow.source_type,
            source_provider: newRow.source_provider,
            source_id: newRow.source_id,
            // Keep UPC as-is (it's the same)
            serving_size_g: newRow.serving_size_g,
            serving_unit: newRow.serving_unit,
            serving_description: newRow.serving_description,
            household_serving_text: newRow.household_serving_text,
            calories: newRow.calories,
            protein_g: newRow.protein_g,
            carbs_g: newRow.carbs_g,
            fat_g: newRow.fat_g,
            fiber_g: newRow.fiber_g,
            sugar_g: newRow.sugar_g,
            sodium_mg: newRow.sodium_mg,
            nutrients_extended: newRow.nutrients_extended,
            nutrient_provenance: newRow.nutrient_provenance,
            nutrient_confidence: newRow.nutrient_confidence,
            category: newRow.category,
            is_verified: true,
          })
          .eq('id', existing.id);
      });
      
      if (updateError) {
        return { action: 'error', error: updateError.message };
      }
      
      // Log the promotion
      logDuplicate({
        fdc_id: newRow.source_id,
        upc: newRow.upc,
        canonical_name: newRow.canonical_name,
        brand_name: newRow.brand_name,
        existing_id: existing.id,
        existing_source_provider: existing.source_provider,
        existing_source_id: existing.source_id,
        existing_source_type: existing.source_type,
        reason: 'upc_unique_collision',
        action: 'promoted',
        timestamp: new Date().toISOString(),
      });
      
      console.log(`   ✨ Promoted provisional → USDA: ${newRow.canonical_name.substring(0, 40)}...`);
      return { action: 'promoted' };
    } else {
      // SKIP: Existing is a real food, don't overwrite
      logDuplicate({
        fdc_id: newRow.source_id,
        upc: newRow.upc,
        canonical_name: newRow.canonical_name,
        brand_name: newRow.brand_name,
        existing_id: existing.id,
        existing_source_provider: existing.source_provider,
        existing_source_id: existing.source_id,
        existing_source_type: existing.source_type,
        reason: 'upc_unique_collision',
        action: 'skipped',
        timestamp: new Date().toISOString(),
      });
      
      return { action: 'skipped' };
    }
  } catch (error) {
    return { action: 'error', error: (error as Error)?.message || String(error) };
  }
}

// ============================================================================
// Progress Logging
// ============================================================================

function formatProgress(
  processed: number,
  inserted: number,
  updated: number,
  skipped: number,
  promoted: number,
  hardErrors: number,
  currentFdcId: string,
  lastCheckpointId: string,
  rate: number
): string {
  return `   📊 ${processed.toLocaleString()} foods (${rate}/s) | ` +
         `I:${inserted} U:${updated} S:${skipped} P:${promoted} E:${hardErrors} | ` +
         `fdc:${currentFdcId} ckpt:${lastCheckpointId || 'none'}`;
}

// ============================================================================
// Main Ingestion Function
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ingestDataset(
  supabase: any,
  datasetName: string,
  config: typeof DATASETS[string],
  options: ParsedArgs
): Promise<void> {
  const datasetPath = path.join(DATA_ROOT, config.folder);
  const foodCsvPath = path.join(datasetPath, 'food.csv');
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📦 Ingesting: ${datasetName.toUpperCase()}`);
  console.log(`   Path: ${datasetPath}`);
  console.log(`   Source type: ${config.sourceType}`);
  console.log(`   Confidence: ${config.confidence}`);
  console.log(`   Memory mode: ${config.isLarge ? 'streaming (low memory)' : 'in-memory'}`);
  console.log(`   Batch size: ${options.batchSize}`);
  console.log(`   Max consecutive errors: ${options.maxConsecutiveErrors}`);
  if (options.limit) console.log(`   Limit: ${options.limit}`);
  if (options.since) console.log(`   Since fdc_id: ${options.since}`);
  if (options.dryRun) console.log(`   🔍 DRY RUN MODE`);
  console.log('='.repeat(70));
  
  if (!fs.existsSync(datasetPath)) {
    console.error(`  ❌ Dataset folder not found: ${datasetPath}`);
    return;
  }
  
  // Handle checkpoint reset
  if (options.resetCheckpoint) {
    deleteCheckpoint(datasetName);
  }
  
  // Load existing checkpoint
  const existingCheckpoint = loadCheckpoint(datasetName);
  const sinceFdcId = options.since || existingCheckpoint?.lastSuccessfulFdcId || null;
  
  // === VERIFICATION GUARD: Detect false-positive completion ===
  if (sinceFdcId && !options.resetCheckpoint) {
    console.log('\n🔍 Verifying checkpoint integrity...');
    
    // Get CSV stats
    const csvStats = await getDatasetCsvStats(foodCsvPath);
    const checkpointNum = parseInt(sinceFdcId, 10);
    
    console.log(`   Checkpoint fdc_id:  ${sinceFdcId} (${checkpointNum.toLocaleString()})`);
    console.log(`   CSV max fdc_id:     ${csvStats.maxFdcId.toLocaleString()}`);
    console.log(`   CSV row count:      ${csvStats.rowCount.toLocaleString()}`);
    
    // Check if checkpoint is at or past the max fdc_id
    if (checkpointNum >= csvStats.maxFdcId) {
      // Get DB stats to verify completion
      const dbStats = await getDbStats(supabase, config.sourceType);
      console.log(`   DB total:           ${dbStats.total.toLocaleString()}`);
      
      const coverage = csvStats.rowCount > 0 ? (dbStats.total / csvStats.rowCount) : 0;
      
      if (coverage < 0.9) { // Less than 90% coverage
        console.log('\n   ⚠️  ════════════════════════════════════════════════════════════');
        console.log('   ⚠️  WARNING: CHECKPOINT INDICATES COMPLETION BUT DB IS INCOMPLETE');
        console.log('   ⚠️  ════════════════════════════════════════════════════════════');
        console.log(`   ⚠️  Checkpoint: ${sinceFdcId} (at/past max ${csvStats.maxFdcId})`);
        console.log(`   ⚠️  DB rows: ${dbStats.total.toLocaleString()} / ${csvStats.rowCount.toLocaleString()} (${(coverage * 100).toFixed(1)}%)`);
        console.log(`   ⚠️  Expected: ~${csvStats.rowCount.toLocaleString()} rows`);
        console.log('   ⚠️');
        console.log('   ⚠️  This likely means a previous run had errors but the checkpoint');
        console.log('   ⚠️  was corrupted or set incorrectly.');
        console.log('   ⚠️');
        console.log('   ⚠️  To fix: Re-run with --reset-checkpoint');
        console.log('   ⚠️  ════════════════════════════════════════════════════════════\n');
        
        console.log('   ❌ Aborting to prevent skipping rows. Use --reset-checkpoint to re-ingest.');
        return;
      } else {
        console.log(`   ✓ DB appears complete (${(coverage * 100).toFixed(1)}% coverage)`);
      }
    } else {
      console.log(`   ✓ Checkpoint is valid (resuming from ${sinceFdcId})`);
    }
  }
  
  if (sinceFdcId) {
    console.log(`\n   📍 Resuming from fdc_id: ${sinceFdcId}`);
  }
  
  // Build lookup maps
  console.log('\n📚 Building lookup maps...');
  
  const nutrientPath = path.join(datasetPath, 'food_nutrient.csv');
  
  // For small datasets, load nutrients into memory
  // For large datasets (branded), we'll stream per-batch
  let fullNutrientMap: Map<string, NutrientValues & { extended: Record<string, number> }> | null = null;
  if (!config.isLarge) {
    fullNutrientMap = await loadAllNutrients(nutrientPath);
  } else {
    console.log('   ℹ️  Large dataset: nutrients will be streamed per-batch');
  }
  
  // Branded food lookup (for branded dataset)
  let brandedMap = new Map<string, BrandedFoodRow>();
  if (datasetName === 'branded') {
    const brandedPath = path.join(datasetPath, 'branded_food.csv');
    if (fs.existsSync(brandedPath)) {
      console.log('   Loading branded_food.csv...');
      brandedMap = await buildLookupMap(
        brandedPath,
        (h, r) => r[h.indexOf('fdc_id')],
        (h, r) => ({
          fdc_id: r[h.indexOf('fdc_id')],
          brand_owner: r[h.indexOf('brand_owner')],
          brand_name: r[h.indexOf('brand_name')],
          gtin_upc: r[h.indexOf('gtin_upc')],
          serving_size: r[h.indexOf('serving_size')],
          serving_size_unit: r[h.indexOf('serving_size_unit')],
          household_serving_fulltext: r[h.indexOf('household_serving_fulltext')],
          branded_food_category: r[h.indexOf('branded_food_category')],
        }),
        500000
      );
      console.log(`   ✓ Loaded ${brandedMap.size.toLocaleString()} branded food records`);
    }
  }
  
  // Food portion lookup (for non-branded datasets)
  let portionMap = new Map<string, FoodPortionRow>();
  if (datasetName !== 'branded') {
    const portionPath = path.join(datasetPath, 'food_portion.csv');
    if (fs.existsSync(portionPath)) {
      console.log('   Loading food_portion.csv...');
      for await (const row of readCSV(portionPath, (h, r) => ({
        fdc_id: r[h.indexOf('fdc_id')],
        portion_description: r[h.indexOf('portion_description')],
        gram_weight: r[h.indexOf('gram_weight')],
        modifier: r[h.indexOf('modifier')],
      }))) {
        if (!portionMap.has(row.fdc_id)) {
          portionMap.set(row.fdc_id, row);
        }
      }
      console.log(`   ✓ Loaded ${portionMap.size.toLocaleString()} portion records`);
    }
  }
  
  // Category lookup
  let categoryMap = new Map<string, string>();
  const categoryPath = path.join(datasetPath, 'food_category.csv');
  if (fs.existsSync(categoryPath)) {
    console.log('   Loading food_category.csv...');
    categoryMap = await buildLookupMap(
      categoryPath,
      (h, r) => r[h.indexOf('id')],
      (h, r) => r[h.indexOf('description')]
    );
    console.log(`   ✓ Loaded ${categoryMap.size} categories`);
  }
  
  // Process foods
  console.log('\n🍎 Processing foods...');
  
  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let hardErrors = 0;
  let skipped = 0;
  let promoted = 0;
  let batch: FoodObjectInsert[] = [];
  let batchFdcIds: string[] = [];
  let lastFdcId = '';
  let lastSuccessfulFdcId = sinceFdcId || '';
  let skippedByCheckpoint = 0;
  let consecutiveHardErrors = 0;
  
  const startTime = Date.now();
  
  for await (const food of readCSV<FoodRow>(foodCsvPath, (h, r) => ({
    fdc_id: r[h.indexOf('fdc_id')],
    description: r[h.indexOf('description')],
    data_type: r[h.indexOf('data_type')],
    food_category_id: r[h.indexOf('food_category_id')],
  }))) {
    // Skip if before checkpoint (using NUMERIC comparison)
    if (shouldSkipByCheckpoint(food.fdc_id, sinceFdcId)) {
      skippedByCheckpoint++;
      continue;
    }
    
    // Check limit
    if (options.limit && processed >= options.limit) {
      break;
    }
    
    processed++;
    lastFdcId = food.fdc_id;
    batchFdcIds.push(food.fdc_id);
    
    // Build food object (without nutrients for now if streaming)
    const canonicalName = normalizeName(food.description);
    let brandName: string | null = null;
    let upc: string | null = null;
    let servingSizeG: number = 100;
    let servingUnit: string = 'g';
    let servingDescription: string | null = null;
    let householdServingText: string | null = null;
    let category: string | null = categoryMap.get(food.food_category_id || '') || null;
    
    // Branded-specific data
    if (datasetName === 'branded') {
      const branded = brandedMap.get(food.fdc_id);
      if (branded) {
        brandName = branded.brand_owner || branded.brand_name || null;
        upc = branded.gtin_upc || null;
        
        if (branded.serving_size) {
          const size = parseFloat(branded.serving_size);
          if (!isNaN(size) && size > 0) {
            servingSizeG = size;
            servingUnit = branded.serving_size_unit || 'g';
          }
        }
        
        householdServingText = branded.household_serving_fulltext || null;
        servingDescription = householdServingText || 
          (servingSizeG && servingUnit ? `${servingSizeG} ${servingUnit}` : null);
        
        category = branded.branded_food_category || category;
      }
    } else {
      // Non-branded: use portion data
      const portion = portionMap.get(food.fdc_id);
      if (portion) {
        const gramWeight = parseFloat(portion.gram_weight || '');
        if (!isNaN(gramWeight) && gramWeight > 0) {
          servingSizeG = gramWeight;
        }
        
        servingDescription = portion.portion_description || null;
        householdServingText = portion.modifier || null;
        
        if (portion.portion_description) {
          const unitMatch = portion.portion_description.match(/^[\d.]+\s*(\w+)/);
          if (unitMatch) {
            servingUnit = unitMatch[1].toLowerCase();
          }
        }
      }
    }
    
    // Build aliases
    const aliases: string[] = [food.description];
    if (brandName && canonicalName !== `${brandName} ${canonicalName}`) {
      aliases.push(`${brandName} ${food.description}`);
    }
    
    // Build food object (nutrients will be added per-batch for large datasets)
    const foodObject: FoodObjectInsert = {
      canonical_name: canonicalName,
      brand_name: brandName,
      aliases,
      source_type: config.sourceType,
      source_provider: 'usda',
      source_id: food.fdc_id,
      source_dataset: datasetName,  // Track which USDA dataset this came from
      upc,
      serving_size_g: servingSizeG,
      serving_unit: servingUnit,
      serving_description: servingDescription,
      household_serving_text: householdServingText,
      // Nutrients - will be filled in below
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      fiber_g: null,
      sugar_g: null,
      sodium_mg: null,
      nutrients_extended: null,
      nutrient_provenance: 'usda',
      nutrient_confidence: config.confidence,
      category,
      is_verified: true,
      is_deleted: false,
      person_id: null,
    };
    
    // For small datasets, add nutrients from in-memory map
    if (fullNutrientMap) {
      const nutrients = fullNutrientMap.get(food.fdc_id);
      if (nutrients) {
        foodObject.calories = nutrients.calories ?? null;
        foodObject.protein_g = nutrients.protein_g ?? null;
        foodObject.carbs_g = nutrients.carbs_g ?? null;
        foodObject.fat_g = nutrients.fat_g ?? null;
        foodObject.fiber_g = nutrients.fiber_g ?? null;
        foodObject.sugar_g = nutrients.sugar_g ?? null;
        foodObject.sodium_mg = nutrients.sodium_mg ?? null;
        foodObject.nutrients_extended = Object.keys(nutrients.extended).length > 0 
          ? nutrients.extended : null;
      }
    }
    
    batch.push(foodObject);
    
    // Commit batch
    if (batch.length >= options.batchSize) {
      // For large datasets, load nutrients for this batch
      if (config.isLarge && !fullNutrientMap) {
        const batchNutrients = await loadNutrientsForFdcIds(
          nutrientPath,
          new Set(batchFdcIds)
        );
        
        // Add nutrients to batch items
        for (const item of batch) {
          const nutrients = batchNutrients.get(item.source_id);
          if (nutrients) {
            item.calories = nutrients.calories ?? null;
            item.protein_g = nutrients.protein_g ?? null;
            item.carbs_g = nutrients.carbs_g ?? null;
            item.fat_g = nutrients.fat_g ?? null;
            item.fiber_g = nutrients.fiber_g ?? null;
            item.sugar_g = nutrients.sugar_g ?? null;
            item.sodium_mg = nutrients.sodium_mg ?? null;
            item.nutrients_extended = Object.keys(nutrients.extended).length > 0 
              ? nutrients.extended : null;
          }
        }
      }
      
      if (!options.dryRun) {
        const result = await commitBatch(supabase, batch);
        inserted += result.inserted;
        updated += result.updated;
        hardErrors += result.hardErrors;
        skipped += result.skipped;
        promoted += result.promoted;
        
        if (result.success) {
          // Only advance checkpoint on success (no hard errors)
          lastSuccessfulFdcId = lastFdcId;
          consecutiveHardErrors = 0;
          
          // Save checkpoint after successful batch
          saveCheckpoint({
            dataset: datasetName,
            lastFdcId,
            lastSuccessfulFdcId,
            processed,
            inserted,
            updated,
            errors: hardErrors,
            skipped,
            promoted,
            lastRunAt: new Date().toISOString(),
          });
        } else {
          consecutiveHardErrors++;
          console.error(`   ⚠️  Batch failed at fdc_id: ${result.firstFailingSourceId}`);
          console.error(`   ⚠️  Error: ${result.errorMessage}`);
          console.error(`   ⚠️  Consecutive hard errors: ${consecutiveHardErrors}/${options.maxConsecutiveErrors}`);
          
          if (consecutiveHardErrors >= options.maxConsecutiveErrors) {
            console.error(`\n   ❌ Too many consecutive hard errors (${consecutiveHardErrors}). Stopping.`);
            console.error(`   💡 Fix the issue and re-run. Will resume from: ${lastSuccessfulFdcId || 'beginning'}`);
            console.error(`   📄 Error log: scripts/usda/output/errors.jsonl`);
            break;
          }
        }
      }
      
      // Progress log with checkpoint info
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = Math.round(processed / elapsed);
      console.log(formatProgress(
        processed, inserted, updated, skipped, promoted, hardErrors,
        lastFdcId, lastSuccessfulFdcId, rate
      ));
      
      batch = [];
      batchFdcIds = [];
    }
  }
  
  // Commit remaining batch
  if (batch.length > 0 && !options.dryRun) {
    // Load nutrients for final batch if streaming
    if (config.isLarge && !fullNutrientMap) {
      const batchNutrients = await loadNutrientsForFdcIds(
        nutrientPath,
        new Set(batchFdcIds)
      );
      
      for (const item of batch) {
        const nutrients = batchNutrients.get(item.source_id);
        if (nutrients) {
          item.calories = nutrients.calories ?? null;
          item.protein_g = nutrients.protein_g ?? null;
          item.carbs_g = nutrients.carbs_g ?? null;
          item.fat_g = nutrients.fat_g ?? null;
          item.fiber_g = nutrients.fiber_g ?? null;
          item.sugar_g = nutrients.sugar_g ?? null;
          item.sodium_mg = nutrients.sodium_mg ?? null;
          item.nutrients_extended = Object.keys(nutrients.extended).length > 0 
            ? nutrients.extended : null;
        }
      }
    }
    
    const result = await commitBatch(supabase, batch);
    inserted += result.inserted;
    updated += result.updated;
    hardErrors += result.hardErrors;
    skipped += result.skipped;
    promoted += result.promoted;
    
    if (result.success) {
      lastSuccessfulFdcId = lastFdcId;
    }
  }
  
  // Final checkpoint
  saveCheckpoint({
    dataset: datasetName,
    lastFdcId,
    lastSuccessfulFdcId,
    processed,
    inserted,
    updated,
    errors: hardErrors,
    skipped,
    promoted,
    lastRunAt: new Date().toISOString(),
  });
  
  // Summary
  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ Dataset complete: ${datasetName}`);
  console.log('='.repeat(70));
  console.log(`   Skipped (checkpoint): ${skippedByCheckpoint.toLocaleString()}`);
  console.log(`   Processed: ${processed.toLocaleString()}`);
  console.log(`   Inserted: ${inserted.toLocaleString()}`);
  console.log(`   Updated: ${updated.toLocaleString()}`);
  console.log(`   Skipped (UPC dupe): ${skipped.toLocaleString()}`);
  console.log(`   Promoted (provisional→USDA): ${promoted.toLocaleString()}`);
  console.log(`   Hard errors: ${hardErrors.toLocaleString()}`);
  console.log(`   Time: ${elapsed.toFixed(1)}s`);
  console.log(`   Last checkpoint: ${lastSuccessfulFdcId || 'none'}`);
  
  if (hardErrors > 0) {
    console.log(`\n   ⚠️  Some rows had hard errors. Check: scripts/usda/output/errors.jsonl`);
    console.log(`   💡 Re-run to retry from checkpoint: ${lastSuccessfulFdcId || 'beginning'}`);
  }
  
  if (skipped > 0 || promoted > 0) {
    console.log(`   📄 Duplicate log: scripts/usda/output/duplicates.jsonl`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs();
  
  console.log('🚀 USDA FoodData Central Ingestion');
  console.log(`   Dataset: ${options.dataset}`);
  console.log(`   Batch size: ${options.batchSize}`);
  console.log(`   Max consecutive errors: ${options.maxConsecutiveErrors}`);
  
  // Initialize Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables');
    console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  // Handle --print-stats
  if (options.printStats) {
    const datasetsToProcess = options.dataset === 'all' 
      ? Object.keys(DATASETS) 
      : [options.dataset];
    
    for (const datasetName of datasetsToProcess) {
      await printDatasetStats(supabase, datasetName, DATASETS[datasetName]);
    }
    return;
  }
  
  // Ingest requested datasets
  const datasetsToProcess = options.dataset === 'all' 
    ? Object.keys(DATASETS) 
    : [options.dataset];
  
  for (const datasetName of datasetsToProcess) {
    await ingestDataset(supabase, datasetName, DATASETS[datasetName], options);
  }
  
  console.log('\n🎉 Ingestion complete!');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
