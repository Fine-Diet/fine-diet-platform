/**
 * One-time seed: Integrative Care product record + composition → site_content
 *
 * Reads from:
 *   data/products/integrative-care/index.json
 *   data/products/integrative-care/{slug}.json
 *   data/compositions/integrative-care--{slug}.json
 *
 * Writes to site_content as status = 'published'.
 * Safe to re-run — uses upsert (onConflict: key,status).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-integrative-care.mjs
 *
 * Or with .env.local loaded:
 *   npx dotenv -e .env.local -- node scripts/seed-integrative-care.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.warn(`  ⚠  Could not read ${filePath}: ${err.message}`);
    return null;
  }
}

async function upsert(key, status, data) {
  const { error } = await supabase
    .from('site_content')
    .upsert(
      { key, status, data, updated_at: new Date().toISOString() },
      { onConflict: 'key,status' },
    );
  if (error) throw new Error(`Supabase error for ${key}: ${error.message}`);
}

async function main() {
  console.log('Seeding Integrative Care products into site_content...\n');

  const indexPath = join(root, 'data', 'products', 'integrative-care', 'index.json');
  const index = readJson(indexPath);
  if (!index) { console.error('Cannot read product index. Aborting.'); process.exit(1); }

  for (const entry of index) {
    const { slug } = entry;
    console.log(`→ ${slug}`);

    // Product record
    const recordPath = join(root, 'data', 'products', 'integrative-care', `${slug}.json`);
    const record = readJson(recordPath);
    if (record) {
      const productKey = `product:integrative-care:${slug}`;
      await upsert(productKey, record.status ?? 'published', record);
      console.log(`  ✓ product record  (${productKey})`);
    }

    // Composition
    const compPath = join(root, 'data', 'compositions', `integrative-care--${slug}.json`);
    const composition = readJson(compPath);
    if (composition) {
      const compKey = `composition:integrative-care:${slug}`;
      await upsert(compKey, 'published', composition);
      console.log(`  ✓ composition     (${compKey})`);
    }

    console.log('');
  }

  console.log('Seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
