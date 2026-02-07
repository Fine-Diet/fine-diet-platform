/**
 * USDA Ingestion Health Check CLI
 * 
 * Prints a compact dashboard of ingestion health metrics.
 * 
 * Usage:
 *   npx tsx scripts/usda/healthCheck.ts --dataset branded
 *   npx tsx scripts/usda/healthCheck.ts --dataset all
 *   npx tsx scripts/usda/healthCheck.ts --dataset branded --checkpoint 2500000
 *   npx tsx scripts/usda/healthCheck.ts --dataset branded --window 20000
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const CHECKPOINT_DIR = path.join(__dirname, '.checkpoints');

// ============================================================================
// Types
// ============================================================================

interface Checkpoint {
  dataset: string;
  lastFdcId: string;
  lastSuccessfulFdcId: string;
  processed: number;
  inserted: number;
  skipped: number;
  failed: number;
  timestamp: string;
}

interface HealthCheckOptions {
  dataset: string;
  checkpoint?: number;
  window: number;
}

interface DatasetStats {
  dataset: string;
  count: number;
  minFdcId: number | null;
  maxFdcId: number | null;
}

// ============================================================================
// Checkpoint Loading
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

// ============================================================================
// Database Queries
// ============================================================================

async function getDatasetCounts(supabase: any): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('food_objects')
    .select('source_dataset', { count: 'exact', head: false })
    .eq('is_deleted', false)
    .eq('source_provider', 'usda');
  
  if (error) throw new Error(`Failed to get dataset counts: ${error.message}`);
  
  // Group by source_dataset
  const counts = new Map<string, number>();
  counts.set('branded', 0);
  counts.set('foundation', 0);
  counts.set('sr_legacy', 0);
  counts.set('survey', 0);
  counts.set('fndds', 0);
  counts.set('untagged', 0);
  
  // We need to query each individually since Supabase doesn't support GROUP BY easily
  for (const dataset of ['branded', 'foundation', 'sr_legacy', 'survey', 'fndds']) {
    const { count } = await supabase
      .from('food_objects')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .eq('source_provider', 'usda')
      .eq('source_dataset', dataset);
    counts.set(dataset, count || 0);
  }
  
  // Untagged
  const { count: untaggedCount } = await supabase
    .from('food_objects')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('source_provider', 'usda')
    .is('source_dataset', null);
  counts.set('untagged', untaggedCount || 0);
  
  return counts;
}

async function getNonNumericCount(supabase: any): Promise<number> {
  // Can't use regex in PostgREST, so we'll use RPC or just report this needs SQL check
  // For now, return -1 to indicate "check SQL"
  return -1;
}

async function getFoundationStillBranded(supabase: any): Promise<number> {
  const { count } = await supabase
    .from('food_objects')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('source_provider', 'usda')
    .eq('source_dataset', 'foundation')
    .neq('source_type', 'common');
  return count || 0;
}

async function getDatasetMismatches(supabase: any): Promise<number> {
  // Check for branded dataset with wrong type
  const { count: brandedWrong } = await supabase
    .from('food_objects')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('source_provider', 'usda')
    .eq('source_dataset', 'branded')
    .neq('source_type', 'branded');
  
  // Foundation already checked above
  const foundationWrong = await getFoundationStillBranded(supabase);
  
  // SR Legacy with wrong type
  const { count: srLegacyWrong } = await supabase
    .from('food_objects')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('source_provider', 'usda')
    .eq('source_dataset', 'sr_legacy')
    .neq('source_type', 'common');
  
  // Survey with wrong type
  const { count: surveyWrong } = await supabase
    .from('food_objects')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('source_provider', 'usda')
    .eq('source_dataset', 'survey')
    .neq('source_type', 'common');
  
  // FNDDS with wrong type (must be common)
  const { count: fnddsWrong } = await supabase
    .from('food_objects')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('source_provider', 'usda')
    .eq('source_dataset', 'fndds')
    .neq('source_type', 'common');
  
  return (brandedWrong || 0) + foundationWrong + (srLegacyWrong || 0) + (surveyWrong || 0) + (fnddsWrong || 0);
}

async function getTotalUsdaCount(supabase: any): Promise<number> {
  const { count } = await supabase
    .from('food_objects')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('source_provider', 'usda');
  return count || 0;
}

// ============================================================================
// CLI Parsing
// ============================================================================

function parseArgs(args: string[]): HealthCheckOptions {
  let dataset = '';
  let checkpoint: number | undefined;
  let window = 10000;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dataset' && args[i + 1]) {
      dataset = args[++i];
    } else if (arg === '--checkpoint' && args[i + 1]) {
      checkpoint = parseInt(args[++i], 10);
    } else if (arg === '--window' && args[i + 1]) {
      window = parseInt(args[++i], 10);
    }
  }
  
  if (!dataset) {
    console.error('Usage: npx tsx scripts/usda/healthCheck.ts --dataset <branded|foundation|sr_legacy|survey|all>');
    console.error('Options:');
    console.error('  --dataset <name>      Dataset to check (required)');
    console.error('  --checkpoint <number> Override checkpoint value');
    console.error('  --window <number>     Window size for progress check (default: 10000)');
    process.exit(1);
  }
  
  return { dataset, checkpoint, window };
}

// ============================================================================
// Dashboard Formatting
// ============================================================================

/** Safe number formatting; treats null/undefined/NaN as 0. */
function formatNumber(n: number | null | undefined): string {
  const num = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return num.toLocaleString().padStart(12);
}

/** Pad a value to width; safely handles undefined, null, or number. */
function pad(value: string | number | null | undefined, width: number): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s.padStart(width);
}

function printDivider(char = '─', length = 60) {
  console.log(char.repeat(length));
}

function printHeader(title: string) {
  console.log();
  printDivider('═');
  console.log(`  ${title}`);
  printDivider('═');
}

function printSection(title: string) {
  console.log();
  console.log(`  ${title}`);
  printDivider('─');
}

function printRow(label: string, value: string | number | null | undefined, status?: string) {
  const valueStr = typeof value === 'number' ? formatNumber(value) : pad(value, 12);
  const statusStr = status ? `  ${status}` : '';
  console.log(`  ${(label ?? '').padEnd(30)} ${valueStr}${statusStr}`);
}

function getStatusIcon(value: number, goodValue: number = 0): string {
  return value === goodValue ? '✓' : '⚠';
}

/** Self-check: ensure formatting never throws on undefined/null (regression guard). */
function runFormattingSelfCheck(): void {
  const values: (string | number | null | undefined)[] = [undefined, null, 0, 12345, '', 'abc'];
  for (const v of values) {
    formatNumber(v as number);
    pad(v, 12);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  runFormattingSelfCheck();

  const options = parseArgs(process.argv.slice(2));
  
  // Initialize Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const datasetsToCheck = options.dataset === 'all' 
    ? ['branded', 'foundation', 'sr_legacy', 'survey', 'fndds']
    : [options.dataset];
  
  printHeader('USDA INGESTION HEALTH CHECK');
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`  Dataset:   ${options.dataset}`);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Database Counts
  // ─────────────────────────────────────────────────────────────────────────
  printSection('DATABASE COUNTS');
  
  const counts = await getDatasetCounts(supabase);
  const totalUsda = await getTotalUsdaCount(supabase);
  
  printRow('Total USDA rows', totalUsda);
  printRow('  branded', counts.get('branded') || 0);
  printRow('  foundation', counts.get('foundation') || 0);
  printRow('  sr_legacy', counts.get('sr_legacy') || 0);
  printRow('  survey', counts.get('survey') || 0);
  printRow('  fndds', counts.get('fndds') || 0);
  printRow('  untagged', counts.get('untagged') || 0, getStatusIcon(counts.get('untagged') || 0));
  
  // ─────────────────────────────────────────────────────────────────────────
  // Health Checks
  // ─────────────────────────────────────────────────────────────────────────
  printSection('HEALTH CHECKS');
  
  const foundationStillBranded = await getFoundationStillBranded(supabase);
  const datasetMismatches = await getDatasetMismatches(supabase);
  const nonNumericCount = await getNonNumericCount(supabase);
  
  printRow('Foundation still branded', foundationStillBranded, getStatusIcon(foundationStillBranded));
  printRow('Dataset/type mismatches', datasetMismatches, getStatusIcon(datasetMismatches));
  printRow('Non-numeric source_ids', nonNumericCount === -1 ? 'Check SQL' : nonNumericCount, 
           nonNumericCount === -1 ? '?' : getStatusIcon(nonNumericCount));
  
  // ─────────────────────────────────────────────────────────────────────────
  // Per-Dataset Checkpoint Status
  // ─────────────────────────────────────────────────────────────────────────
  for (const dataset of datasetsToCheck) {
    printSection(`CHECKPOINT: ${dataset.toUpperCase()}`);
    
    const checkpoint = loadCheckpoint(dataset);
    let checkpointValue: number | null = options.checkpoint ?? null;
    if (checkpointValue == null && checkpoint) {
      const fdcId = (checkpoint as { lastSuccessfulFdcId?: string }).lastSuccessfulFdcId;
      const sourceId = (checkpoint as { lastSuccessfulSourceId?: string }).lastSuccessfulSourceId;
      if (fdcId) checkpointValue = parseInt(fdcId, 10);
      else if (sourceId?.startsWith('fndds_')) checkpointValue = parseInt(sourceId.replace(/^fndds_/, ''), 10);
    }
    
    if (checkpoint) {
      // FNDDS checkpoint uses lastSuccessfulSourceId, errors, lastRunAt
      const lastSuccessId = (checkpoint as { lastSuccessfulFdcId?: string; lastSuccessfulSourceId?: string }).lastSuccessfulFdcId
        ?? (checkpoint as { lastSuccessfulSourceId?: string }).lastSuccessfulSourceId ?? 'N/A';
      const failed = (checkpoint as { failed?: number; errors?: number }).failed ?? (checkpoint as { errors?: number }).errors ?? 0;
      const ts = (checkpoint as { timestamp?: string; lastRunAt?: string }).timestamp ?? (checkpoint as { lastRunAt?: string }).lastRunAt ?? 'N/A';
      printRow('Last FDC ID', checkpoint.lastFdcId ?? 'N/A');
      printRow('Last Successful FDC ID', lastSuccessId);
      printRow('Processed', checkpoint.processed ?? 0);
      printRow('Inserted', checkpoint.inserted ?? 0);
      printRow('Skipped', checkpoint.skipped ?? 0);
      printRow('Failed', failed);
      printRow('Timestamp', ts);
    } else {
      printRow('Status', 'No checkpoint file found');
    }
    
    // Progress window info (numeric source_id datasets only; FNDDS uses source_id fndds_<n>)
    if (checkpointValue && dataset !== 'fndds') {
      const windowStart = checkpointValue - options.window;
      console.log();
      console.log(`  Progress Window (for SQL check):`);
      console.log(`    Checkpoint: ${checkpointValue.toLocaleString()}`);
      console.log(`    Window:     ${windowStart.toLocaleString()} - ${checkpointValue.toLocaleString()}`);
      console.log(`    Run in Supabase SQL Editor:`);
      console.log(`    SELECT count(*) FROM food_objects`);
      console.log(`    WHERE source_provider='usda' AND source_dataset='${dataset}'`);
      console.log(`      AND source_id ~ '^[0-9]+$'`);
      console.log(`      AND source_id::bigint BETWEEN ${windowStart} AND ${checkpointValue};`);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  printSection('SUMMARY');
  
  const issues: string[] = [];
  if ((counts.get('untagged') || 0) > 0) issues.push(`${counts.get('untagged')} untagged USDA rows`);
  if (foundationStillBranded > 0) issues.push(`${foundationStillBranded} foundation rows still branded`);
  if (datasetMismatches > 0) issues.push(`${datasetMismatches} dataset/type mismatches`);
  
  if (issues.length === 0) {
    console.log('  ✓ All health checks passed');
  } else {
    console.log('  ⚠ Issues found:');
    for (const issue of issues) {
      console.log(`    - ${issue}`);
    }
  }
  
  printDivider('═');
  console.log();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
