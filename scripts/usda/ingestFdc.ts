/**
 * USDA FoodData Central Ingestion Script
 * 
 * Ingests USDA FDC CSV data into the food_objects table.
 * Supports incremental ingestion with checkpoints.
 * 
 * Usage:
 *   npx tsx scripts/usda/ingestFdc.ts --dataset foundation --limit 100
 *   npx tsx scripts/usda/ingestFdc.ts --dataset branded --since 1500000
 *   npx tsx scripts/usda/ingestFdc.ts --dataset all --dry-run
 * 
 * Options:
 *   --dataset   foundation|branded|sr_legacy|survey|all (required)
 *   --limit     Max foods to process (for testing)
 *   --since     Resume from fdc_id (checkpoint)
 *   --dry-run   Print what would be inserted without inserting
 *   --batch     Batch size for commits (default: 500)
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

// Ensure checkpoint directory exists
if (!fs.existsSync(CHECKPOINT_DIR)) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

// Dataset configurations
const DATASETS: Record<string, { folder: string; sourceType: 'branded' | 'common'; confidence: 'high' | 'medium' }> = {
  foundation: {
    folder: 'FoodData_Central_foundation_food_csv_2025-12-18',
    sourceType: 'common',
    confidence: 'high',
  },
  branded: {
    folder: 'FoodData_Central_branded_food_csv_2025-12-18',
    sourceType: 'branded',
    confidence: 'medium',
  },
  sr_legacy: {
    folder: 'FoodData_Central_sr_legacy_food_csv_2018-04',
    sourceType: 'common',
    confidence: 'medium',
  },
  survey: {
    folder: 'FoodData_Central_survey_food_csv_2024-10-31',
    sourceType: 'common',
    confidence: 'medium',
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
  ingredients?: string;
}

interface FoodPortionRow {
  fdc_id: string;
  portion_description?: string;
  gram_weight?: string;
  modifier?: string;
  amount?: string;
}

interface CategoryRow {
  id: string;
  description: string;
}

interface Checkpoint {
  dataset: string;
  lastFdcId: string;
  processed: number;
  inserted: number;
  updated: number;
  errors: number;
  lastRunAt: string;
}

// CSV parsing helper
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

// Read CSV file as async iterator
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

// Build a lookup map from CSV
async function buildLookupMap<K, V>(
  filePath: string,
  keyExtractor: (headers: string[], row: string[]) => K,
  valueExtractor: (headers: string[], row: string[]) => V
): Promise<Map<K, V>> {
  const map = new Map<K, V>();
  
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${path.basename(filePath)}`);
    return map;
  }
  
  for await (const _ of readCSV(filePath, (h, r) => {
    const key = keyExtractor(h, r);
    const value = valueExtractor(h, r);
    map.set(key, value);
    return null;
  })) {
    // Just iterate to build map
  }
  
  return map;
}

// Normalize food name to title case
function normalizeName(description: string): string {
  if (!description) return 'Unknown';
  
  // Clean up excessive whitespace
  let name = description.trim().replace(/\s+/g, ' ');
  
  // Title case transformation
  name = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  
  // Fix common patterns (all caps brand names, etc.)
  name = name.replace(/,\s*/g, ', ');
  
  return name;
}

// Load checkpoint
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

// Save checkpoint
function saveCheckpoint(checkpoint: Checkpoint): void {
  const checkpointPath = path.join(CHECKPOINT_DIR, `${checkpoint.dataset}.json`);
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

// Parse CLI arguments
function parseArgs(): { dataset: string; limit?: number; since?: string; dryRun: boolean; batchSize: number } {
  const args = process.argv.slice(2);
  let dataset = '';
  let limit: number | undefined;
  let since: string | undefined;
  let dryRun = false;
  let batchSize = 500;
  
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
    }
  }
  
  if (!dataset || (dataset !== 'all' && !DATASETS[dataset])) {
    console.error('Usage: npx tsx scripts/usda/ingestFdc.ts --dataset <foundation|branded|sr_legacy|survey|all> [--limit N] [--since fdc_id] [--dry-run] [--batch N]');
    process.exit(1);
  }
  
  return { dataset, limit, since, dryRun, batchSize };
}

// Main ingestion function for a single dataset
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ingestDataset(
  supabase: any,
  datasetName: string,
  config: typeof DATASETS[string],
  options: { limit?: number; since?: string; dryRun: boolean; batchSize: number }
): Promise<void> {
  const datasetPath = path.join(DATA_ROOT, config.folder);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 Ingesting: ${datasetName.toUpperCase()}`);
  console.log(`   Path: ${datasetPath}`);
  console.log(`   Source type: ${config.sourceType}`);
  console.log(`   Confidence: ${config.confidence}`);
  if (options.limit) console.log(`   Limit: ${options.limit}`);
  if (options.since) console.log(`   Since fdc_id: ${options.since}`);
  if (options.dryRun) console.log(`   🔍 DRY RUN MODE`);
  console.log('='.repeat(60));
  
  if (!fs.existsSync(datasetPath)) {
    console.error(`  ❌ Dataset folder not found: ${datasetPath}`);
    return;
  }
  
  // Load existing checkpoint
  const existingCheckpoint = loadCheckpoint(datasetName);
  const sinceFdcId = options.since || existingCheckpoint?.lastFdcId;
  
  // Build lookup maps
  console.log('\n📚 Building lookup maps...');
  
  // Nutrient lookup: fdc_id -> NutrientValues
  const nutrientPath = path.join(datasetPath, 'food_nutrient.csv');
  const nutrientMap = new Map<string, NutrientValues & { extended: Record<string, number> }>();
  
  if (fs.existsSync(nutrientPath)) {
    console.log('   Loading food_nutrient.csv...');
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
      
      // Map to our fields
      const fieldName = NUTRIENT_MAP[row.nutrient_id];
      if (fieldName) {
        // Only set if not already set (prefer first match for energy)
        if (entry[fieldName] === undefined) {
          entry[fieldName] = row.amount;
        }
      }
      
      // Extended nutrients
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
          ingredients: r[h.indexOf('ingredients')],
        })
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
      // Only keep first portion per food
      for await (const row of readCSV(portionPath, (h, r) => ({
        fdc_id: r[h.indexOf('fdc_id')],
        portion_description: r[h.indexOf('portion_description')],
        gram_weight: r[h.indexOf('gram_weight')],
        modifier: r[h.indexOf('modifier')],
        amount: r[h.indexOf('amount')],
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
  const foodPath = path.join(datasetPath, 'food.csv');
  
  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  let batch: FoodObjectInsert[] = [];
  let lastFdcId = '';
  let skippedByCheckpoint = 0;
  
  const startTime = Date.now();
  
  for await (const food of readCSV<FoodRow>(foodPath, (h, r) => ({
    fdc_id: r[h.indexOf('fdc_id')],
    description: r[h.indexOf('description')],
    data_type: r[h.indexOf('data_type')],
    food_category_id: r[h.indexOf('food_category_id')],
  }))) {
    // Skip if before checkpoint
    if (sinceFdcId && food.fdc_id <= sinceFdcId) {
      skippedByCheckpoint++;
      continue;
    }
    
    // Check limit
    if (options.limit && processed >= options.limit) {
      break;
    }
    
    processed++;
    lastFdcId = food.fdc_id;
    
    // Get nutrient data
    const nutrients = nutrientMap.get(food.fdc_id) || { extended: {} };
    
    // Build food object
    const canonicalName = normalizeName(food.description);
    let brandName: string | null = null;
    let upc: string | null = null;
    let servingSizeG: number = 100; // Default to 100g
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
        
        // Parse serving size
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
        
        // Try to extract unit from portion description
        if (portion.portion_description) {
          const unitMatch = portion.portion_description.match(/^[\d.]+\s*(\w+)/);
          if (unitMatch) {
            servingUnit = unitMatch[1].toLowerCase();
          }
        }
      }
    }
    
    // Build aliases
    const aliases: string[] = [food.description]; // Original description
    if (brandName && canonicalName !== `${brandName} ${canonicalName}`) {
      aliases.push(`${brandName} ${food.description}`);
    }
    
    // Build extended nutrients (only if non-empty)
    const nutrientsExtended = Object.keys(nutrients.extended).length > 0 
      ? nutrients.extended 
      : null;
    
    // Build insert/update object
    const foodObject: FoodObjectInsert = {
      canonical_name: canonicalName,
      brand_name: brandName,
      aliases,
      source_type: config.sourceType,
      source_provider: 'usda',
      source_id: food.fdc_id,
      upc,
      serving_size_g: servingSizeG,
      serving_unit: servingUnit,
      serving_description: servingDescription,
      household_serving_text: householdServingText,
      calories: nutrients.calories ?? null,
      protein_g: nutrients.protein_g ?? null,
      carbs_g: nutrients.carbs_g ?? null,
      fat_g: nutrients.fat_g ?? null,
      fiber_g: nutrients.fiber_g ?? null,
      sugar_g: nutrients.sugar_g ?? null,
      sodium_mg: nutrients.sodium_mg ?? null,
      nutrients_extended: nutrientsExtended,
      nutrient_provenance: 'usda',
      nutrient_confidence: config.confidence,
      category,
      is_verified: true,
      is_deleted: false,
      person_id: null,
    };
    
    batch.push(foodObject);
    
    // Commit batch
    if (batch.length >= options.batchSize) {
      if (!options.dryRun) {
        const result = await commitBatch(supabase, batch);
        inserted += result.inserted;
        updated += result.updated;
        errors += result.errors;
      }
      
      // Progress log
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = Math.round(processed / elapsed);
      console.log(`   Processed ${processed.toLocaleString()} foods (${rate}/s) - I:${inserted} U:${updated} E:${errors}`);
      
      // Save checkpoint
      saveCheckpoint({
        dataset: datasetName,
        lastFdcId,
        processed,
        inserted,
        updated,
        errors,
        lastRunAt: new Date().toISOString(),
      });
      
      batch = [];
    }
  }
  
  // Commit remaining batch
  if (batch.length > 0 && !options.dryRun) {
    const result = await commitBatch(supabase, batch);
    inserted += result.inserted;
    updated += result.updated;
    errors += result.errors;
  }
  
  // Final checkpoint
  saveCheckpoint({
    dataset: datasetName,
    lastFdcId,
    processed,
    inserted,
    updated,
    errors,
    lastRunAt: new Date().toISOString(),
  });
  
  // Summary
  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\n✅ Dataset complete: ${datasetName}`);
  console.log(`   Skipped (checkpoint): ${skippedByCheckpoint.toLocaleString()}`);
  console.log(`   Processed: ${processed.toLocaleString()}`);
  console.log(`   Inserted: ${inserted.toLocaleString()}`);
  console.log(`   Updated: ${updated.toLocaleString()}`);
  console.log(`   Errors: ${errors.toLocaleString()}`);
  console.log(`   Time: ${elapsed.toFixed(1)}s`);
}

// Food object type for database insert
interface FoodObjectInsert {
  canonical_name: string;
  brand_name: string | null;
  aliases: string[];
  source_type: 'branded' | 'common';
  source_provider: string;
  source_id: string;
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

// Commit a batch of food objects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function commitBatch(
  supabase: any,
  batch: FoodObjectInsert[]
): Promise<{ inserted: number; updated: number; errors: number }> {
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  
  // Use upsert with ON CONFLICT on (source_provider, source_id)
  // Note: This requires the unique index to exist
  const { data, error } = await supabase
    .from('food_objects')
    .upsert(batch, {
      onConflict: 'source_provider,source_id',
      ignoreDuplicates: false,
    })
    .select('id');
  
  if (error) {
    console.error(`   ❌ Batch error: ${error.message}`);
    errors = batch.length;
  } else {
    // Supabase upsert doesn't distinguish insert vs update in response
    // For now, count all as "inserted" (could query before to get actual count)
    inserted = data?.length || 0;
  }
  
  return { inserted, updated, errors };
}

// Main
async function main(): Promise<void> {
  const options = parseArgs();
  
  console.log('🚀 USDA FoodData Central Ingestion');
  console.log(`   Dataset: ${options.dataset}`);
  console.log(`   Batch size: ${options.batchSize}`);
  
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
