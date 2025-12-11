/**
 * Export CMS Content from Supabase to JSON Fallback Files
 * 
 * This script exports content from Supabase's site_content table
 * into the JSON fallback files under data/.
 * 
 * Usage: npm run export-content
 * 
 * Requirements:
 * - SUPABASE_URL environment variable (or NEXT_PUBLIC_SUPABASE_URL as fallback)
 * - SUPABASE_SERVICE_ROLE_KEY environment variable
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  navigationContentSchema,
  homeContentSchema,
  footerContentSchema,
  waitlistContentSchema,
  globalContentSchema,
} from '../lib/contentValidators';

// Initialize Supabase client with server-side naming conventions
const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL environment variable.');
}

if (!supabaseKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
}

// Create Supabase admin client for this script
const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Content export target configuration
 */
interface ExportTarget {
  key: string;
  schema: z.ZodSchema<any>;
  fallbackPath: string;
}

const EXPORT_TARGETS: ExportTarget[] = [
  {
    key: 'navigation',
    schema: navigationContentSchema,
    fallbackPath: 'data/navigation.json',
  },
  {
    key: 'home',
    schema: homeContentSchema,
    fallbackPath: 'data/homeContent.json',
  },
  {
    key: 'footer',
    schema: footerContentSchema,
    fallbackPath: 'data/footerContent.json',
  },
  {
    key: 'waitlist',
    schema: waitlistContentSchema,
    fallbackPath: 'data/waitlistContent.json',
  },
  {
    key: 'global',
    schema: globalContentSchema,
    fallbackPath: 'data/globalContent.json',
  },
];

/**
 * Write data to a JSON file with pretty formatting
 */
function writeJsonFile(relativePath: string, data: unknown): void {
  const filePath = path.join(process.cwd(), relativePath);
  const dir = path.dirname(filePath);
  
  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Write pretty-printed JSON with 2-space indentation
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, json + '\n', 'utf8');
}

/**
 * Export a single content type from Supabase to JSON
 */
async function exportContent(target: ExportTarget): Promise<void> {
  try {
    console.log(`Fetching ${target.key} from Supabase...`);
    
    // Query Supabase for published content
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', target.key)
      .eq('status', 'published')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - content doesn't exist in Supabase
        console.warn(`  ⚠️  No content found for key="${target.key}" in Supabase. Skipping export.`);
        throw new Error('SKIPPED'); // Special error to track skipped items
      }
      throw error;
    }

    if (!data || !data.data) {
      console.warn(`  ⚠️  Content data is null for key="${target.key}". Skipping export.`);
      throw new Error('SKIPPED'); // Special error to track skipped items
    }

    // Validate data against schema
    console.log(`  Validating ${target.key} content...`);
    const validationResult = target.schema.safeParse(data.data);
    
    if (!validationResult.success) {
      console.error(`  ❌ Validation failed for ${target.key}:`, validationResult.error.format());
      throw new Error(`Validation failed for ${target.key}`);
    }

    // Write to JSON file
    console.log(`  Writing ${target.fallbackPath}...`);
    writeJsonFile(target.fallbackPath, validationResult.data);
    
    console.log(`  ✅ Exported ${target.key} → ${target.fallbackPath}`);
  } catch (error) {
    console.error(`  ❌ Failed to export ${target.key}:`, error instanceof Error ? error.message : error);
    throw error;
  }
}

/**
 * Export all content types from Supabase to JSON fallback files
 */
async function exportAll(): Promise<void> {
  console.log('🚀 Starting CMS content export from Supabase...\n');
  
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
  };

  for (const target of EXPORT_TARGETS) {
    try {
      await exportContent(target);
      results.success++;
    } catch (error) {
      if (error instanceof Error && error.message === 'SKIPPED') {
        results.skipped++;
      } else {
        results.failed++;
        // Continue with other exports even if one fails
        console.error(`Failed to export ${target.key}, continuing with other content...\n`);
      }
    }
  }

  console.log('\n📊 Export Summary:');
  console.log(`  ✅ Success: ${results.success}`);
  console.log(`  ⚠️  Skipped: ${results.skipped}`);
  console.log(`  ❌ Failed: ${results.failed}`);
  
  if (results.failed > 0) {
    console.log('\n⚠️  Some exports failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('\n✨ All content exported successfully!');
  }
}

// Run export
exportAll().catch((err) => {
  console.error('\n💥 Export script failed:', err);
  process.exit(1);
});

