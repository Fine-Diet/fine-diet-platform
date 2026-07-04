/**
 * Integrative Care — data adapter
 *
 * All reads and writes for Integrative Care product records and compositions
 * go through this module. The UI and API routes call these functions only —
 * never Supabase or the filesystem directly.
 *
 * Persistence:
 *   Product record:  site_content  key = product:integrative-care:{slug}
 *   Composition:     site_content  key = composition:integrative-care:{slug}
 *   status field:    'draft' | 'published'  (matches site_content.status column)
 *
 * Read strategy (both operations):
 *   1. Try Supabase (server-only)
 *   2. Fall back to JSON files for local dev / seed data
 *
 * Write strategy:
 *   Supabase only. JSON files are read-only seed/dev fallback.
 */

import { z } from 'zod';
import type { PageComposition } from './modules/types';
import { pageCompositionSchema, MODULE_CONTENT_SCHEMAS } from './modules/schema';
import type { ModuleInstance, ModuleTypeKey } from './modules/types';
import { seoSocialFieldsSchema } from '@/lib/seo/seoSocialFields';

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const integrativeCareProductSchema = z.object({
  productSlug: z.string(),
  category: z.literal('integrative-care'),
  templateFamily: z.literal('integrative-care'),
  status: z.enum(['draft', 'published']),
  title: z.string(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  sortOrder: z.number().int(),
  /**
   * Optional SEO / social preview override block. Display metadata only.
   * Merged into `getSeoForRoute` as a `pageOverride` (highest precedence) when
   * the public /integrative-care surface renders. Additive/optional so
   * existing product records remain valid without a migration.
   */
  seo: seoSocialFieldsSchema,
});

export type IntegrativeCareProduct = z.infer<typeof integrativeCareProductSchema>;

// ─── Key helpers ─────────────────────────────────────────────────────────────

export function productKey(slug: string) {
  return `product:integrative-care:${slug}` as const;
}

export function compositionKey(slug: string) {
  return `composition:integrative-care:${slug}` as const;
}

// ─── Read: product record ─────────────────────────────────────────────────────

/**
 * Load one product record by slug. Tries Supabase, falls back to JSON.
 * Pass status = 'draft' to load drafts (admin preview only).
 */
export async function getIntegrativeCareProductRecord(
  slug: string,
  status: 'draft' | 'published' = 'published',
): Promise<IntegrativeCareProduct | null> {
  const safe = slug.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe || safe !== slug) return null;

  // ── Supabase ──
  try {
    const { supabaseAdmin } = await import('./supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', productKey(safe))
      .eq('status', status)
      .maybeSingle();

    if (!error && data?.data) {
      const result = integrativeCareProductSchema.safeParse(data.data);
      if (result.success) return result.data;
    }
  } catch {
    // Supabase unavailable — fall through to JSON
  }

  // ── JSON fallback (local dev / seed) ──
  try {
    const record = await import(`@/data/products/integrative-care/${safe}.json`);
    const result = integrativeCareProductSchema.safeParse(record.default);
    if (!result.success) return null;
    if (result.data.status !== status) return null;
    return result.data;
  } catch {
    return null;
  }
}

// ─── Read: product list ───────────────────────────────────────────────────────

/**
 * List all Integrative Care product records. Admin use: returns both
 * draft and published. Public use: pass publishedOnly = true.
 */
export async function listIntegrativeCareProducts(
  publishedOnly = false,
): Promise<IntegrativeCareProduct[]> {
  // Collect from both sources, deduplicate by slug (Supabase wins over JSON).
  // We always read both so that JSON-only products (not yet seeded) appear
  // alongside Supabase-only products (created via admin UI).
  const bySlug = new Map<string, IntegrativeCareProduct>();

  // ── JSON seed (loaded first so Supabase can overwrite) ──
  try {
    const index = await import('@/data/products/integrative-care/index.json');
    const entries = index.default as Array<{ slug: string; status: string; sortOrder: number }>;
    const filtered = publishedOnly
      ? entries.filter((e) => e.status === 'published')
      : entries;

    for (const entry of filtered) {
      try {
        const rec = await import(`@/data/products/integrative-care/${entry.slug}.json`);
        const parsed = integrativeCareProductSchema.safeParse(rec.default);
        if (parsed.success) bySlug.set(parsed.data.productSlug, parsed.data);
      } catch {
        // Skip missing files
      }
    }
  } catch {
    // No index file — JSON source unavailable
  }

  // ── Supabase (overwrites JSON entries for the same slug) ──
  try {
    const { supabaseAdmin } = await import('./supabaseServerClient');
    let query = supabaseAdmin
      .from('site_content')
      .select('data, status')
      .like('key', 'product:integrative-care:%')
      .order('key');

    if (publishedOnly) {
      query = query.eq('status', 'published');
    }

    const { data, error } = await query;

    if (!error && data) {
      for (const row of data) {
        const parsed = integrativeCareProductSchema.safeParse(row.data);
        if (parsed.success) bySlug.set(parsed.data.productSlug, parsed.data);
      }
    }
  } catch {
    // Supabase unavailable — JSON results stand
  }

  return Array.from(bySlug.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

// ─── Write: product record ────────────────────────────────────────────────────

/**
 * Create or update a product record in Supabase.
 * Always writes to the status specified in the record.
 */
export async function upsertIntegrativeCareProduct(
  record: IntegrativeCareProduct,
): Promise<{ success: boolean; error?: string }> {
  const validated = integrativeCareProductSchema.safeParse(record);
  if (!validated.success) {
    return { success: false, error: validated.error.message };
  }

  try {
    const { supabaseAdmin } = await import('./supabaseServerClient');
    const { error } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key: productKey(record.productSlug),
          status: record.status,
          data: validated.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key,status' },
      );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Supabase unavailable',
    };
  }
}

// ─── Read: composition ────────────────────────────────────────────────────────

/**
 * Load the composition for a product. Tries Supabase, falls back to JSON.
 */
export async function getIntegrativeCareComposition(
  slug: string,
  status: 'draft' | 'published' = 'published',
): Promise<PageComposition | null> {
  const safe = slug.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe || safe !== slug) return null;

  // ── Supabase ──
  try {
    const { supabaseAdmin } = await import('./supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', compositionKey(safe))
      .eq('status', status)
      .maybeSingle();

    if (!error && data?.data) {
      return validateComposition(data.data);
    }
  } catch {
    // Fall through
  }

  // ── JSON fallback (bundled static import — works on Vercel) ──
  try {
    const file = await import(`@/data/compositions/integrative-care--${safe}.json`);
    return validateComposition(file.default);
  } catch {
    return null;
  }
}

// ─── Write: composition ───────────────────────────────────────────────────────

/**
 * Save a composition to Supabase under composition:integrative-care:{slug}.
 */
export async function upsertIntegrativeCareComposition(
  slug: string,
  composition: PageComposition,
  status: 'draft' | 'published' = 'draft',
): Promise<{ success: boolean; error?: string }> {
  const safe = slug.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe || safe !== slug) return { success: false, error: 'Invalid slug' };

  try {
    const { supabaseAdmin } = await import('./supabaseServerClient');
    const { error } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key: compositionKey(safe),
          status,
          data: composition,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key,status' },
      );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Supabase unavailable',
    };
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function validateComposition(raw: unknown): PageComposition | null {
  const topLevel = pageCompositionSchema.safeParse(raw);
  if (!topLevel.success) return null;

  const { key, version, modules: looseModules } = topLevel.data;
  const validatedModules: ModuleInstance[] = [];

  for (const mod of looseModules) {
    const contentSchema = MODULE_CONTENT_SCHEMAS[mod.type as ModuleTypeKey];
    if (!contentSchema) continue;
    const result = contentSchema.safeParse(mod.content);
    if (!result.success) continue;
    validatedModules.push({
      id: mod.id,
      type: mod.type as ModuleTypeKey,
      content: result.data,
    } as ModuleInstance);
  }

  return { key, version, modules: validatedModules };
}
